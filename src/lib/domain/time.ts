export const BUSINESS_TIME_ZONE = "Europe/Berlin";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isValidTime(value: string): boolean {
  return TIME.test(value);
}

/** "18:00:00" or "18:00" to minutes after midnight. */
export function timeToMinutes(value: string): number {
  const match = TIME.exec(value);
  if (!match) throw new Error(`invalid time: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Offset of a time zone from UTC in minutes at the given instant (Berlin: +60 or +120). */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/**
 * Converts a wall-clock date and time in the business time zone to a UTC
 * instant. Handles daylight saving time by re-checking the offset at the
 * resulting instant.
 */
export function zonedTimeToUtc(isoDate: string, time: string, timeZone = BUSINESS_TIME_ZONE): Date {
  if (!isValidIsoDate(isoDate)) throw new Error(`invalid date: ${isoDate}`);
  const [y, m, d] = isoDate.split("-").map(Number);
  const minutes = timeToMinutes(time);
  const naiveUtc = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  const firstGuess = naiveUtc - zoneOffsetMinutes(new Date(naiveUtc), timeZone) * 60000;
  const corrected = naiveUtc - zoneOffsetMinutes(new Date(firstGuess), timeZone) * 60000;
  return new Date(corrected);
}

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** "2026-12-12" to "Sa., 12.12.2026". */
export function formatEventDate(isoDate: string | null): string {
  if (!isoDate) return "Datum offen";
  const [y, m, d] = isoDate.split("-").map(Number);
  return dateFormatter.format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatTimeRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const s = start.slice(0, 5);
  return end ? `${s} bis ${end.slice(0, 5)} Uhr` : `ab ${s} Uhr`;
}

const dateTimeFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: BUSINESS_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatTimestamp(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

/** Short relative label for lists: "heute", "gestern", "vor 5 Tagen", else the date. */
export function formatRelativeDay(iso: string, now: Date = new Date()): string {
  const day = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE }).format(date);
  const diffDays = Math.round(
    (Date.parse(day(now)) - Date.parse(day(new Date(iso)))) / 86_400_000,
  );
  if (diffDays <= 0) return "heute";
  if (diffDays === 1) return "gestern";
  if (diffDays < 7) return `vor ${diffDays} Tagen`;
  return new Intl.DateTimeFormat("de-DE", { timeZone: BUSINESS_TIME_ZONE, day: "2-digit", month: "2-digit" }).format(
    new Date(iso),
  );
}
