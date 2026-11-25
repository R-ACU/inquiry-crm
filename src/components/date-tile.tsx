import { cn } from "@/lib/cn";
import { BUSINESS_TIME_ZONE, pick } from "@/lib/i18n";

const T = pick({
  de: {
    months: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
    today: "heute",
    tomorrow: "morgen",
    yesterday: "gestern",
    daysAgo: (n: number) => `vor ${n} Tagen`,
    inDays: (n: number) => `in ${n} Tagen`,
    inMonths: (n: number) => `in ${n} Monaten`,
    sentenceToday: "Termin ist heute",
    sentenceTomorrow: "Termin ist morgen",
    sentenceYesterday: "Termin war gestern",
    sentenceDaysAgo: (n: number) => `Termin war vor ${n} Tagen`,
    sentenceInDays: (n: number) => `Termin in ${n} Tagen`,
    sentenceInMonths: (n: number) => `Termin in etwa ${n} Monaten`,
    dateWord: "Datum",
    openWord: "offen",
  },
  en: {
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    today: "today",
    tomorrow: "tomorrow",
    yesterday: "yesterday",
    daysAgo: (n: number) => `${n} days ago`,
    inDays: (n: number) => `in ${n} days`,
    inMonths: (n: number) => `in ${n} months`,
    sentenceToday: "Event is today",
    sentenceTomorrow: "Event is tomorrow",
    sentenceYesterday: "Event was yesterday",
    sentenceDaysAgo: (n: number) => `Event was ${n} days ago`,
    sentenceInDays: (n: number) => `Event in ${n} days`,
    sentenceInMonths: (n: number) => `Event in about ${n} months`,
    dateWord: "Date",
    openWord: "open",
  },
});

/** Whole days from today (business time zone) to an ISO date. Negative when it lies in the past. */
export function daysUntil(isoDate: string, now: Date = new Date()): number {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE }).format(now);
  return Math.round((Date.parse(isoDate) - Date.parse(today)) / 86_400_000);
}

export function countdownLabel(days: number): string {
  if (days === 0) return T.today;
  if (days === 1) return T.tomorrow;
  if (days === -1) return T.yesterday;
  if (days < 0) return T.daysAgo(-days);
  if (days < 60) return T.inDays(days);
  return T.inMonths(Math.round(days / 30));
}

/** Full sentence for headers: "Termin in 18 Tagen", "Termin war vor 3 Tagen". */
export function countdownSentence(days: number): string {
  if (days === 0) return T.sentenceToday;
  if (days === 1) return T.sentenceTomorrow;
  if (days === -1) return T.sentenceYesterday;
  if (days < 0) return T.sentenceDaysAgo(-days);
  if (days < 60) return T.sentenceInDays(days);
  return T.sentenceInMonths(Math.round(days / 30));
}

function currentBusinessYear(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric" }).format(now));
}

/**
 * The event date as a small tile: the day large, the month below. Dates
 * outside the current year get the year as a third, quieter line, so "Jan"
 * plus "2027" can never be read as "27 January". A catering business plans
 * by date, so this is the first thing on every inquiry.
 */
export function DateTile({ date, size = "md", muted }: { date: string | null; size?: "md" | "lg"; muted?: boolean }) {
  const box = size === "lg" ? "size-16 rounded-2xl" : "size-12 rounded-xl";
  if (!date) {
    return (
      <div className={cn(box, "flex shrink-0 flex-col items-center justify-center border border-dashed border-line-strong text-faint")}>
        <span className="text-[11px] leading-tight">{T.dateWord}</span>
        <span className="text-[11px] leading-tight">{T.openWord}</span>
      </div>
    );
  }
  const [year, month, day] = date.split("-").map(Number);
  const showYear = year !== currentBusinessYear();
  return (
    <div
      className={cn(
        box,
        "figures flex shrink-0 flex-col items-center justify-center",
        muted ? "bg-hover text-muted" : "bg-accent-soft text-accent-fg",
      )}
    >
      <span className={cn("leading-none font-semibold", size === "lg" ? "text-[22px]" : "text-[17px]")}>{day}</span>
      <span className={cn("mt-0.5 leading-none font-medium", size === "lg" ? "text-xs" : "text-[11px]")}>{T.months[month - 1]}</span>
      {showYear && <span className="mt-0.5 text-[10px] leading-none">{year}</span>}
    </div>
  );
}
