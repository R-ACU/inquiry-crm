import { pick } from "@/lib/i18n";

export const INQUIRY_STATUSES = ["new", "quoted", "won", "lost"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const STATUS_LABELS: Record<InquiryStatus, string> = pick({
  de: { new: "Neu", quoted: "Angebot", won: "Gewonnen", lost: "Verloren" },
  en: { new: "New", quoted: "Quoted", won: "Won", lost: "Lost" },
});

export const OPEN_STATUSES: readonly InquiryStatus[] = ["new", "quoted"];

export function isOpen(status: InquiryStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export function isInquiryStatus(value: unknown): value is InquiryStatus {
  return typeof value === "string" && (INQUIRY_STATUSES as readonly string[]).includes(value);
}

export const EVENT_TYPES = ["corporate", "wedding", "private", "conference", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = pick({
  de: { corporate: "Firmenfeier", wedding: "Hochzeit", private: "Private Feier", conference: "Tagung", other: "Sonstiges" },
  en: { corporate: "Corporate event", wedding: "Wedding", private: "Private party", conference: "Conference", other: "Other" },
});

export const SOURCE_LABELS: Record<"manual" | "web_form" | "api", string> = pick({
  de: { manual: "Manuell", web_form: "Webformular", api: "API" },
  en: { manual: "Manual", web_form: "Web form", api: "API" },
});

export const ROLE_LABELS: Record<"owner" | "staff", string> = pick({
  de: { owner: "Inhaber", staff: "Mitarbeiter" },
  en: { owner: "Owner", staff: "Staff" },
});
