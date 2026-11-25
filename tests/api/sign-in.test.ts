/**
 * The sign-in Server Action against the local Supabase stand-in. Next.js
 * request APIs (headers, cookies, redirect) are replaced by small fakes;
 * the action, supabase-js and the SQL throttle functions are the real ones.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startMockSupabase, LOCAL_PUBLISHABLE_KEY, type MockSupabase } from "../../e2e/mock-supabase/server";
import { SEED_PASSWORD } from "../support/pg-harness";

const request = vi.hoisted(() => ({ ip: "198.51.100.10", cookies: new Map<string, string>() }));

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": request.ip }),
  cookies: async () => ({
    getAll: () => [...request.cookies].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => request.cookies.set(name, value),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
  },
}));
vi.mock("next/server", () => ({ connection: async () => {} }));

let mock: MockSupabase;
let signIn: typeof import("@/lib/actions/auth").signIn;

beforeAll(async () => {
  mock = await startMockSupabase({ quiet: true });
  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_PUBLISHABLE_KEY = LOCAL_PUBLISHABLE_KEY;
  ({ signIn } = await import("@/lib/actions/auth"));
});

afterAll(async () => {
  await mock.close();
});

beforeEach(() => {
  request.cookies.clear();
});

function form(email: string, password: string) {
  const data = new FormData();
  data.set("email", email);
  data.set("password", password);
  return data;
}

async function attempt(email: string, password: string) {
  try {
    return await signIn({ error: null, email: "" }, form(email, password));
  } catch (error) {
    if (error instanceof RedirectSignal) return { redirectedTo: error.to };
    throw error;
  }
}

describe("signIn throttle", () => {
  it("signs in with the right password", async () => {
    request.ip = "198.51.100.10";
    expect(await attempt("jonas@lindgruen.example", SEED_PASSWORD)).toEqual({ redirectedTo: "/" });
  });

  it("locks an account after five wrong passwords, even for the right one", async () => {
    request.ip = "198.51.100.11";
    for (let i = 0; i < 5; i += 1) {
      expect(await attempt("jonas@lindgruen.example", "falsch")).toMatchObject({ error: "E-Mail-Adresse oder Passwort ist falsch." });
    }
    // From another address too: the limit is per account, not per server address.
    request.ip = "198.51.100.12";
    expect(await attempt("jonas@lindgruen.example", SEED_PASSWORD)).toMatchObject({
      error: "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.",
    });
    // Other people sign in as usual; one attacker does not lock out the whole team.
    expect(await attempt("mira@lindgruen.example", SEED_PASSWORD)).toEqual({ redirectedTo: "/" });
  });

  it("treats unknown addresses the same way, so the limit reveals no accounts", async () => {
    request.ip = "198.51.100.13";
    for (let i = 0; i < 5; i += 1) await attempt("niemand@lindgruen.example", "falsch");
    expect(await attempt("niemand@lindgruen.example", "falsch")).toMatchObject({
      error: "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.",
    });
  });

  it("limits one client address across many accounts", async () => {
    request.ip = "203.0.113.50";
    for (let i = 0; i < 20; i += 1) await attempt(`raten${i}@post.example`, "falsch");
    expect(await attempt("lena@lindgruen.example", SEED_PASSWORD)).toMatchObject({
      error: "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.",
    });
    request.ip = "203.0.113.51";
    expect(await attempt("lena@lindgruen.example", SEED_PASSWORD)).toEqual({ redirectedTo: "/" });
  });
});
