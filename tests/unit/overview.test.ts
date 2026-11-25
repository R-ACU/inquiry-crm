import { describe, expect, it } from "vitest";
import {
  StatusTimeline,
  bucketsFor,
  computeOverview,
  delta,
  changeAsPercent,
  toStatusChange,
  upcomingEvents,
  weeklyReceived,
  type OverviewInquiry,
  type StatusChange,
} from "@/lib/domain/overview";

// Tuesday, 24 November 2026, 12:00 in Berlin.
const NOW = Date.parse("2026-11-24T11:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function inquiry(id: string, over: Partial<OverviewInquiry>): OverviewInquiry {
  return {
    id,
    title: `Anfrage ${id}`,
    status: "new",
    event_type: "corporate",
    event_date: null,
    start_time: null,
    guest_count: 20,
    budget_cents: 100_000,
    created_at: daysAgo(1),
    closed_at: null,
    contact: null,
    assignee: null,
    ...over,
  };
}

const ROWS: OverviewInquiry[] = [
  // created 40 days ago, quoted after 2 days, won 20 days ago
  inquiry("a", { status: "won", created_at: daysAgo(40), closed_at: daysAgo(20), budget_cents: 500_000 }),
  // created 10 days ago, quoted 8 days ago, still open
  inquiry("b", { status: "quoted", created_at: daysAgo(10), budget_cents: 300_000, event_type: "wedding" }),
  // created 3 days ago, new
  inquiry("c", { status: "new", created_at: daysAgo(3), budget_cents: 200_000 }),
  // created 50 days ago, lost 5 days ago
  inquiry("d", { status: "lost", created_at: daysAgo(50), closed_at: daysAgo(5), budget_cents: 50_000, event_type: null }),
  // created 45 days ago, new, no budget
  inquiry("e", { status: "new", created_at: daysAgo(45), budget_cents: null }),
];

const CHANGES: StatusChange[] = [
  { inquiry_id: "a", to: "quoted", at: daysAgo(38) },
  { inquiry_id: "a", to: "won", at: daysAgo(20) },
  { inquiry_id: "b", to: "quoted", at: daysAgo(8) },
  { inquiry_id: "d", to: "quoted", at: daysAgo(48) },
  { inquiry_id: "d", to: "lost", at: daysAgo(5) },
];

describe("status timeline", () => {
  const timeline = new StatusTimeline(CHANGES);

  it("knows nothing before an inquiry was created", () => {
    expect(timeline.statusAt(ROWS[2], NOW - 4 * 86_400_000)).toBeNull();
  });

  it("follows the logged changes over time", () => {
    const a = ROWS[0];
    expect(timeline.statusAt(a, Date.parse(daysAgo(39)))).toBe("new");
    expect(timeline.statusAt(a, Date.parse(daysAgo(30)))).toBe("quoted");
    expect(timeline.statusAt(a, NOW)).toBe("won");
  });

  it("uses the closing time when the log lacks the closing step", () => {
    const sparse = new StatusTimeline([]);
    expect(sparse.statusAt(ROWS[3], Date.parse(daysAgo(6)))).toBe("new");
    expect(sparse.statusAt(ROWS[3], NOW)).toBe("lost");
  });
});

describe("toStatusChange", () => {
  it("reads a logged change and drops malformed ones", () => {
    expect(toStatusChange({ inquiry_id: "x", details: { from: "new", to: "quoted" }, created_at: "2026-11-01T10:00:00Z" })).toEqual({
      inquiry_id: "x",
      to: "quoted",
      at: "2026-11-01T10:00:00Z",
    });
    for (const details of [null, "quoted", ["quoted"], { to: "archived" }, { to: 3 }, {}]) {
      expect(toStatusChange({ inquiry_id: "x", details, created_at: "2026-11-01T10:00:00Z" })).toBeNull();
    }
  });
});

describe("delta", () => {
  it("gives the change and the ratio, without dividing by zero", () => {
    expect(delta(12, 8)).toEqual({ change: 4, ratio: 0.5 });
    expect(delta(3, 0)).toEqual({ change: 3, ratio: null });
    expect(delta(0, 4)).toEqual({ change: -4, ratio: -1 });
  });
});

describe("buckets", () => {
  it("cuts each period into columns that end now and cover the whole period", () => {
    for (const [period, count] of [[7, 7], [30, 10], [90, 15]] as const) {
      const buckets = bucketsFor(period, NOW);
      expect(buckets).toHaveLength(count);
      expect(buckets.at(-1)!.end).toBe(NOW);
      expect(buckets[0].start).toBe(NOW - period * 86_400_000);
      for (let i = 1; i < buckets.length; i++) expect(buckets[i].start).toBe(buckets[i - 1].end);
    }
  });
});

