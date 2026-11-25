/**
 * The seeds move their demo dates to the day they run (supabase/seed.sql and
 * seed-en.sql, "Demo clock"). Each case fixes that moment, so the result never
 * depends on the day the tests run. Both demos are checked on their own rows
 * and in their own time zone: the German one in Berlin, the English one in
 * Dublin, an hour behind.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../support/pg-harness";

type Workspace = "de" | "en";
type Row = { id: string; created_at: string; closed_at: string | null; event_date: string | null; message: string };
type Snapshot = {
  inquiries: Row[];
  notes: { inquiry_id: string; created_at: string }[];
  events: { inquiry_id: string; kind: string; created_at: string }[];
  contacts: { id: string; created_at: string }[];
};

const DAY = 86_400_000;
const WRITTEN_AS_OF = new Date("2026-11-24T12:00:00Z");
const ZONE: Record<Workspace, string> = { de: "Europe/Berlin", en: "Europe/Dublin" };

const localDay = (ws: Workspace, iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE[ws], year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const localTime = (ws: Workspace, iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: ZONE[ws], timeStyle: "short" }).format(new Date(iso));
const dayNumber = (day: string) => Date.parse(`${day}T12:00:00Z`) / DAY;
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

/** Both workspaces of one seed run, as of the given moment. One database per moment, shared by both demos. */
const runs = new Map<string, Promise<Record<Workspace, Snapshot>>>();
function snapshot(seedNow: Date): Promise<Record<Workspace, Snapshot>> {
  const key = seedNow.toISOString();
  if (!runs.has(key)) runs.set(key, takeSnapshot(seedNow));
  return runs.get(key)!;
}

