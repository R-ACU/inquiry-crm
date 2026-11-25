/**
 * End-to-end tests of POST /api/v1/inquiries: the real route handler, the
 * real supabase-js client and the real SQL function, against the local
 * Supabase stand-in (PGlite with migrations and seed).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateApiKey } from "@/lib/domain/api-keys";
import { startMockSupabase, LOCAL_PUBLISHABLE_KEY, type MockSupabase } from "../../e2e/mock-supabase/server";
import { SEED } from "../support/pg-harness";

let mock: MockSupabase;
let POST: (request: Request) => Promise<Response>;
const key = generateApiKey();
let ip = 0;

beforeAll(async () => {
  mock = await startMockSupabase({ quiet: true });
  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_PUBLISHABLE_KEY = LOCAL_PUBLISHABLE_KEY;
  await mock.database.db.query(
    `insert into public.api_keys (name, key_prefix, key_hash, rate_limit_per_minute, created_by)
     values ('Website', $1, $2, 5, $3)`,
    [key.prefix, key.hash, SEED.owner],
  );
  ({ POST } = await import("@/app/api/v1/inquiries/route"));
});

afterAll(async () => {
  await mock.close();
});

const payload = {
  name: "Greta Sommer",
  email: "greta@post.example",
  title: "Gartenfest im Juli",
  message: "Wir planen ein Gartenfest.",
  eventDate: "2027-07-17",
  startTime: "15:00",
  guestCount: 45,
  budgetEur: 2000,
  source: "web_form",
};

function request(options: { body?: unknown; raw?: string; auth?: string | null; contentType?: string; ip?: string } = {}) {
  const headers: Record<string, string> = {
    "content-type": options.contentType ?? "application/json",
    "x-forwarded-for": options.ip ?? `203.0.113.${++ip}`,
  };
  if (options.auth !== null) headers.authorization = options.auth ?? `Bearer ${key.raw}`;
  return new Request("http://127.0.0.1:3210/api/v1/inquiries", {
    method: "POST",
    headers,
    body: options.raw ?? JSON.stringify(options.body ?? payload),
  });
}

async function errorCode(response: Response) {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

describe("POST /api/v1/inquiries", () => {
  it("creates an inquiry and returns 201 with its id", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { inquiryId: string; status: string } };
    expect(body.data.status).toBe("new");
    // No internal ids beyond the new inquiry (no contactId).
    expect(Object.keys(body.data).sort()).toEqual(["inquiryId", "status"]);

    const { rows } = await mock.database.db.query<{ title: string; budget_cents: number; source: string }>(
      `select title, budget_cents, source from public.inquiries where id = $1`,
      [body.data.inquiryId],
    );
    expect(rows[0]).toEqual({ title: "Gartenfest im Juli", budget_cents: 200000, source: "web_form" });
  });

  it("returns 401 without a key and with an unknown key", async () => {
    const missing = await POST(request({ auth: null }));
    expect(missing.status).toBe(401);
    expect(await errorCode(missing)).toBe("missing_api_key");

    const unknown = await POST(request({ auth: `Bearer ${generateApiKey().raw}` }));
    expect(unknown.status).toBe(401);
    expect(await errorCode(unknown)).toBe("invalid_api_key");
    expect(unknown.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("returns 415 for a non-JSON body", async () => {
    const response = await POST(request({ contentType: "text/plain" }));
    expect(response.status).toBe(415);
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await POST(request({ raw: "{not json" }));
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("invalid_json");
  });

  it("returns 422 with field details for invalid data", async () => {
    const response = await POST(request({ body: { ...payload, email: "nope", guestCount: 0 } }));
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { details: { field: string }[] } };
    expect(body.error.details.map((d) => d.field).sort()).toEqual(["email", "guestCount"]);
  });

  it("returns 413 when the body is larger than 16 KB, even without Content-Length", async () => {
    const huge = JSON.stringify({ ...payload, message: "x".repeat(20_000) });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(huge));
        controller.close();
      },
    });
    const response = await POST(
      new Request("http://127.0.0.1:3210/api/v1/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key.raw}`, "x-forwarded-for": "198.51.100.1" },
        body: stream,
        duplex: "half",
      } as RequestInit),
    );
    expect(response.status).toBe(413);
    expect(await errorCode(response)).toBe("payload_too_large");
  });

  it("enforces the per-key limit from the database with 429 and Retry-After", async () => {
    // The key allows 5 inquiries per minute; one was created above.
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const response = await POST(request({ body: { ...payload, email: `burst${i}@post.example` } }));
      statuses.push(response.status);
      if (response.status === 429) expect(response.headers.get("retry-after")).toBe("60");
    }
    expect(statuses.filter((s) => s === 201)).toHaveLength(4);
    expect(statuses.slice(-2)).toEqual([429, 429]);
  });

  it("throttles a single client address before touching the database", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) {
      statuses.push((await POST(request({ ip: "192.0.2.77", contentType: "text/plain" }))).status);
    }
    expect(statuses.slice(0, 60).every((s) => s === 415)).toBe(true);
    expect(statuses[60]).toBe(429);
  });

  it("intake with an existing customer e-mail does not impersonate the customer", async () => {
    // A fresh key, because the first one used up its per-minute limit above.
    const second = generateApiKey();
    await mock.database.db.query(
      `insert into public.api_keys (name, key_prefix, key_hash, created_by) values ('Formular 2', $1, $2, $3)`,
      [second.prefix, second.hash, SEED.owner],
    );
    const response = await POST(
      request({
        auth: `Bearer ${second.raw}`,
        body: { ...payload, email: "tobias.krueger@nordlicht-software.example", name: "Angreifer", phone: "0000 000" },
      }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: Record<string, string> };
    expect(Object.keys(body.data).sort()).toEqual(["inquiryId", "status"]);

    const { rows } = await mock.database.db.query(
      `select c.full_name, c.phone, i.matched_existing_contact, i.submitted_contact ->> 'name' as submitted_name
         from public.inquiries i join public.contacts c on c.id = i.contact_id where i.id = $1`,
      [body.data.inquiryId],
    );
    expect(rows[0]).toEqual({
      full_name: "Tobias Krüger",
      phone: "040 555 0101",
      matched_existing_contact: true,
      submitted_name: "Angreifer",
    });
  });
});
