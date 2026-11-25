import { isInquiryStatus, isOpen, type EventType, type InquiryStatus } from "./status";

/**
 * Figures for the overview page. Pure functions over the rows the user may
 * see (RLS decides which), so the owner gets the business and a staff
 * member gets their own inquiries. Nothing here is invented: every number
 * comes from creation times, closing times, budgets and the status changes
 * the database logged.
 */

export const PERIODS = [7, 30, 90] as const;
export type PeriodDays = (typeof PERIODS)[number];

export function isPeriod(value: unknown): value is PeriodDays {
  return typeof value === "number" && (PERIODS as readonly number[]).includes(value);
}

/** How a period is cut into chart columns: 7 days, 10 x 3 days, 15 x 6 days. */
export const BUCKETS: Record<PeriodDays, { count: number; days: number }> = {
  7: { count: 7, days: 1 },
  30: { count: 10, days: 3 },
  90: { count: 15, days: 6 },
};

const DAY = 86_400_000;
const TIME_ZONE = "Europe/Berlin";

export interface OverviewInquiry {
  id: string;
  title: string;
  status: InquiryStatus;
  event_type: EventType | null;
  event_date: string | null;
  start_time: string | null;
  guest_count: number | null;
  budget_cents: number | null;
  created_at: string;
  closed_at: string | null;
  contact: { full_name: string; company: string | null } | null;
  assignee: { id: string; full_name: string } | null;
}

export interface StatusChange {
  inquiry_id: string;
  to: InquiryStatus;
  at: string;
}

/** Reads a logged status change; anything malformed is dropped. */
export function toStatusChange(row: { inquiry_id: string; details: unknown; created_at: string }): StatusChange | null {
  const details = row.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const to = (details as Record<string, unknown>).to;
  return isInquiryStatus(to) ? { inquiry_id: row.inquiry_id, to, at: row.created_at } : null;
}

export class StatusTimeline {
  private readonly byInquiry = new Map<string, { at: number; to: InquiryStatus }[]>();

  constructor(changes: readonly StatusChange[]) {
    for (const change of changes) {
      const list = this.byInquiry.get(change.inquiry_id) ?? [];
      list.push({ at: Date.parse(change.at), to: change.to });
      this.byInquiry.set(change.inquiry_id, list);
    }
    for (const list of this.byInquiry.values()) list.sort((a, b) => a.at - b.at);
  }

  /**
   * The stage an inquiry was in at time t, or null before it existed.
   * Starts as "new" and follows the logged changes. If the log lacks the
   * closing step, the closing time and the current status fill it in.
   */
  statusAt(inquiry: OverviewInquiry, t: number): InquiryStatus | null {
    if (Date.parse(inquiry.created_at) > t) return null;
    let status: InquiryStatus = "new";
    for (const change of this.byInquiry.get(inquiry.id) ?? []) {
      if (change.at <= t) status = change.to;
    }
    if (inquiry.closed_at && Date.parse(inquiry.closed_at) <= t && !isOpen(inquiry.status)) status = inquiry.status;
    return status;
  }
}

export interface Delta {
  /** current minus previous */
  change: number;
  /** relative change, null when the previous value was zero */
  ratio: number | null;
}

export function delta(current: number, previous: number): Delta {
  return { change: current - previous, ratio: previous === 0 ? null : (current - previous) / previous };
}

export interface Bucket {
  /** inclusive end of the bucket (ms) */
  end: number;
  /** exclusive start of the bucket (ms) */
  start: number;
}

export function bucketsFor(period: PeriodDays, now: number): Bucket[] {
  const { count, days } = BUCKETS[period];
  return Array.from({ length: count }, (_, i) => {
    const end = now - (count - 1 - i) * days * DAY;
    return { start: end - days * DAY, end };
  });
}

const within = (iso: string | null, start: number, end: number) => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return t > start && t <= end;
};

export interface PipelinePoint {
  end: number;
  newCents: number;
  quotedCents: number;
  newCount: number;
  quotedCount: number;
}

export interface Overview {
  period: PeriodDays;
  buckets: Bucket[];
  newInquiries: { value: number; previous: number; delta: Delta; series: number[] };
  openCount: { value: number; atStart: number; delta: Delta; series: number[] };
  openVolume: { value: number; atStart: number; delta: Delta; series: number[] };
  wonVolume: { value: number; previous: number; delta: Delta; series: number[]; count: number };
  pipeline: PipelinePoint[];
  winRate: { won: number; lost: number; rate: number | null; previousRate: number | null };
  byEventType: { type: EventType | null; statuses: InquiryStatus[] }[];
}

