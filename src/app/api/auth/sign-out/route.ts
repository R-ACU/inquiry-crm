import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/auth/sign-out
 * Ends the session and answers with a redirect the browser follows as a
 * full page load. That drops everything the tab held in memory (the query
 * cache, the views React keeps alive for back navigation), so nothing of
 * this session is left in the page the next person signs in on.
 */
export async function POST(request: NextRequest) {
  // The form posts from this origin. A cross-site POST carries no session
  // cookie anyway (SameSite=Lax); this refuses it outright.
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  // A relative Location: the browser resolves it against the address it posted to. An absolute one
  // built from the server's view of the URL can name another host (localhost for 127.0.0.1), and the
  // CSP rule form-action 'self' then blocks the redirect.
  return new Response(null, { status: 303, headers: { location: "/login", "cache-control": "no-store" } });
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}
