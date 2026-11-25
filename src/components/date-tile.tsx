import { cn } from "@/lib/cn";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/** Whole days from today (Berlin) to an ISO date. Negative when it lies in the past. */
export function daysUntil(isoDate: string, now: Date = new Date()): number {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now);
  return Math.round((Date.parse(isoDate) - Date.parse(today)) / 86_400_000);
}

export function countdownLabel(days: number): string {
  if (days === 0) return "heute";
  if (days === 1) return "morgen";
  if (days === -1) return "gestern";
  if (days < 0) return `vor ${-days} Tagen`;
  if (days < 60) return `in ${days} Tagen`;
  return `in ${Math.round(days / 30)} Monaten`;
}

/** Full sentence for headers: "Termin in 18 Tagen", "Termin war vor 3 Tagen". */
export function countdownSentence(days: number): string {
  if (days === 0) return "Termin ist heute";
  if (days === 1) return "Termin ist morgen";
  if (days === -1) return "Termin war gestern";
  if (days < 0) return `Termin war vor ${-days} Tagen`;
  if (days < 60) return `Termin in ${days} Tagen`;
  return `Termin in etwa ${Math.round(days / 30)} Monaten`;
}

function currentBerlinYear(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric" }).format(now));
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
        <span className="text-[11px] leading-tight">Datum</span>
        <span className="text-[11px] leading-tight">offen</span>
      </div>
    );
  }
  const [year, month, day] = date.split("-").map(Number);
  const showYear = year !== currentBerlinYear();
  return (
    <div
      className={cn(
        box,
        "figures flex shrink-0 flex-col items-center justify-center",
        muted ? "bg-hover text-muted" : "bg-accent-soft text-accent-fg",
      )}
    >
      <span className={cn("leading-none font-semibold", size === "lg" ? "text-[22px]" : "text-[17px]")}>{day}</span>
      <span className={cn("mt-0.5 leading-none font-medium", size === "lg" ? "text-xs" : "text-[11px]")}>{MONTHS[month - 1]}</span>
      {showYear && <span className="mt-0.5 text-[10px] leading-none">{year}</span>}
    </div>
  );
}
