export class BodyTooLargeError extends Error {}

/**
 * Reads a request body as text and stops as soon as it exceeds maxBytes.
 * Does not trust Content-Length alone: a client can omit it or lie, so the
 * stream itself is counted.
 */
export async function readBodyWithLimit(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError();
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

/**
 * Client address for throttling. On Vercel the first X-Forwarded-For entry
 * is set by the platform. Behind other proxies this header can be spoofed,
 * which is why the binding limit is per API key in the database.
 */
export function clientAddress(request: Request): string {
  return clientAddressFrom(request.headers);
}

export function clientAddressFrom(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 100);
  return (headers.get("x-real-ip") ?? "unknown").slice(0, 100);
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export function apiError(
  status: number,
  code: string,
  message: string,
  options: { details?: unknown; headers?: Record<string, string> } = {},
): Response {
  const body: ApiErrorBody = { error: { code, message, ...(options.details ? { details: options.details } : {}) } };
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...options.headers } });
}
