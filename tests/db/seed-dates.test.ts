/**
 * The seed moves its demo dates to the day it runs (supabase/seed.sql, "Demo
 * clock"). Each case fixes that moment, so the result never depends on the day
 * the tests run.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../support/pg-harness";

type Row = { id: string; created_at: string; closed_at: string | null; event_date: string | null; message: string };
type Snapshot = {
  inquiries: Row[];
  notes: { inquiry_id: string; created_at: string }[];
  events: { inquiry_id: string; kind: string; created_at: string }[];
  contacts: { id: string; created_at: string }[];
};

const DAY = 86_400_000;
const WRITTEN_AS_OF = new Date("2026-11-24T12:00:00Z");

const berlinDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const berlinTime = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", timeStyle: "short" }).format(new Date(iso));
const dayNumber = (day: string) => Date.parse(`${day}T12:00:00Z`) / DAY;
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

async function snapshot(seedNow: Date): Promise<Snapshot> {
  const t: TestDatabase = await createTestDatabase({ seedNow });
  try {
    const iso = (column: string) => `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
    const inquiries = await t.db.query<Row>(
      `select id, ${iso("created_at")} as created_at, ${iso("closed_at")} as closed_at, event_date::text as event_date, message
         from public.inquiries order by id`,
    );
    const notes = await t.db.query<Snapshot["notes"][number]>(
      `select inquiry_id, ${iso("created_at")} as created_at from public.inquiry_notes order by inquiry_id, created_at`,
    );
    const events = await t.db.query<Snapshot["events"][number]>(
      `select inquiry_id, kind, ${iso("created_at")} as created_at from public.inquiry_events order by inquiry_id, created_at, kind`,
    );
    const contacts = await t.db.query<Snapshot["contacts"][number]>(
      `select id, ${iso("created_at")} as created_at from public.contacts order by id`,
    );
    return { inquiries: inquiries.rows, notes: notes.rows, events: events.rows, contacts: contacts.rows };
  } finally {
    await t.close();
  }
}

let original: Snapshot;
beforeAll(async () => {
  original = await snapshot(WRITTEN_AS_OF);
});

describe("seed dates move with the day the seed runs", () => {
  it("keeps the data as written when run on its own day", () => {
    const newest = original.inquiries.map((r) => r.created_at).sort().at(-1)!;
    expect(newest).toBe("2026-11-24T07:05:00Z");
    expect(original.inquiries.find((r) => r.id.endsWith("01"))!.event_date).toBe("2026-12-12");
    expect(original.inquiries.find((r) => r.id.endsWith("01"))!.message).toContain("am 12.12. mit etwa 40 Personen");
  });

  describe.each([
    ["a day later", "2026-11-25T12:00:00Z", 1, "2026-11-25"],
    ["early morning, before the newest inquiry's time", "2026-11-25T05:00:00Z", 0, "2026-11-24"],
    ["a minute after the newest inquiry's time", "2026-11-25T07:06:00Z", 1, "2026-11-25"],
    ["a Sunday six weeks later", "2027-01-03T12:00:00Z", 40, "2027-01-03"],
    ["months later, in summer time", "2027-04-15T09:00:00Z", 142, "2027-04-15"],
  ])("%s", (_name, nowIso, days, newestDay) => {
    let moved: Snapshot;
    beforeAll(async () => {
      moved = await snapshot(new Date(nowIso));
    });

    it("puts the newest inquiry on today or yesterday, never in the future", () => {
      const newest = moved.inquiries.map((r) => r.created_at).sort().at(-1)!;
      expect(berlinDay(newest)).toBe(newestDay);
      expect(Date.parse(newest)).toBeLessThanOrEqual(Date.parse(nowIso));
    });

    it("puts no note or history entry in the future", () => {
      const future = [...moved.notes, ...moved.events].filter((r) => Date.parse(r.created_at) > Date.parse(nowIso));
      expect(future).toEqual([]);
    });

    it("moves every timestamp by the same whole days and keeps the Berlin time of day", () => {
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
        ([a, b]) => dayNumber(berlinDay(b)) - dayNumber(berlinDay(a)) !== days || berlinTime(a) !== berlinTime(b),
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
      expect(first.message).toContain(`am ${day}.${month}. mit etwa 40 Personen`);
    });

    it("keeps exactly the events ahead that were ahead in the written data", () => {
      const ahead = (list: Snapshot, today: string) => list.inquiries.map((r) => r.event_date !== null && r.event_date >= today);
      expect(ahead(moved, berlinDay(nowIso))).toEqual(ahead(original, "2026-11-24"));
      expect(ahead(moved, berlinDay(nowIso)).filter(Boolean).length).toBeGreaterThan(20);
    });
  });
});
