import { getMember } from "@/lib/auth/dal";
import { listBoardInquiries } from "@/lib/data/queries";
import { apiError } from "@/lib/http";

/**
 * GET /api/inquiries
 * Board data for the signed-in user, used by the client cache to refetch
 * after a change. Same query as the server render, same RLS.
 */
export async function GET() {
  const member = await getMember();
  if (!member) return apiError(401, "unauthorized", "Sign in first.");
  const inquiries = await listBoardInquiries();
  return Response.json({ data: inquiries }, { headers: { "cache-control": "private, no-store" } });
}
