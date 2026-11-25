export const INQUIRY_STATUSES = ["new", "quoted", "won", "lost"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const STATUS_LABELS: Record<InquiryStatus, string> = {
  new: "Neu",
  quoted: "Angebot",
  won: "Gewonnen",
  lost: "Verloren",
};

export const OPEN_STATUSES: readonly InquiryStatus[] = ["new", "quoted"];

export function isOpen(status: InquiryStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export function isInquiryStatus(value: unknown): value is InquiryStatus {
  return typeof value === "string" && (INQUIRY_STATUSES as readonly string[]).includes(value);
}

export const EVENT_TYPES = ["corporate", "wedding", "private", "conference", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  corporate: "Firmenfeier",
  wedding: "Hochzeit",
  private: "Private Feier",
  conference: "Tagung",
  other: "Sonstiges",
};

export const SOURCE_LABELS = {
  manual: "Manuell",
  web_form: "Webformular",
  api: "API",
} as const;

export const ROLE_LABELS = {
  owner: "Inhaber",
  staff: "Mitarbeiter",
} as const;
