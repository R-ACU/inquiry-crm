import type { NextRequest } from "next/server";
import { z } from "zod";
import { getMember } from "@/lib/auth/dal";
import { getInquiry } from "@/lib/data/queries";
import { buildInquiryIcs, icsFileName } from "@/lib/domain/ics";
import { apiError } from "@/lib/http";
import { serverEnv } from "@/lib/env";
import { pick } from "@/lib/i18n";

const T = pick({
  de: { unknownContact: "Unbekannt" },
  en: { unknownContact: "Unknown" },
});

/**
 * GET /api/inquiries/:id/calendar
 * Downloads the event of one inquiry as an .ics file. The inquiry is loaded
 * with the user's session, so a staff member only gets their own events.
 */
export async function GET(_request: NextRequest, context: RouteContext<"/api/inquiries/[id]/calendar">) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Inquiry not found.");

  const member = await getMember();
  if (!member) return apiError(401, "unauthorized", "Sign in first.");

  const inquiry = await getInquiry(id);
  if (!inquiry) return apiError(404, "not_found", "Inquiry not found.");
  if (!inquiry.event_date) return apiError(409, "missing_event_date", "This inquiry has no event date yet.");

  const ics = buildInquiryIcs(
    { ...inquiry, contact_name: inquiry.contact?.full_name ?? T.unknownContact },
    { now: new Date(), appUrl: serverEnv.appUrl },
  );

  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${icsFileName(inquiry.title, inquiry.event_date)}"`,
      "cache-control": "private, no-store",
    },
  });
}
