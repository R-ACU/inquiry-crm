import { readBearerKey } from "@/lib/domain/api-keys";
import { describeIssues, intakeSchema, MAX_INTAKE_BODY_BYTES, toIngestPayload } from "@/lib/domain/intake";
import { SlidingWindowLimiter } from "@/lib/domain/rate-limit";
import { apiError, BodyTooLargeError, clientAddress, readBodyWithLimit } from "@/lib/http";
import { createSupabaseAnonClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/inquiries
 *
 * Intake for web forms and other systems. Order of checks, cheapest first:
 * per-client throttle, content type, body size, API key format, JSON,
 * schema. Only then does the database see the request, where
 * public.ingest_inquiry verifies the hashed key, applies the per-key rate
 * limit and writes the rows.
 *
 * Errors: { "error": { "code", "message", "details"? } }
 *   401 missing_api_key | invalid_api_key
 *   413 payload_too_large
 *   415 unsupported_media_type
 *   400 invalid_json
 *   422 validation_failed
 *   429 rate_limited (with Retry-After)
 *   500 internal_error
 */

const perClient = new SlidingWindowLimiter(60, 60_000);

const DB_VALIDATION_CODES = new Set(["22023", "22P02", "22007", "22008", "23514", "23502"]);

export async function POST(request: Request): Promise<Response> {
  const throttle = perClient.check(clientAddress(request));
  if (!throttle.allowed) {
    return apiError(429, "rate_limited", "Too many requests. Try again later.", {
      headers: { "retry-after": String(throttle.retryAfterSeconds) },
    });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(\s*;|$)/i.test(contentType)) {
    return apiError(415, "unsupported_media_type", "Send the body as application/json.");
  }

  let raw: string;
  try {
    raw = await readBodyWithLimit(request, MAX_INTAKE_BODY_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return apiError(413, "payload_too_large", `The body must not exceed ${MAX_INTAKE_BODY_BYTES} bytes.`);
    }
    throw error;
  }

  const authorization = request.headers.get("authorization");
  const apiKey = readBearerKey(authorization);
  if (!apiKey) {
    return apiError(401, authorization ? "invalid_api_key" : "missing_api_key", "Send a valid API key as 'Authorization: Bearer <key>'.", {
      headers: { "www-authenticate": "Bearer" },
    });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return apiError(400, "invalid_json", "The body is not valid JSON.");
  }

  const parsed = intakeSchema.safeParse(json);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Some fields are missing or invalid.", {
      details: describeIssues(parsed.error),
    });
  }

  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase.rpc("ingest_inquiry", {
    p_api_key: apiKey,
    p_payload: toIngestPayload(parsed.data),
  });

  if (error) {
    if (error.code === "PT401") {
      return apiError(401, "invalid_api_key", "The API key is unknown or revoked.", {
        headers: { "www-authenticate": "Bearer" },
      });
    }
    if (error.code === "PT429") {
      return apiError(429, "rate_limited", "The rate limit for this API key is reached.", {
        headers: { "retry-after": "60" },
      });
    }
    if (error.code && DB_VALIDATION_CODES.has(error.code)) {
      return apiError(422, "validation_failed", "The database rejected a field value.");
    }
    // Log the code only. The payload holds personal data and stays out of logs.
    console.error("ingest_inquiry failed", { code: error.code });
    return apiError(500, "internal_error", "The inquiry could not be stored.");
  }

  // Only the new inquiry's id. Whether the e-mail matched an existing
  // contact, and that contact's id, stay inside the CRM.
  const result = data as { inquiry_id: string };
  return Response.json(
    { data: { inquiryId: result.inquiry_id, status: "new" } },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}
