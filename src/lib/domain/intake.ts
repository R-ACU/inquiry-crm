import { z } from "zod";
import { EVENT_TYPES } from "./status";
import { euroToCents } from "./money";
import { isValidIsoDate, isValidTime, timeToMinutes } from "./time";
import { pick } from "@/lib/i18n";

const T = pick({
  de: { company: "Firma", phone: "Telefon" },
  en: { company: "Company", phone: "Phone" },
});

/** Largest request body the intake endpoint reads, in bytes. */
export const MAX_INTAKE_BODY_BYTES = 16 * 1024;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const hasAtMostTwoDecimals = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

/**
 * Public contract of POST /api/v1/inquiries. Unknown fields are rejected
 * so typos in an integration surface as errors instead of lost data.
 */
export const intakeSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    phone: optionalText(40),
    company: optionalText(160),
    title: z.string().trim().min(3).max(160),
    message: z.string().trim().max(5000).default(""),
    eventType: z.enum(EVENT_TYPES).optional(),
    eventDate: z.string().refine(isValidIsoDate, { message: "Expected a calendar date as YYYY-MM-DD" }).optional(),
    startTime: z.string().refine(isValidTime, { message: "Expected HH:MM" }).optional(),
    endTime: z.string().refine(isValidTime, { message: "Expected HH:MM" }).optional(),
    guestCount: z.number().int().min(1).max(5000).optional(),
    budgetEur: z
      .number()
      .min(0)
      .max(1_000_000)
      .refine(hasAtMostTwoDecimals, { message: "At most two decimal places" })
      .optional(),
    location: optionalText(200),
    source: z.enum(["web_form", "api"]).default("api"),
  })
  .superRefine((value, ctx) => {
    if ((value.startTime || value.endTime) && !value.eventDate) {
      ctx.addIssue({ code: "custom", path: ["eventDate"], message: "Required when a time is given" });
    }
    if (value.endTime && !value.startTime) {
      ctx.addIssue({ code: "custom", path: ["startTime"], message: "Required when endTime is given" });
    }
    if (value.startTime && value.endTime && timeToMinutes(value.endTime) <= timeToMinutes(value.startTime)) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "Must be after startTime" });
    }
  });

export type IntakeInput = z.input<typeof intakeSchema>;
export type IntakePayload = z.output<typeof intakeSchema>;

/** Maps the public camelCase contract to the snake_case payload of public.ingest_inquiry. */
export function toIngestPayload(input: IntakePayload) {
  return {
    name: input.name,
    email: input.email,
    phone: input.phone ?? null,
    company: input.company ?? null,
    title: input.title,
    message: input.message,
    event_type: input.eventType ?? null,
    event_date: input.eventDate ?? null,
    start_time: input.startTime ?? null,
    end_time: input.endTime ?? null,
    guest_count: input.guestCount ?? null,
    budget_cents: input.budgetEur === undefined ? null : euroToCents(input.budgetEur),
    location: input.location ?? null,
    source: input.source,
  };
}

/** Flattens Zod issues into a stable, documented error shape. */
export function describeIssues(error: z.ZodError): { field: string; message: string }[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "(body)",
    message: issue.message,
  }));
}

interface KnownContact {
  full_name: string;
  company: string | null;
  phone: string | null;
}

/**
 * When an intake e-mail matched an existing contact, the database keeps the
 * contact as it was and stores what the sender typed with the inquiry. This
 * lists the typed values that differ from the contact, so staff see them as
 * unconfirmed instead of trusting the known name.
 */
export function unconfirmedIntakeDetails(submitted: unknown, contact: KnownContact): { label: string; value: string }[] {
  if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)) return [];
  const typed = submitted as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const sameText = (a: string, b: string | null) => a.toLowerCase() === (b ?? "").trim().toLowerCase();
  const digits = (value: string | null) => (value ?? "").replace(/\D/g, "");

  const details: { label: string; value: string }[] = [];
  const name = text(typed.name);
  if (name && !sameText(name, contact.full_name)) details.push({ label: "Name", value: name });
  const company = text(typed.company);
  if (company && !sameText(company, contact.company)) details.push({ label: T.company, value: company });
  const phone = text(typed.phone);
  if (phone && digits(phone) !== digits(contact.phone)) details.push({ label: T.phone, value: phone });
  return details;
}