async function takeSnapshot(seedNow: Date): Promise<Record<Workspace, Snapshot>> {
  const t: TestDatabase = await createTestDatabase({ seedNow });
  try {
    const iso = (column: string) => `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
    const one = async (ws: Workspace): Promise<Snapshot> => {
      // ws comes from the fixed list of workspaces.
      const ofWs = `inquiry_id in (select id from public.inquiries where workspace = '${ws}')`;
      const inquiries = await t.db.query<Row>(
        `select id, ${iso("created_at")} as created_at, ${iso("closed_at")} as closed_at, event_date::text as event_date, message
           from public.inquiries where workspace = '${ws}' order by id`,
      );
      const notes = await t.db.query<Snapshot["notes"][number]>(
        `select inquiry_id, ${iso("created_at")} as created_at from public.inquiry_notes where ${ofWs} order by inquiry_id, created_at`,
      );
      const events = await t.db.query<Snapshot["events"][number]>(
        `select inquiry_id, kind, ${iso("created_at")} as created_at from public.inquiry_events where ${ofWs}
          order by inquiry_id, created_at, kind`,
      );
      const contacts = await t.db.query<Snapshot["contacts"][number]>(
        `select id, ${iso("created_at")} as created_at from public.contacts where workspace = '${ws}' order by id`,
      );
      return { inquiries: inquiries.rows, notes: notes.rows, events: events.rows, contacts: contacts.rows };
    };
    return { de: await one("de"), en: await one("en") };
  } finally {
    await t.close();
  }
}

const DEMOS = [
  {
    ws: "de" as const,
    newest: "2026-11-24T07:05:00Z",
    firstMessage: (day: number, month: number) => `am ${day}.${month}. mit etwa 40 Personen`,
    cases: [
      ["a day later", "2026-11-25T12:00:00Z", 1, "2026-11-25"],
      ["early morning, before the newest inquiry's time", "2026-11-25T05:00:00Z", 0, "2026-11-24"],
      ["a minute after the newest inquiry's time", "2026-11-25T07:06:00Z", 1, "2026-11-25"],
      ["a Sunday six weeks later", "2027-01-03T12:00:00Z", 40, "2027-01-03"],
      ["months later, in summer time", "2027-04-15T09:00:00Z", 142, "2027-04-15"],
    ] as [string, string, number, string][],
  },
  {
    ws: "en" as const,
    newest: "2026-11-24T08:05:00Z",
    firstMessage: (day: number, month: number) => `on ${day}/${month} with about 40 people`,
    cases: [
      ["a day later", "2026-11-25T12:00:00Z", 1, "2026-11-25"],
      ["early morning, before the newest inquiry's time", "2026-11-25T05:00:00Z", 0, "2026-11-24"],
      // Berlin has passed the newest inquiry's time of day by then, Dublin has not.
      ["a minute after the German newest inquiry's time", "2026-11-25T07:06:00Z", 0, "2026-11-24"],
      ["a minute after the newest inquiry's time", "2026-11-25T08:06:00Z", 1, "2026-11-25"],
      ["a Sunday six weeks later", "2027-01-03T12:00:00Z", 40, "2027-01-03"],
      ["months later, in summer time", "2027-04-15T09:00:00Z", 142, "2027-04-15"],
    ] as [string, string, number, string][],
  },
];

describe.each(DEMOS)("seed dates of workspace $ws move with the day the seed runs", ({ ws, newest: writtenNewest, firstMessage, cases }) => {
  let original: Snapshot;
  beforeAll(async () => {
    original = (await snapshot(WRITTEN_AS_OF))[ws];
  });

  it("keeps the data as written when run on its own day", () => {
    const newest = original.inquiries.map((r) => r.created_at).sort().at(-1)!;
    expect(newest).toBe(writtenNewest);
    expect(original.inquiries.find((r) => r.id.endsWith("01"))!.event_date).toBe("2026-12-12");
    expect(original.inquiries.find((r) => r.id.endsWith("01"))!.message).toContain(firstMessage(12, 12));
  });

  describe.each(cases)("%s", (_name, nowIso, days, newestDay) => {
    let moved: Snapshot;
    beforeAll(async () => {
      moved = (await snapshot(new Date(nowIso)))[ws];
    });

    it("puts the newest inquiry on today or yesterday, never in the future", () => {
      const newest = moved.inquiries.map((r) => r.created_at).sort().at(-1)!;
      expect(localDay(ws, newest)).toBe(newestDay);
      expect(Date.parse(newest)).toBeLessThanOrEqual(Date.parse(nowIso));
    });

    it("puts no note or history entry in the future", () => {
      const future = [...moved.notes, ...moved.events].filter((r) => Date.parse(r.created_at) > Date.parse(nowIso));
      expect(future).toEqual([]);
    });

    it("moves every timestamp by the same whole days and keeps the local time of day", () => {
      const pairs: [string, string][] = [
        ...original.inquiries.flatMap((r, i): [string, string][] => [
          [r.created_at, moved.inquiries[i]!.created_at],
          ...(r.closed_at ? [[r.closed_at, moved.inquiries[i]!.closed_at!] as [string, string]] : []),
        ]),
        ...original.notes.map((r, i): [string, string] => [r.created_at, moved.notes[i]!.created_at]),
        ...original.events.map((r, i): [string, string] => [r.created_at, moved.events[i]!.created_at]),
        ...original.contacts.map((r, i): [string, string] => [r.created_at, moved.contacts[i]!.created_at]),
      ];
      expect(pairs.length).toBeGreaterThan(100);
      const wrong = pairs.filter(
        ([a, b]) => dayNumber(localDay(ws, b)) - dayNumber(localDay(ws, a)) !== days || localTime(ws, a) !== localTime(ws, b),
      );
      expect(wrong).toEqual([]);
    });

    it("moves event dates by whole weeks, keeping the weekday, close to the timestamps", () => {
      for (const [i, r] of original.inquiries.entries()) {
        const after = moved.inquiries[i]!.event_date;
        if (r.event_date === null) {
          expect(after).toBeNull();
          continue;
        }
        const offset = dayNumber(after!) - dayNumber(r.event_date);
        expect(offset % 7).toBe(0);
        expect(Math.abs(offset - days)).toBeLessThanOrEqual(3);
        expect(weekday(after!)).toBe(weekday(r.event_date));
      }
      const first = moved.inquiries.find((r) => r.id.endsWith("01"))!;
      const [, month, day] = first.event_date!.split("-").map(Number);
      expect(first.message).toContain(firstMessage(day, month));
    });

    it("keeps exactly the events ahead that were ahead in the written data", () => {
      const ahead = (list: Snapshot, today: string) => list.inquiries.map((r) => r.event_date !== null && r.event_date >= today);
      expect(ahead(moved, localDay(ws, nowIso))).toEqual(ahead(original, "2026-11-24"));
      expect(ahead(moved, localDay(ws, nowIso)).filter(Boolean).length).toBeGreaterThan(20);
    });
  });
});
