"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { INQUIRY_STATUSES, type InquiryStatus } from "@/lib/domain/status";
import { AssistantError, assistantFromEnv } from "@/lib/ai/assistant";
import type { ActionResult } from "./result";
import { pick } from "@/lib/i18n";

const T = pick({
  de: {
    invalid: "Ungültige Eingabe.",
    statusNotSaved: "Der Status konnte nicht gespeichert werden.",
    noAccessInquiry: "Diese Anfrage gibt es nicht oder du darfst sie nicht ändern.",
    ownerOnlyAssign: "Nur die Inhaberin oder der Inhaber kann Anfragen zuweisen.",
    assignmentNotSaved: "Die Zuweisung konnte nicht gespeichert werden.",
    noInquiry: "Diese Anfrage gibt es nicht.",
    noteEmpty: "Die Notiz ist leer.",
    noteTooLong: "Höchstens 4.000 Zeichen.",
    noteNotSaved: "Die Notiz konnte nicht gespeichert werden.",
    dailyLimit: "Das Tageskontingent für KI-Entwürfe ist aufgebraucht. Morgen geht es wieder.",
    tooManyDrafts: "Zu viele Entwürfe in kurzer Zeit. Bitte in ein paar Minuten erneut versuchen.",
    cannotSee: "Diese Anfrage gibt es nicht oder du darfst sie nicht sehen.",
    unknownContact: "Unbekannt",
    notConfigured: "Der KI-Assistent ist nicht eingerichtet.",
    refused: "Die KI hat diese Anfrage nicht bearbeitet. Bitte selbst zusammenfassen.",
    invalidOutput: "Die Antwort der KI war unbrauchbar und wurde verworfen. Bitte erneut versuchen.",
    upstream: "Die KI ist gerade nicht erreichbar. Bitte später erneut versuchen.",
    draftFailed: "Der Entwurf konnte nicht erstellt werden.",
    draftNotSaved: "Der Entwurf konnte nicht gespeichert werden.",
    draftDecided: "Der Entwurf wurde schon entschieden oder ist nicht mehr verfügbar.",
  },
  en: {
    invalid: "Invalid input.",
    statusNotSaved: "The status could not be saved.",
    noAccessInquiry: "This inquiry does not exist or you may not change it.",
    ownerOnlyAssign: "Only the owner can assign inquiries.",
    assignmentNotSaved: "The assignment could not be saved.",
    noInquiry: "This inquiry does not exist.",
    noteEmpty: "The note is empty.",
    noteTooLong: "4,000 characters at most.",
    noteNotSaved: "The note could not be saved.",
    dailyLimit: "The daily quota for AI drafts is used up. It works again tomorrow.",
    tooManyDrafts: "Too many drafts in a short time. Please try again in a few minutes.",
    cannotSee: "This inquiry does not exist or you may not see it.",
    unknownContact: "Unknown",
    notConfigured: "The AI assistant is not set up.",
    refused: "The AI did not process this inquiry. Please summarise it yourself.",
    invalidOutput: "The AI's answer was unusable and has been discarded. Please try again.",
    upstream: "The AI is not available right now. Please try again later.",
    draftFailed: "The draft could not be created.",
    draftNotSaved: "The draft could not be saved.",
    draftDecided: "The draft has already been decided or is no longer available.",
  },
});

/*
 * Server Actions are public HTTP endpoints. Each one re-checks the session,
 * validates its input with Zod and then writes with the user's own Supabase
 * session, so RLS has the final word on what may change.
 */

const uuid = z.uuid();

function failure(message: string): ActionResult<never> {
  return { ok: false, error: message };
}

export async function moveInquiry(inquiryId: string, status: InquiryStatus): Promise<ActionResult> {
  await requireMember();
  const input = z.object({ inquiryId: uuid, status: z.enum(INQUIRY_STATUSES) }).safeParse({ inquiryId, status });
  if (!input.success) return failure(T.invalid);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inquiries")
    .update({ status: input.data.status })
    .eq("id", input.data.inquiryId)
    .select("id");
  if (error) return failure(T.statusNotSaved);
  if (!data?.length) return failure(T.noAccessInquiry);

  revalidatePath(`/inquiries/${input.data.inquiryId}`);
  return { ok: true };
}

