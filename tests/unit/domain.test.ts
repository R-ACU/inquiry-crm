import { describe, expect, it } from "vitest";
import { computeKpis, formatPercent } from "@/lib/domain/kpis";
import { euroToCents, formatEuro } from "@/lib/domain/money";
import { formatEventDate, formatRelativeDay, formatTimeRange, isValidIsoDate, zonedTimeToUtc } from "@/lib/domain/time";
import { buildInquiryIcs, escapeText, foldLine, icsFileName, MissingEventDateError } from "@/lib/domain/ics";
import { generateApiKey, hashApiKey, readBearerKey } from "@/lib/domain/api-keys";
import { SlidingWindowLimiter } from "@/lib/domain/rate-limit";

describe("computeKpis", () => {
  it("counts open inquiries, win rate and volumes", () => {
    const kpis = computeKpis([
      { status: "new", budget_cents: 100_00 },
      { status: "quoted", budget_cents: null },
      { status: "quoted", budget_cents: 250_00 },
      { status: "won", budget_cents: 1_000_00 },
      { status: "won", budget_cents: 500_00 },
      { status: "lost", budget_cents: 9_999_00 },
    ]);
    expect(kpis).toEqual({
      openCount: 3,
      wonCount: 2,
      lostCount: 1,
      winRate: 2 / 3,
      openVolumeCents: 350_00,
      wonVolumeCents: 1_500_00,
    });
  });

  it("has no win rate while nothing is decided", () => {
    expect(computeKpis([{ status: "new", budget_cents: 1 }]).winRate).toBeNull();
    expect(computeKpis([]).winRate).toBeNull();
    expect(formatPercent(null)).toBe("noch keine");
  });

  it("formats the rate as a German percentage", () => {
    expect(formatPercent(2 / 3)).toMatch(/^67\s?%$/);
  });
});

describe("money", () => {
  it("formats whole euros without cents and keeps cents when present", () => {
    expect(formatEuro(150_000)).toMatch(/^1\.500\s€$/);
    expect(formatEuro(1_050)).toMatch(/^10,50\s€$/);
    expect(formatEuro(null)).toBe("offen");
  });

  it("converts euros to cents without float drift", () => {
    expect(euroToCents(19.99)).toBe(1999);
    expect(euroToCents(0.1 + 0.2)).toBe(30);
  });
});

describe("time", () => {
  it("validates real calendar dates only", () => {
    expect(isValidIsoDate("2027-02-28")).toBe(true);
    expect(isValidIsoDate("2027-02-29")).toBe(false);
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("12.12.2026")).toBe(false);
  });

  it("converts Berlin wall-clock time to UTC in winter and summer", () => {
    expect(zonedTimeToUtc("2026-12-12", "18:00").toISOString()).toBe("2026-12-12T17:00:00.000Z");
    expect(zonedTimeToUtc("2027-06-18", "15:00").toISOString()).toBe("2027-06-18T13:00:00.000Z");
  });

  it("handles the day daylight saving time starts", () => {
    // 28 March 2027: clocks jump from 02:00 to 03:00 in Berlin.
    expect(zonedTimeToUtc("2027-03-28", "01:30").toISOString()).toBe("2027-03-28T00:30:00.000Z");
    expect(zonedTimeToUtc("2027-03-28", "12:00").toISOString()).toBe("2027-03-28T10:00:00.000Z");
  });

  it("formats dates and ranges in German", () => {
    expect(formatEventDate("2026-12-12")).toBe("Sa., 12.12.2026");
    expect(formatEventDate(null)).toBe("Datum offen");
    expect(formatTimeRange("18:00:00", "23:00:00")).toBe("18:00 bis 23:00 Uhr");
    expect(formatTimeRange("18:00:00", null)).toBe("ab 18:00 Uhr");
    expect(formatTimeRange(null, null)).toBeNull();
  });

  it("labels recent days relative to now", () => {
    const now = new Date("2026-11-24T10:00:00Z");
    expect(formatRelativeDay("2026-11-24T08:00:00Z", now)).toBe("heute");
    expect(formatRelativeDay("2026-11-23T08:00:00Z", now)).toBe("gestern");
    expect(formatRelativeDay("2026-11-20T08:00:00Z", now)).toBe("vor 4 Tagen");
    expect(formatRelativeDay("2026-10-01T08:00:00Z", now)).toBe("01.10.");
  });
});

