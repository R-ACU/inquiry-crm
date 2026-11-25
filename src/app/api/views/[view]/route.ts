import type { NextRequest } from "next/server";
import { getMember } from "@/lib/auth/dal";
import { VIEW_LOADERS, isViewName } from "@/lib/data/views";
import { apiError } from "@/lib/http";

/**
 * GET /api/views/:view (overview, contacts, assignees, team)
 * The data of one main view for the signed-in user. The client cache calls
 * it to refresh a view in the background, for example after a change made
 * elsewhere. Same loaders as the page render, same RLS; never cached.
 */
export async function GET(_request: NextRequest, context: RouteContext<"/api/views/[view]">) {
  const { view } = await context.params;
  if (!isViewName(view)) return apiError(404, "not_found", "Unknown view.");

  const member = await getMember();
  if (!member) return apiError(401, "unauthorized", "Sign in first.");

  const data = await VIEW_LOADERS[view]();
  return Response.json({ data }, { headers: { "cache-control": "private, no-store" } });
}