export async function assignInquiry(inquiryId: string, assigneeId: string | null): Promise<ActionResult> {
  const member = await requireMember();
  if (member.role !== "owner") return failure(T.ownerOnlyAssign);
  const input = z.object({ inquiryId: uuid, assigneeId: uuid.nullable() }).safeParse({ inquiryId, assigneeId });
  if (!input.success) return failure(T.invalid);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inquiries")
    .update({ assigned_to: input.data.assigneeId })
    .eq("id", input.data.inquiryId)
    .select("id");
  if (error) return failure(T.assignmentNotSaved);
  if (!data?.length) return failure(T.noInquiry);

  revalidatePath(`/inquiries/${input.data.inquiryId}`);
  revalidatePath("/");
  return { ok: true };
}

const noteSchema = z.object({
  inquiryId: uuid,
  body: z.string().trim().min(1, T.noteEmpty).max(4000, T.noteTooLong),
});

export async function addNote(inquiryId: string, body: string): Promise<ActionResult> {
  await requireMember();
  const input = noteSchema.safeParse({ inquiryId, body });
  if (!input.success) return failure(input.error.issues[0]?.message ?? T.invalid);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("inquiry_notes").insert({ inquiry_id: input.data.inquiryId, body: input.data.body });
  if (error) return failure(T.noteNotSaved);

  revalidatePath(`/inquiries/${input.data.inquiryId}`);
  return { ok: true };
}

export async function requestDraft(inquiryId: string): Promise<ActionResult> {
  await requireMember();
  if (!uuid.safeParse(inquiryId).success) return failure(T.invalid);

  const supabase = await createSupabaseServerClient();
  // Reserve before calling the model. The database counts six drafts per
  // person in ten minutes and a daily limit for the whole business, so the
  // limits hold across serverless instances and a refused request costs nothing.
  const reservation = await supabase.rpc("reserve_ai_draft", { p_inquiry_id: inquiryId });
  if (reservation.error) {
    if (reservation.error.code === "PT429") {
      return failure(
        reservation.error.message.includes("daily")
          ? T.dailyLimit
          : T.tooManyDrafts,
      );
    }
    return failure(T.cannotSee);
  }

  // Loaded with the user's session: the model only ever sees inquiries the user may see.
  const { data: inquiry } = await supabase
    .from("inquiries")
    .select(
      "id, title, message, event_type, event_date, start_time, end_time, guest_count, budget_cents, location, contact:contacts(full_name, company)",
    )
    .eq("id", inquiryId)
    .maybeSingle();
  if (!inquiry) return failure(T.cannotSee);

  let draft;
  try {
    draft = await assistantFromEnv().draft({
      ...inquiry,
      contact_name: inquiry.contact?.full_name ?? T.unknownContact,
      company: inquiry.contact?.company ?? null,
    });
  } catch (error) {
    if (error instanceof AssistantError) {
      const messages: Record<AssistantError["code"], string> = {
        not_configured: T.notConfigured,
        refused: T.refused,
        invalid_output: T.invalidOutput,
        upstream: T.upstream,
      };
      return failure(messages[error.code]);
    }
    console.error("draft generation failed");
    return failure(T.draftFailed);
  }

  const { error } = await supabase.from("ai_drafts").insert({
    inquiry_id: inquiry.id,
    summary: draft.summary,
    questions: draft.questions,
    suggested_event_type: draft.suggestedEventType,
    model: draft.model,
  });
  if (error) return failure(T.draftNotSaved);

  revalidatePath(`/inquiries/${inquiry.id}`);
  return { ok: true };
}

export async function acceptDraft(draftId: string, inquiryId: string): Promise<ActionResult> {
  await requireMember();
  if (!uuid.safeParse(draftId).success || !uuid.safeParse(inquiryId).success) return failure(T.invalid);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("accept_ai_draft", { p_draft_id: draftId });
  if (error) return failure(T.draftDecided);

  revalidatePath(`/inquiries/${inquiryId}`);
  return { ok: true };
}

export async function discardDraft(draftId: string, inquiryId: string): Promise<ActionResult> {
  await requireMember();
  if (!uuid.safeParse(draftId).success || !uuid.safeParse(inquiryId).success) return failure(T.invalid);

  // Decisions go through a database function that records the caller and
  // the database time itself; the table has no UPDATE privilege.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("discard_ai_draft", { p_draft_id: draftId });
  if (error) return failure(T.draftDecided);

  revalidatePath(`/inquiries/${inquiryId}`);
  return { ok: true };
}
