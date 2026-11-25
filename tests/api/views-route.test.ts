/**
 * GET /api/views/:view, which the client cache calls to refresh a view in
 * the background, and POST /api/auth/sign-out. Real route handlers, real
 * supabase-js and RLS against the local Supabase stand-in; only the Next.js
 * cookie store is a small fake.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { startMockSupabase, LOCAL_PUBLISHABLE_KEY, type MockSupabase } from "../../e2e/mock-supabase/server";
import { SEED, SEED_PASSWORD } from "../support/pg-harness";

const jar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => (value ? jar.set(name, value) : jar.delete(name)),
  }),
}));
vi.mock("next/server", () => ({ connection: async () => {} }));

let mock: MockSupabase;
let GET: typeof import("@/app/api/views/[view]/route").GET;
let signOut: typeof import("@/app/api/auth/sign-out/route").POST;
let createSupabaseServerClient: typeof import("@/lib/supabase/server").createSupabaseServerClient;

beforeAll(async () => {
  mock = await startMockSupabase({ quiet: true });
  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_PUBLISHABLE_KEY = LOCAL_PUBLISHABLE_KEY;
  ({ GET } = await import("@/app/api/views/[view]/route"));
  ({ POST: signOut } = await import("@/app/api/auth/sign-out/route"));
  ({ createSupabaseServerClient } = await import("@/lib/supabase/server"));
});

afterAll(async () => {
  await mock.close();
});

beforeEach(() => jar.clear());

/** Signs in through the same cookie-bound client the app uses, so the jar holds a real session. */
async function signInAs(email: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: SEED_PASSWORD });
  expect(error).toBeNull();
}

async function view(name: string) {
  const response = await GET(new Request(`http://127.0.0.1:3210/api/views/${name}`) as never, { params: Promise.resolve({ view: name }) });
  return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() };
}

/** What RLS lets this person see, straight from the database. */
async function visibleContactIds(email: string) {
  const client = createClient(mock.url, LOCAL_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password: SEED_PASSWORD });
  const { data } = await client.from("contacts").select("id");
  return (data ?? []).map((c) => c.id).sort();
}

describe("GET /api/views/:view", () => {
  it("answers unknown views with 404 and anonymous callers with 401", async () => {
    expect((await view("secrets")).status).toBe(404);
    expect((await view("contacts")).status).toBe(401);
    expect((await view("team")).status).toBe(401);
  });

  it("gives a staff member only what RLS allows, and no owner data", async () => {
    await signInAs("jonas@lindgruen.example");
    const contacts = await view("contacts");
    expect(contacts.status).toBe(200);
    expect(contacts.cache).toBe("private, no-store");
    const ids = (contacts.body.data as { id: string }[]).map((c) => c.id).sort();
    expect(ids).toEqual(await visibleContactIds("jonas@lindgruen.example"));
    expect(ids).not.toContain(SEED.contactOfMira);

    const overview = await view("overview");
    const inquiryIds = (overview.body.data.inquiries as { id: string }[]).map((i) => i.id);
    expect(inquiryIds).toContain(SEED.inquiryOfJonas);
    expect(inquiryIds).not.toContain(SEED.inquiryOfMira);

    expect((await view("team")).body.data).toBeNull();
    expect((await view("assignees")).body.data).toEqual([]);
  });

  it("gives the owner the team, the API keys and the people to filter by", async () => {
    await signInAs("lena@lindgruen.example");
    const team = (await view("team")).body.data as { team: { id: string }[]; keys: unknown[]; endpoint: string };
    expect(team.team.map((m) => m.id)).toEqual(expect.arrayContaining([SEED.owner, SEED.staffJonas, SEED.staffMira]));
    expect(Array.isArray(team.keys)).toBe(true);
    expect(team.endpoint).toMatch(/\/api\/v1\/inquiries$/);
    expect((await view("assignees")).body.data).toHaveLength(3);
  });
});

describe("POST /api/auth/sign-out", () => {
  function post(origin: string | null) {
    const headers: Record<string, string> = { host: "127.0.0.1:3210" };
    if (origin) headers.origin = origin;
    return signOut(new Request("http://127.0.0.1:3210/api/auth/sign-out", { method: "POST", headers }) as never);
  }

  it("refuses a post from another site and keeps the session", async () => {
    await signInAs("lena@lindgruen.example");
    const response = await post("https://evil.example");
    expect(response.status).toBe(403);
    expect((await view("contacts")).status).toBe(200);
  });

  it("ends the session and sends the browser to /login with a full page load", async () => {
    await signInAs("lena@lindgruen.example");
    const response = await post("http://127.0.0.1:3210");
    expect(response.status).toBe(303);
    // Relative, so the browser stays on the host it posted to (CSP form-action 'self').
    expect(response.headers.get("location")).toBe("/login");
    expect([...jar.keys()].filter((name) => name.startsWith("sb-"))).toEqual([]);
    expect((await view("contacts")).status).toBe(401);
  });
});