describe("computeOverview", () => {
  const thirty = computeOverview(ROWS, CHANGES, 30, NOW);

  it("counts new inquiries in the period and in the period before", () => {
    expect(thirty.newInquiries.value).toBe(2); // b, c
    expect(thirty.newInquiries.previous).toBe(3); // a, d, e
    expect(thirty.newInquiries.series.reduce((s, n) => s + n, 0)).toBe(2);
  });

  it("measures open inquiries and their budgets now and at the start of the period", () => {
    // now: b (quoted), c (new), e (new); 30 days ago: a (quoted), d (quoted), e (new)
    expect(thirty.openCount.value).toBe(3);
    expect(thirty.openCount.atStart).toBe(3);
    expect(thirty.openVolume.value).toBe(500_000);
    expect(thirty.openVolume.atStart).toBe(550_000);
    expect(thirty.openVolume.series.at(-1)).toBe(500_000);
  });

  it("splits the pipeline into new and quoted at each column end", () => {
    const last = thirty.pipeline.at(-1)!;
    expect(last).toMatchObject({ newCents: 200_000, quotedCents: 300_000, newCount: 2, quotedCount: 1 });
  });

  it("sums won budgets and the win rate by closing date", () => {
    expect(thirty.wonVolume.value).toBe(500_000);
    expect(thirty.wonVolume.count).toBe(1);
    expect(thirty.winRate).toMatchObject({ won: 1, lost: 1, rate: 0.5, previousRate: null });
  });

  it("has no win rate when nothing was decided", () => {
    const week = computeOverview(ROWS.filter((r) => r.id !== "d"), CHANGES, 7, NOW);
    expect(week.winRate.rate).toBeNull();
  });

  it("groups the period's inquiries by occasion, unknown last", () => {
    const ninety = computeOverview(ROWS, CHANGES, 90, NOW);
    expect(ninety.byEventType.map((r) => r.type)).toEqual(["corporate", "wedding", null]);
    expect(ninety.byEventType[0].statuses).toEqual(["won", "new", "new"]);
  });

  it("sees only the rows it is given, as RLS hands them out", () => {
    expect(computeOverview([], [], 30, NOW).openVolume.value).toBe(0);
  });
});

describe("weeklyReceived", () => {
  it("counts per Berlin calendar week, Monday to Sunday, ending with the current week", () => {
    const rows = [
      inquiry("x", { created_at: "2026-11-23T08:00:00Z" }), // Monday of this week
      inquiry("y", { created_at: "2026-11-22T23:30:00Z" }), // 23:30 UTC on Sunday is 00:30 on Monday in Berlin
      inquiry("z", { created_at: "2026-11-22T10:00:00Z" }), // Sunday of the week before
      inquiry("w", { created_at: "2026-08-20T10:00:00Z" }), // before the window (it starts on Monday, 31 August)
    ];
    const weeks = weeklyReceived(rows, NOW);
    expect(weeks).toHaveLength(13);
    expect(weeks.at(-1)).toEqual({ start: "2026-11-23", end: "2026-11-29", week: 48, count: 2 });
    expect(weeks.at(-2)).toEqual({ start: "2026-11-16", end: "2026-11-22", week: 47, count: 1 });
    expect(weeks[0].start).toBe("2026-08-31");
    expect(weeks.reduce((s, w) => s + w.count, 0)).toBe(3);
  });

  it("uses ISO week numbers across the turn of the year", () => {
    const weeks = weeklyReceived([], Date.parse("2027-01-06T12:00:00Z"), 3);
    expect(weeks.map((w) => [w.start, w.week])).toEqual([
      ["2026-12-21", 52],
      ["2026-12-28", 53],
      ["2027-01-04", 1],
    ]);
  });
});

describe("changeAsPercent", () => {
  it("shows a percentage only when there was a base at least as large as the change", () => {
    expect(changeAsPercent(delta(152, 100))).toBe(true);
    expect(changeAsPercent(delta(200, 100))).toBe(true);
    expect(changeAsPercent(delta(50, 100))).toBe(true);
    expect(changeAsPercent(delta(0, 100))).toBe(true);
    // "+537 %" on a small base reads as noise: show the amount instead.
    expect(changeAsPercent(delta(31_100, 4_880))).toBe(false);
    expect(changeAsPercent(delta(5, 0))).toBe(false);
    expect(changeAsPercent(delta(0, 0))).toBe(false);
  });
});

describe("upcomingEvents", () => {
  it("lists today and later, skips lost ones, earliest first", () => {
    const rows = [
      inquiry("late", { event_date: "2027-03-01" }),
      inquiry("past", { event_date: "2026-11-01" }),
      inquiry("today", { event_date: "2026-11-24", start_time: "18:00" }),
      inquiry("lost", { event_date: "2026-12-01", status: "lost" }),
      inquiry("soon", { event_date: "2026-12-01" }),
      inquiry("none", { event_date: null }),
    ];
    expect(upcomingEvents(rows, NOW).map((r) => r.id)).toEqual(["today", "soon", "late"]);
  });
});
