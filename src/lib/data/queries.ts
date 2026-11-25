import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Read queries. They all run with the signed-in user's session, so the
 * result is whatever RLS lets this user see. None of them takes a user id.
 */

export const BOARD_SELECT =
  "id, title, status, source, event_type, event_date, guest_count, budget_cents, created_at, matched_existing_contact, contact:contacts(id, full_name, company), assignee:profiles!assigned_to(id, full_name)";

export async function listBoardInquiries() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("inquiries").select(BOARD_SELECT).order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load inquiries (${error.code})`);
  return data;
}

export type BoardInquiry = Awaited<ReturnType<typeof listBoardInquiries>>[number];

/**
 * Rows for the overview: the visible inquiries and the status changes the
 * database logged for them. RLS limits both to what this user may see.
 */
export async function listOverviewData() {
  const supabase = await createSupabaseServerClient();
  const [inquiries, events] = await Promise.all([
    supabase
      .from("inquiries")
      .select(
        "id, title, status, event_type, event_date, start_time, guest_count, budget_cents, created_at, closed_at, contact:contacts(full_name, company), assignee:profiles!assigned_to(id, full_name)",
      ),
    supabase.from("inquiry_events").select("inquiry_id, details, created_at").eq("kind", "status_changed"),
  ]);
  if (inquiries.error) throw new Error(`Could not load inquiries (${inquiries.error.code})`);
  if (events.error) throw new Error(`Could not load history (${events.error.code})`);
  // One clock for the server and the client render, so the figures cannot differ on hydration.
  return { inquiries: inquiries.data, events: events.data, now: Date.now() };
}

export async function getInquiry(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inquiries")
    .select(
      "id, title, message, status, source, event_type, event_date, start_time, end_time, guest_count, budget_cents, location, created_at, updated_at, closed_at, submitted_contact, matched_existing_contact, contact:contacts(id, full_name, company, email, phone), assignee:profiles!assigned_to(id, full_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load inquiry (${error.code})`);
  return data;
}

export type InquiryDetail = NonNullable<Awaited<ReturnType<typeof getInquiry>>>;

export async function listTimeline(inquiryId: string) {
  const supabase = await createSupabaseServerClient();
  const [notes, events] = await Promise.all([
    supabase
      .from("inquiry_notes")
      .select("id, body, created_at, author:profiles!author_id(id, full_name)")
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: false }),
    supabase
      .from("inquiry_events")
      .select("id, kind, details, created_at, actor:profiles!actor_id(id, full_name)")
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: false }),
  ]);
  if (notes.error || events.error) throw new Error("Could not load history");
  return { notes: notes.data, events: events.data };
}

export async function getPendingDraft(inquiryId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("ai_drafts")
    .select("id, summary, questions, suggested_event_type, model, created_at")
    .eq("inquiry_id", inquiryId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

export async function listOtherInquiriesOfContact(contactId: string, exceptId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("inquiries")
    .select("id, title, status, event_date")
    .eq("contact_id", contactId)
    .neq("id", exceptId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function listContactsWithStats() {
  const supabase = await createSupabaseServerClient();
  const [contacts, inquiries] = await Promise.all([
    supabase.from("contacts").select("id, full_name, company, email, phone, created_at").order("full_name"),
    supabase.from("inquiries").select("id, contact_id, status, created_at"),
  ]);
  if (contacts.error || inquiries.error) throw new Error("Could not load contacts");

  const stats = new Map<string, { total: number; open: number; last: string | null; lastId: string | null }>();
  for (const inquiry of inquiries.data) {
    const entry = stats.get(inquiry.contact_id) ?? { total: 0, open: 0, last: null, lastId: null };
    entry.total += 1;
    if (inquiry.status === "new" || inquiry.status === "quoted") entry.open += 1;
    if (!entry.last || inquiry.created_at > entry.last) {
      entry.last = inquiry.created_at;
      entry.lastId = inquiry.id;
    }
    stats.set(inquiry.contact_id, entry);
  }
  return contacts.data.map((c) => ({ ...c, stats: stats.get(c.id) ?? { total: 0, open: 0, last: null, lastId: null } }));
}

export async function listTeam() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("profiles").select("id, full_name, role, created_at").order("full_name");
  if (error) throw new Error("Could not load team");
  return data;
}

export async function listApiKeys() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, rate_limit_per_minute, last_used_at, revoked_at, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load API keys");
  return data;
}
