/**
 * Contract tests for the local Supabase stand-in used by the preview and
 * the Playwright tests. They drive it with the real supabase-js client, so
 * a gap in the stand-in shows up here and not as a confusing UI failure.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { startMockSupabase, LOCAL_PUBLISHABLE_KEY, type MockSupabase } from "../../e2e/mock-supabase/server";
import { SEED, SEED_PASSWORD } from "../support/pg-harness";

let mock: MockSupabase;

beforeAll(async () => {
  mock = await startMockSupabase({ quiet: true });
});

afterAll(async () => {
  await mock.close();
});

function client() {
  return createClient<Database>(mock.url, LOCAL_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signedIn(email: string) {
  const supabase = client();
  const { error } = await supabase.auth.signInWithPassword({ email, password: SEED_PASSWORD });
  expect(error).toBeNull();
  return supabase;
}

describe("local Supabase stand-in", () => {
  it("rejects a wrong password", async () => {
    const { error } = await client().auth.signInWithPassword({ email: "jonas@lindgruen.example", password: "falsch" });
    expect(error?.code).toBe("invalid_credentials");
  });

  it("returns the user for a valid session and supports sign-out", async () => {
    const supabase = await signedIn("jonas@lindgruen.example");
    const { data } = await supabase.auth.getUser();
    expect(data.user?.id).toBe(SEED.staffJonas);
    const { error } = await supabase.auth.signOut();
    expect(error).toBeNull();
  });

  it("applies RLS to embedded selects", async () => {
    const supabase = await signedIn("jonas@lindgruen.example");
    const { data, error } = await supabase
      .from("inquiries")
      .select("id, title, status, contact:contacts(full_name), assignee:profiles!assigned_to(full_name)")
      .order("created_at", { ascending: false });
    expect(error).toBeNull();
    expect(data).toHaveLength(12);
    expect(data!.every((row) => row.assignee?.full_name === "Jonas Weber")).toBe(true);
    expect(data!.find((row) => row.id === SEED.inquiryOfJonas)?.contact?.full_name).toBe("Tobias Krüger");
  });

  it("returns 406 for single() on an invisible row", async () => {
    const supabase = await signedIn("jonas@lindgruen.example");
    const { data, error } = await supabase.from("inquiries").select("id").eq("id", SEED.inquiryOfMira).single();
    expect(data).toBeNull();
    expect(error?.code).toBe("PGRST116");
  });

  it("supports in, is and not filters", async () => {
    const supabase = await signedIn("lena@lindgruen.example");
    const open = await supabase.from("inquiries").select("id").in("status", ["new", "quoted"]);
    expect(open.data).toHaveLength(16);
    const unassigned = await supabase.from("inquiries").select("id").is("assigned_to", null);
    expect(unassigned.data).toHaveLength(6);
    const notWon = await supabase.from("inquiries").select("id").not("status", "eq", "won");
    expect(notWon.data).toHaveLength(21);
  });

  it("supports insert, update and rpc under RLS", async () => {
    const supabase = await signedIn("jonas@lindgruen.example");
    const note = await supabase
      .from("inquiry_notes")
      .insert({ inquiry_id: SEED.inquiryOfJonas, body: "Test über supabase-js" })
      .select("id, author_id")
      .single();
    expect(note.error).toBeNull();
    expect(note.data?.author_id).toBe(SEED.staffJonas);

    const update = await supabase.from("inquiries").update({ status: "lost" }).eq("id", SEED.inquiryOfMira).select("id");
    expect(update.data).toEqual([]);

    const rpc = await supabase.rpc("set_member_role", { p_user_id: SEED.staffJonas, p_role: "owner" });
    expect(rpc.error?.code).toBe("42501");
  });

  it("does not let anon read tables", async () => {
    const { error } = await client().from("contacts").select("id");
    expect(error?.code).toBe("42501");
  });
});
