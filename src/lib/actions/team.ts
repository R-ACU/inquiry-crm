"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateApiKey } from "@/lib/domain/api-keys";
import type { ActionResult } from "./result";
import { pick } from "@/lib/i18n";

const T = pick({
  de: {
    invalid: "Ungültige Eingabe.",
    lastOwner: "Es muss immer mindestens eine Inhaberin oder einen Inhaber geben.",
    ownerOnlyRoles: "Nur die Inhaberin oder der Inhaber kann Rollen ändern.",
    nameRequired: "Bitte einen Namen angeben.",
    nameTooLong: "Höchstens 80 Zeichen.",
    ownerOnlyKeys: "Nur die Inhaberin oder der Inhaber verwaltet API-Schlüssel.",
    invalidName: "Ungültiger Name.",
    keyNotCreated: "Der Schlüssel konnte nicht angelegt werden.",
    keyNotRevoked: "Der Schlüssel konnte nicht widerrufen werden.",
  },
  en: {
    invalid: "Invalid input.",
    lastOwner: "There must always be at least one owner.",
    ownerOnlyRoles: "Only the owner can change roles.",
    nameRequired: "Please enter a name.",
    nameTooLong: "80 characters at most.",
    ownerOnlyKeys: "Only the owner manages API keys.",
    invalidName: "Invalid name.",
    keyNotCreated: "The key could not be created.",
    keyNotRevoked: "The key could not be revoked.",
  },
});

export async function setMemberRole(userId: string, role: "owner" | "staff"): Promise<ActionResult> {
  await requireMember();
  const input = z.object({ userId: z.uuid(), role: z.enum(["owner", "staff"]) }).safeParse({ userId, role });
  if (!input.success) return { ok: false, error: T.invalid };

  // The database function checks that the caller is an owner and that the
  // last owner is not demoted. The UI check is only for convenience.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_member_role", { p_user_id: input.data.userId, p_role: input.data.role });
  if (error) {
    if (error.message?.includes("last owner")) {
      return { ok: false, error: T.lastOwner };
    }
    return { ok: false, error: T.ownerOnlyRoles };
  }

  revalidatePath("/team");
  return { ok: true };
}

const keyNameSchema = z.string().trim().min(1, T.nameRequired).max(80, T.nameTooLong);

/** Creates a key and returns the raw value once. Only its SHA-256 hash is stored. */
export async function createApiKey(name: string): Promise<ActionResult<{ key: string; prefix: string }>> {
  const member = await requireMember();
  if (member.role !== "owner") return { ok: false, error: T.ownerOnlyKeys };
  const parsed = keyNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? T.invalidName };

  const key = generateApiKey();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("api_keys")
    .insert({ name: parsed.data, key_prefix: key.prefix, key_hash: key.hash, rate_limit_per_minute: 20 });
  if (error) return { ok: false, error: T.keyNotCreated };

  revalidatePath("/team");
  return { ok: true, data: { key: key.raw, prefix: key.prefix } };
}

export async function revokeApiKey(id: string): Promise<ActionResult> {
  await requireMember();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: T.invalid };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null)
    .select("id");
  if (error || !data?.length) return { ok: false, error: T.keyNotRevoked };

  revalidatePath("/team");
  return { ok: true };
}
