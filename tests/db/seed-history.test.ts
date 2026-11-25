/**
 * The seed shows a team at work: notes, assignments, status changes and an
 * accepted AI draft by different people. It is written by the superuser, so
 * RLS never checks it. These tests do: nothing in the history is something
 * the policies would have refused at that moment, and the history replays to
 * the current state of every inquiry. Both demos are checked, each on its own
 * rows: the German one (workspace "de", seed.sql) and the English one ("en",
 * seed-en.sql), which run one after the other in the same database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../support/pg-harness";

const SEED_NOW = new Date("2026-11-24T12:00:00Z");

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase({ seedNow: SEED_NOW });
});

afterAll(async () => {
  await t.close();
});

/** Who held an inquiry at a moment: the target of the last assignment logged before it. */
const holderAt = (inquiry: string, at: string) => `(
  select a.details ->> 'to' from public.inquiry_events a
   where a.inquiry_id = ${inquiry} and a.kind = 'assigned' and a.created_at <= ${at}
   order by a.created_at desc, a.id desc
   limit 1)`;

const WORKSPACES = [
  { ws: "de", people: ["Jonas Weber", "Lena Hoffmann", "Mira Schulz"], note: "Zusammenfassung: ", questions: "Rückfragen:" },
  { ws: "en", people: ["Aoife Kelly", "Conor Walsh", "Niamh Byrne"], note: "Summary: ", questions: "Follow-up questions:" },
] as const;

describe.each(WORKSPACES)("seed history of workspace $ws", ({ ws, people, note, questions }) => {
  /** Only rows of this workspace; ws comes from the fixed list above. */
  const inWs = (alias: string) => `${alias}.inquiry_id in (select id from public.inquiries where workspace = '${ws}')`;

  it("shows notes from all three people", async () => {
    const { rows } = await t.db.query<{ full_name: string; notes: number }>(
      `select p.full_name, count(*)::int as notes
         from public.inquiry_notes n join public.profiles p on p.id = n.author_id
        where ${inWs("n")}
        group by p.full_name order by p.full_name`,
    );
    expect(rows.map((r) => r.full_name)).toEqual(people);
    expect(rows.every((r) => r.notes >= 10)).toBe(true);
  });

  it("has staff write notes only on inquiries they held at that moment", async () => {
    const { rows } = await t.db.query(
      `select n.inquiry_id, p.full_name, n.created_at, n.body
         from public.inquiry_notes n join public.profiles p on p.id = n.author_id
        where p.role <> 'owner' and ${inWs("n")}
          and n.author_id::text is distinct from ${holderAt("n.inquiry_id", "n.created_at")}`,
    );
    expect(rows).toEqual([]);
  });

  it("has staff change only inquiries they held, and only the owner assign or enter them", async () => {
    const { rows } = await t.db.query(
      `select e.inquiry_id, e.kind, p.full_name, e.created_at
         from public.inquiry_events e join public.profiles p on p.id = e.actor_id
        where p.role <> 'owner' and ${inWs("e")}
          and (e.kind in ('assigned', 'created')
               or e.actor_id::text is distinct from ${holderAt("e.inquiry_id", "e.created_at")})`,
    );
    expect(rows).toEqual([]);
  });

  it("includes a handover, so a note can outlive its author's access", async () => {
    const { rows } = await t.db.query<{ inquiry_id: string }>(
      `select inquiry_id from public.inquiry_events
         where kind = 'assigned' and details ->> 'from' is not null and details ->> 'to' is not null
          and inquiry_id in (select id from public.inquiries where workspace = '${ws}')`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("replays to every inquiry's current assignee, status and closing time", async () => {
    const { rows } = await t.db.query<{
      id: string;
      assigned_to: string | null;
      last_assigned: string | null;
      status: string;
      last_status: string;
      closed_at: string | null;
      last_change_at: string | null;
    }>(
      `select i.id, i.assigned_to::text as assigned_to, i.status::text as status,
              i.closed_at::text as closed_at,
              (select e.details ->> 'to' from public.inquiry_events e
                where e.inquiry_id = i.id and e.kind = 'assigned'
                order by e.created_at desc, e.id desc limit 1) as last_assigned,
              coalesce((select e.details ->> 'to' from public.inquiry_events e
                         where e.inquiry_id = i.id and e.kind = 'status_changed'
                         order by e.created_at desc, e.id desc limit 1), 'new') as last_status,
              (select e.created_at::text from public.inquiry_events e
                where e.inquiry_id = i.id and e.kind = 'status_changed'
                order by e.created_at desc, e.id desc limit 1) as last_change_at
         from public.inquiries i where i.workspace = '${ws}' order by i.id`,
    );
    expect(rows).toHaveLength(30);
    const wrong = rows.filter(
      (r) =>
        r.assigned_to !== r.last_assigned ||
        r.status !== r.last_status ||
        ((r.status === "won" || r.status === "lost") && r.closed_at !== r.last_change_at),
    );
    expect(wrong).toEqual([]);
  });

  it("keeps every note and step between the inquiry's arrival and the newest inquiry", async () => {
    // The demo clock only keeps the newest inquiry out of the future, so nothing may come after it.
    const { rows } = await t.db.query(
      `select x.inquiry_id, x.what, x.created_at
         from (select inquiry_id, 'note' as what, created_at from public.inquiry_notes
               union all
               select inquiry_id, kind, created_at from public.inquiry_events) x
         join public.inquiries i on i.id = x.inquiry_id
        where i.workspace = '${ws}'
          and (x.created_at < i.created_at
               or x.created_at > (select max(created_at) from public.inquiries where workspace = '${ws}'))`,
    );
    expect(rows).toEqual([]);
  });

  it("gives an accepted AI draft its reservation, note and history entry, as the functions would", async () => {
    const { rows } = await t.db.query<{ note: boolean; event: boolean; reserved: boolean }>(
      `select exists (select 1 from public.inquiry_notes n
                       where n.inquiry_id = d.inquiry_id and n.author_id = d.decided_by and n.created_at = d.decided_at
                         and n.body like $1 || d.summary || E'\n\n' || $2 || E'\n- %') as note,
              exists (select 1 from public.inquiry_events e
                       where e.inquiry_id = d.inquiry_id and e.kind = 'ai_draft_accepted'
                         and e.actor_id = d.decided_by and e.details ->> 'draft_id' = d.id::text) as event,
              exists (select 1 from public.ai_usage u
                       where u.user_id = d.created_by and u.inquiry_id = d.inquiry_id and u.created_at <= d.created_at) as reserved
         from public.ai_drafts d
        where d.status = 'accepted' and ${inWs("d")}`,
      [note, questions],
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.note && r.event && r.reserved)).toBe(true);
  });
});
