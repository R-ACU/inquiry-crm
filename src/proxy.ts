import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { secureCookiesFor, sessionCookieOptions } from "@/lib/supabase/cookie-options";
import { THEME_COOKIE, THEME_PARAM, resolveTheme } from "@/lib/theme/themes";

const PUBLIC_PATHS = ["/login"];

/**
 * Runs before every page request: stores the chosen theme, refreshes the
 * Supabase session cookies and sends signed-out visitors to the login page.
 * This is an optimistic check for navigation only. Authorization happens in
 * the Data Access Layer and, finally, in Postgres RLS.
 */
export async function proxy(request: NextRequest) {
  // `?firma=<slug>` picks a visual theme. Only a known slug is stored; any
  // other value stores the neutral theme. Set on the request too, so this
  // render already sees it.
  const themeParam = request.nextUrl.searchParams.get(THEME_PARAM);
  const theme = themeParam === null ? null : resolveTheme(themeParam);
  if (theme) request.cookies.set(THEME_COOKIE, theme);

  const response = await route(request);
  if (theme) {
    response.cookies.set(THEME_COOKIE, theme, {
      // Session cookie: no expiry, gone when the browser closes.
      httpOnly: false,
      sameSite: "lax",
      secure: secureCookiesFor(),
      path: "/",
    });
  }
  return response;
}

async function route(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!signedIn && !isPublic && !path.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (signedIn && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Skip static assets and the public intake API, which authenticates with API keys.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|api/v1/).*)"],
};
