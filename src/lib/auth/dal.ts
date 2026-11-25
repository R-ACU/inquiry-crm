import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Role = "owner" | "staff";

export interface Member {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

/**
 * Data Access Layer entry point: verifies the session with Supabase Auth
 * (getClaims checks the JWT signature, or asks the Auth server for
 * symmetric keys) and loads the member profile. Cached per request.
 *
 * The role read here only shapes the UI. Every query and mutation is still
 * checked by RLS in Postgres.
 */
export const getMember = cache(async (): Promise<Member | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;

  return {
    id: profile.id,
    email: typeof data.claims.email === "string" ? data.claims.email : "",
    fullName: profile.full_name,
    role: profile.role,
  };
});

export async function requireMember(): Promise<Member> {
  const member = await getMember();
  if (!member) redirect("/login");
  return member;
}