describe("ICS export", () => {
  const base = {
    id: "e0000000-0000-4000-8000-000000000001",
    title: "Weihnachtsfeier Nordlicht Software",
    status: "new" as const,
    event_date: "2026-12-12",
    start_time: "18:00:00",
    end_time: "23:00:00",
    guest_count: 40,
    budget_cents: 150_000,
    location: "Nordlicht Software, Speicherstadt 4",
    contact_name: "Tobias Krüger",
  };
  const options = { now: new Date("2026-11-24T09:00:00Z"), appUrl: "https://crm.example/" };

  it("exports a timed event in UTC with CRLF line endings", () => {
    const ics = buildInquiryIcs(base, options);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261212T170000Z\r\n");
    expect(ics).toContain("DTEND:20261212T220000Z\r\n");
    expect(ics).toContain("DTSTAMP:20261124T090000Z\r\n");
    expect(ics).toContain("UID:inquiry-e0000000-0000-4000-8000-000000000001@inquiry-crm\r\n");
    expect(ics).toContain("LOCATION:Nordlicht Software\\, Speicherstadt 4\r\n");
    expect(ics).toContain("STATUS:TENTATIVE\r\n");
    expect(ics.replace(/\r\n /g, "")).toContain(
      "Anfrage: https://crm.example/inquiries/e0000000-0000-4000-8000-000000000001",
    );
  });

  it("exports an all-day event when no start time is known", () => {
    const ics = buildInquiryIcs({ ...base, start_time: null, end_time: null, status: "won" }, options);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261212\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261213\r\n");
    expect(ics).toContain("STATUS:CONFIRMED\r\n");
  });

  it("refuses inquiries without a date", () => {
    expect(() => buildInquiryIcs({ ...base, event_date: null }, options)).toThrow(MissingEventDateError);
  });

  it("escapes text and folds long lines at 75 octets without splitting characters", () => {
    expect(escapeText("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
    const folded = foldLine("DESCRIPTION:" + "ä".repeat(80));
    const encoder = new TextEncoder();
    for (const physical of folded.split("\r\n")) {
      expect(encoder.encode(physical).length).toBeLessThanOrEqual(75);
    }
    expect(folded.split("\r\n").map((l, i) => (i === 0 ? l : l.slice(1))).join("")).toBe(
      "DESCRIPTION:" + "ä".repeat(80),
    );
  });

  it("builds a safe ASCII file name", () => {
    expect(icsFileName("Sommerfest Schröder & Söhne", "2027-07-10")).toBe("2027-07-10-sommerfest-schroder-sohne.ics");
    expect(icsFileName("Großer Empfang", "2027-01-01")).toBe("2027-01-01-grosser-empfang.ics");
    expect(icsFileName("!!!", "2027-01-01")).toBe("2027-01-01-termin.ics");
  });
});

describe("API keys", () => {
  it("generates a prefixed key whose hash matches and whose prefix fits the database check", () => {
    const key = generateApiKey();
    expect(key.prefix).toMatch(/^crm_[a-z0-9]{8}$/);
    expect(key.raw.startsWith(`${key.prefix}_`)).toBe(true);
    expect(key.raw.length).toBeGreaterThanOrEqual(50);
    expect(key.hash).toBe(hashApiKey(key.raw));
    expect(key.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(generateApiKey().raw).not.toBe(key.raw);
  });

  it("reads only well-formed bearer tokens", () => {
    const { raw } = generateApiKey();
    expect(readBearerKey(`Bearer ${raw}`)).toBe(raw);
    expect(readBearerKey(raw)).toBeNull();
    expect(readBearerKey("Bearer short")).toBeNull();
    expect(readBearerKey("Bearer abc def ghi jkl mno pqr")).toBeNull();
    expect(readBearerKey(null)).toBeNull();
  });
});

describe("SlidingWindowLimiter", () => {
  it("allows up to the limit per window and reports when to retry", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(3, 60_000, () => now);
    expect(limiter.check("a").allowed).toBe(true);
    now = 10_000;
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a")).toEqual({ allowed: false, retryAfterSeconds: 50 });
    expect(limiter.check("b").allowed).toBe(true);
    now = 60_001;
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("forgets the oldest clients when it tracks too many", () => {
    const limiter = new SlidingWindowLimiter(1, 60_000, () => 0, 2);
    limiter.check("a");
    limiter.check("b");
    limiter.check("c");
    expect(limiter.check("a").allowed).toBe(true);
  });
});

describe("session cookie security", () => {
  it("marks cookies Secure for every public URL, even plain http", async () => {
    const { secureCookiesFor } = await import("@/lib/supabase/cookie-options");
    expect(secureCookiesFor("https://crm.example", "production")).toBe(true);
    expect(secureCookiesFor("http://crm.example", "production")).toBe(true);
  });

  it("turns Secure off only for the local preview on a loopback address", async () => {
    const { secureCookiesFor } = await import("@/lib/supabase/cookie-options");
    expect(secureCookiesFor("http://127.0.0.1:3210", "production")).toBe(false);
    expect(secureCookiesFor("http://localhost:3210", "development")).toBe(false);
    expect(secureCookiesFor("http://127.0.0.1.evil.example", "production")).toBe(true);
  });

  it("refuses to run in production without APP_URL instead of dropping Secure", async () => {
    const { secureCookiesFor } = await import("@/lib/supabase/cookie-options");
    expect(() => secureCookiesFor(undefined, "production")).toThrow(/APP_URL/);
    expect(secureCookiesFor(undefined, "development")).toBe(false);
  });
});
