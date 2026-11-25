"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateApiKey } from "@/lib/domain/api-keys";
import type { ActionResult } from "./result";

export async function setMemberRole(userId: string, role: "owner" | "staff"): Promise<ActionResult> {
  await requireMember();
  const input = z.object({ userId: z.uuid(), role: z.enum(["owner", "staff"]) }).safeParse({ userId, role });
  if (!input.success) return { ok: false, error: "Ungültige Eingabe." };

  // The database function checks that the caller is an owner and that the
  // last owner is not demoted. The UI check is only for convenience.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_member_role", { p_user_id: input.data.userId, p_role: input.data.role });
  if (error) {
    if (error.message?.includes("last owner")) {
      return { ok: false, error: "Es muss immer mindestens eine Inhaberin oder einen Inhaber geben." };
    }
    return { ok: false, error: "Nur die Inhaberin oder der Inhaber kann Rollen ändern." };
  }

  revalidatePath("/team");
  return { ok: true };
}

const keyNameSchema = z.string().trim().min(1, "Bitte einen Namen angeben.").max(80, "Höchstens 80 Zeichen.");

/** Creates a key and returns the raw value once. Only its SHA-256 hash is stored. */
export async function createApiKey(name: string): Promise<ActionResult<{ key: string; prefix: string }>> {
  const member = await requireMember();
  if (member.role !== "owner") return { ok: false, error: "Nur die Inhaberin oder der Inhaber verwaltet API-Schlüssel." };
  const parsed = keyNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültiger Name." };

  const key = generateApiKey();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("api_keys")
    .insert({ name: parsed.data, key_prefix: key.prefix, key_hash: key.hash, rate_limit_per_minute: 20 });
  if (error) return { ok: false, error: "Der Schlüssel konnte nicht angelegt werden." };

  revalidatePath("/team");
  return { ok: true, data: { key: key.raw, prefix: key.prefix } };
}

export async function revokeApiKey(id: string): Promise<ActionResult> {
  await requireMember();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Ungültige Eingabe." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "Der Schlüssel konnte nicht widerrufen werden." };

  revalidatePath("/team");
  return { ok: true };
}
