import { formatEuro } from "./money";
import { zonedTimeToUtc } from "./time";
import type { InquiryStatus } from "./status";
import { pick } from "@/lib/i18n";

const T = pick({
  de: {
    prodId: "PRODID:-//Inquiry CRM//Anfragen//DE",
    contact: "Kontakt",
    guests: "Gäste",
    budget: "Budget",
    inquiry: "Anfrage",
    fileFallback: "termin",
  },
  en: {
    prodId: "PRODID:-//Inquiry CRM//Inquiries//EN",
    contact: "Contact",
    guests: "Guests",
    budget: "Budget",
    inquiry: "Inquiry",
    fileFallback: "event",
  },
});

export interface CalendarInquiry {
  id: string;
  title: string;
  status: InquiryStatus;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  guest_count: number | null;
  budget_cents: number | null;
  location: string | null;
  contact_name: string;
}

export class MissingEventDateError extends Error {
  constructor() {
    super("inquiry has no event date");
  }
}

/** Escapes TEXT values per RFC 5545, section 3.3.11. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folds a content line so no physical line exceeds 75 octets (RFC 5545,
 * section 3.1). Counts UTF-8 bytes and never splits a multi-byte character.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (currentBytes + bytes > limit) {
      out.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  out.push(current);
  return out.join("\r\n ");
}

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function compactDate(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

function nextDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Builds an iCalendar file for the event of one inquiry. Times are stored
 * as wall-clock times in the business time zone and exported in UTC, so every
 * calendar app places the event correctly without a VTIMEZONE block.
 * Without a start time the event is exported as an all-day event.
 */
export function buildInquiryIcs(inquiry: CalendarInquiry, options: { now: Date; appUrl: string }): string {
  if (!inquiry.event_date) throw new MissingEventDateError();

  const description = [
    `${T.contact}: ${inquiry.contact_name}`,
    inquiry.guest_count ? `${T.guests}: ${inquiry.guest_count}` : null,
    `${T.budget}: ${formatEuro(inquiry.budget_cents)}`,
    `${T.inquiry}: ${options.appUrl.replace(/\/$/, "")}/inquiries/${inquiry.id}`,
  ]
    .filter(Boolean)
    .join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    T.prodId,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:inquiry-${inquiry.id}@inquiry-crm`,
    `DTSTAMP:${utcStamp(options.now)}`,
  ];

  if (inquiry.start_time) {
    lines.push(`DTSTART:${utcStamp(zonedTimeToUtc(inquiry.event_date, inquiry.start_time))}`);
    if (inquiry.end_time) {
      lines.push(`DTEND:${utcStamp(zonedTimeToUtc(inquiry.event_date, inquiry.end_time))}`);
    }
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(inquiry.event_date)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(nextDay(inquiry.event_date))}`);
  }

  lines.push(`SUMMARY:${escapeText(inquiry.title)}`);
  if (inquiry.location) lines.push(`LOCATION:${escapeText(inquiry.location)}`);
  lines.push(`DESCRIPTION:${escapeText(description)}`);
  const status = inquiry.status === "won" ? "CONFIRMED" : inquiry.status === "lost" ? "CANCELLED" : "TENTATIVE";
  lines.push(`STATUS:${status}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** A safe ASCII file name for the Content-Disposition header. */
export function icsFileName(title: string, eventDate: string): string {
  const slug = title
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return `${eventDate}-${slug || T.fileFallback}.ics`;
}
