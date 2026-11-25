/**
 * The English build (APP_LOCALE=en, inlined by next.config.ts): texts, formats
 * and the business time zone switch together, and nothing German is left in
 * what the server builds without a page (calendar file, assistant drafts).
 * The other unit tests cover the German default.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

/** Typical German words and letters; a match in English output means a text was missed. */
export const GERMAN = /[äöüÄÖÜß]|\b(und|der|die|das|nicht|keine|mit|für|zur|vom|bis|Uhr|Gäste|Personen|Anfrage|Anfragen|Kontakt|Notiz|Entwurf|Budget offen|Datum|offen|heute|gestern|Neu|Angebot|Gewonnen|Verloren|Inhaber|Mitarbeiter|Firmenfeier|Hochzeit|Tagung|Sonstiges|Webformular)\b/;

async function inEnglish<T>(load: () => Promise<T>): Promise<T> {
  vi.stubEnv("APP_LOCALE", "en");
  vi.resetModules();
  return load();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the English build", () => {
  it("formats money, dates and times for Ireland", async () => {
    const { formatEuro } = await inEnglish(() => import("@/lib/domain/money"));
    const time = await import("@/lib/domain/time");
    const { formatPercent } = await import("@/lib/domain/kpis");
    const now = new Date("2026-11-24T12:00:00Z");
    expect(formatEuro(150_000)).toBe("€1,500");
    expect(formatEuro(4_850)).toBe("€48.50");
    expect(formatEuro(null)).toBe("open");
    expect(time.formatEventDate("2026-12-12")).toBe("Sat 12 Dec 2026");
    expect(time.formatTimestamp("2026-11-24T09:14:00Z")).toBe("24 Nov 2026, 09:14");
    expect(time.formatRelativeDay("2026-11-10T08:00:00Z", now)).toBe("10 Nov");
    expect(time.formatEventDate(null)).toBe("Date open");
    expect(time.formatTimeRange("18:00:00", "23:00:00")).toBe("18:00 to 23:00");
    expect(time.formatTimeRange("18:00:00", null)).toBe("from 18:00");
    expect(time.formatRelativeDay("2026-11-24T08:00:00Z", now)).toBe("today");
    expect(time.formatRelativeDay("2026-11-23T08:00:00Z", now)).toBe("yesterday");
    expect(time.formatRelativeDay("2026-11-20T08:00:00Z", now)).toBe("4 days ago");
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(null)).toBe("none yet");
  });

  it("names statuses, event types, sources and roles in English", async () => {
    const status = await inEnglish(() => import("@/lib/domain/status"));
    const labels = [
      ...Object.values(status.STATUS_LABELS),
      ...Object.values(status.EVENT_TYPE_LABELS),
      ...Object.values(status.SOURCE_LABELS),
      ...Object.values(status.ROLE_LABELS),
    ];
    expect(status.STATUS_LABELS).toEqual({ new: "New", quoted: "Quoted", won: "Won", lost: "Lost" });
    expect(labels.filter((label) => GERMAN.test(label))).toEqual([]);
  });

  it("keeps event times in Irish time and exports them in UTC", async () => {
    const time = await inEnglish(() => import("@/lib/domain/time"));
    const { LOCALE, INTL_LOCALE, BUSINESS_TIME_ZONE } = await import("@/lib/i18n");
    expect({ LOCALE, INTL_LOCALE, BUSINESS_TIME_ZONE }).toEqual({ LOCALE: "en", INTL_LOCALE: "en-IE", BUSINESS_TIME_ZONE: "Europe/Dublin" });
    // Winter: Dublin is UTC. Summer: Irish Standard Time, UTC+1.
    expect(time.zonedTimeToUtc("2026-12-12", "18:00").toISOString()).toBe("2026-12-12T18:00:00.000Z");
    expect(time.zonedTimeToUtc("2027-06-18", "15:00").toISOString()).toBe("2027-06-18T14:00:00.000Z");
  });

  it("writes the calendar file in English", async () => {
    const { buildInquiryIcs } = await inEnglish(() => import("@/lib/domain/ics"));
    const ics = buildInquiryIcs(
      {
        id: "e1000000-0000-4000-8000-000000000001",
        title: "Christmas party",
        status: "new",
        event_date: "2026-12-12",
        start_time: "18:00:00",
        end_time: "23:00:00",
        guest_count: 40,
        budget_cents: 150_000,
        location: "Hanover Quay",
        contact_name: "Ronan Doyle",
      },
      { now: new Date("2026-11-24T09:00:00Z"), appUrl: "https://crm.example/" },
    );
    expect(ics).toContain("DTSTART:20261212T180000Z\r\n");
    expect(ics).toContain("DTEND:20261212T230000Z\r\n");
    expect(ics).toMatch(/Guests: 40/);
    expect(ics).toMatch(/€1\\?,500/);
    expect(GERMAN.test(ics)).toBe(false);
  });

  it("drafts in English in test mode, from the English fixtures and from the rules", async () => {
    const { mockDraft } = await inEnglish(() => import("@/lib/ai/mock"));
    const base = {
      message: "",
      event_type: null,
      event_date: null,
      start_time: null,
      end_time: null,
      guest_count: null,
      budget_cents: null,
      location: null,
      contact_name: "Ronan Doyle",
      company: null,
    };
    const fixed = mockDraft({ ...base, id: "e1000000-0000-4000-8000-000000000001", title: "Christmas party" });
    expect(fixed.summary).toMatch(/Christmas party/);
    const ruled = mockDraft({ ...base, id: "e1000000-0000-4000-8000-000000000099", title: "Wedding in the garden" });
    expect(ruled.suggestedEventType).toBe("wedding");
    for (const draft of [fixed, ruled]) {
      expect([draft.summary, ...draft.questions].filter((text) => GERMAN.test(text))).toEqual([]);
    }
  });

  it("asks the real model for English answers", async () => {
    const prompts = await inEnglish(() => import("@/lib/ai/prompts"));
    const text = Object.values(prompts)
      .map((value) => (typeof value === "function" ? "" : JSON.stringify(value)))
      .join(" ");
    expect(text).toMatch(/English/);
    expect(GERMAN.test(text)).toBe(false);
  });
});