export function computeOverview(
  inquiries: readonly OverviewInquiry[],
  changes: readonly StatusChange[],
  period: PeriodDays,
  now: number,
): Overview {
  const timeline = new StatusTimeline(changes);
  const span = period * DAY;
  const start = now - span;
  const previousStart = start - span;
  const buckets = bucketsFor(period, now);

  const openAt = (t: number) => {
    let count = 0;
    let cents = 0;
    for (const inquiry of inquiries) {
      const status = timeline.statusAt(inquiry, t);
      if (status && isOpen(status)) {
        count += 1;
        cents += inquiry.budget_cents ?? 0;
      }
    }
    return { count, cents };
  };

  const createdIn = (from: number, to: number) => inquiries.filter((i) => within(i.created_at, from, to));
  const wonIn = (from: number, to: number) => inquiries.filter((i) => i.status === "won" && within(i.closed_at, from, to));
  const lostIn = (from: number, to: number) => inquiries.filter((i) => i.status === "lost" && within(i.closed_at, from, to));
  const sumCents = (list: readonly OverviewInquiry[]) => list.reduce((sum, i) => sum + (i.budget_cents ?? 0), 0);

  const newNow = createdIn(start, now).length;
  const newBefore = createdIn(previousStart, start).length;

  const openEnd = openAt(now);
  const openStart = openAt(start);

  const won = wonIn(start, now);
  const wonBefore = wonIn(previousStart, start);
  const lost = lostIn(start, now);
  const lostBefore = lostIn(previousStart, start);
  const rate = (w: number, l: number) => (w + l === 0 ? null : w / (w + l));

  const pipeline = buckets.map(({ end }) => {
    const point: PipelinePoint = { end, newCents: 0, quotedCents: 0, newCount: 0, quotedCount: 0 };
    for (const inquiry of inquiries) {
      const status = timeline.statusAt(inquiry, end);
      if (status === "new") {
        point.newCents += inquiry.budget_cents ?? 0;
        point.newCount += 1;
      } else if (status === "quoted") {
        point.quotedCents += inquiry.budget_cents ?? 0;
        point.quotedCount += 1;
      }
    }
    return point;
  });

  const typeOrder: (EventType | null)[] = ["corporate", "wedding", "private", "conference", "other", null];
  const created = createdIn(start, now);
  const byEventType = typeOrder
    .map((type) => ({
      type,
      statuses: created.filter((i) => i.event_type === type).map((i) => i.status),
    }))
    .filter((row) => row.statuses.length > 0);

  return {
    period,
    buckets,
    newInquiries: {
      value: newNow,
      previous: newBefore,
      delta: delta(newNow, newBefore),
      series: buckets.map((b) => createdIn(b.start, b.end).length),
    },
    openCount: {
      value: openEnd.count,
      atStart: openStart.count,
      delta: delta(openEnd.count, openStart.count),
      series: pipeline.map((p) => p.newCount + p.quotedCount),
    },
    openVolume: {
      value: openEnd.cents,
      atStart: openStart.cents,
      delta: delta(openEnd.cents, openStart.cents),
      series: pipeline.map((p) => p.newCents + p.quotedCents),
    },
    wonVolume: {
      value: sumCents(won),
      previous: sumCents(wonBefore),
      delta: delta(sumCents(won), sumCents(wonBefore)),
      series: buckets.map((b) => sumCents(wonIn(b.start, b.end))),
      count: won.length,
    },
    pipeline,
    winRate: {
      won: won.length,
      lost: lost.length,
      rate: rate(won.length, lost.length),
      previousRate: rate(wonBefore.length, lostBefore.length),
    },
    byEventType,
  };
}

/** Calendar day in the business time zone, as YYYY-MM-DD. */
export function berlinDay(t: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date(t));
}

function dayNumber(isoDay: string): number {
  const [y, m, d] = isoDay.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
}

function isoFromDayNumber(n: number): string {
  return new Date(n * DAY).toISOString().slice(0, 10);
}

/** The next events on the calendar: today or later, not lost, earliest first. */
export function upcomingEvents(inquiries: readonly OverviewInquiry[], now: number, limit = 5): OverviewInquiry[] {
  const today = berlinDay(now);
  return inquiries
    .filter((i) => i.event_date !== null && i.event_date >= today && i.status !== "lost")
    .sort((a, b) => a.event_date!.localeCompare(b.event_date!) || (a.start_time ?? "").localeCompare(b.start_time ?? ""))
    .slice(0, limit);
}

export interface WeekCount {
  /** Monday of the week, YYYY-MM-DD (Berlin) */
  start: string;
  /** Sunday of the week, YYYY-MM-DD (Berlin) */
  end: string;
  /** ISO 8601 week number */
  week: number;
  count: number;
}

function isoWeek(dayNo: number): number {
  const date = new Date(dayNo * DAY);
  const weekday = (date.getUTCDay() + 6) % 7; // Monday = 0
  const thursday = dayNo - weekday + 3;
  const yearStart = Date.UTC(new Date(thursday * DAY).getUTCFullYear(), 0, 1) / DAY;
  return 1 + Math.floor((thursday - yearStart) / 7);
}

/**
 * Inquiries received per calendar week (Monday to Sunday, Berlin), for the
 * last `weeks` weeks up to and including the current one, oldest first.
 */
export function weeklyReceived(inquiries: readonly OverviewInquiry[], now: number, weeks = 13): WeekCount[] {
  const today = dayNumber(berlinDay(now));
  const weekday = (new Date(today * DAY).getUTCDay() + 6) % 7;
  const firstMonday = today - weekday - (weeks - 1) * 7;
  const counts = new Array<number>(weeks).fill(0);
  for (const inquiry of inquiries) {
    const day = dayNumber(berlinDay(Date.parse(inquiry.created_at)));
    const index = Math.floor((day - firstMonday) / 7);
    if (index >= 0 && index < weeks && day <= today) counts[index] += 1;
  }
  return counts.map((count, i) => {
    const monday = firstMonday + i * 7;
    return { start: isoFromDayNumber(monday), end: isoFromDayNumber(monday + 6), week: isoWeek(monday), count };
  });
}

/**
 * Whether a change reads well as a percentage. Only when there was a base
 * and the change is at most as large as that base: "+537 %" on a small base
 * says little, the amount itself says more.
 */
export function changeAsPercent(delta: Delta): boolean {
  return delta.ratio !== null && Math.abs(delta.ratio) <= 1;
}
