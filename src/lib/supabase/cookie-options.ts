import type { CookieOptionsWithName } from "@supabase/ssr";

const LOOPBACK_HTTP = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i;

/**
 * Secure is the default. Only a plain-HTTP loopback URL (the local preview)
 * turns it off, so a missing or mistyped APP_URL can never send session
 * cookies over an unencrypted connection. In production APP_URL is
 * required; without it the app stops instead of guessing.
 */
export function secureCookiesFor(appUrl: string | undefined = process.env.APP_URL, nodeEnv = process.env.NODE_ENV): boolean {
  if (!appUrl) {
    if (nodeEnv === "production") throw new Error("Missing environment variable APP_URL. See .env.example.");
    return false;
  }
  return !LOOPBACK_HTTP.test(appUrl);
}

/**
 * Session cookies are HttpOnly: the browser never talks to Supabase
 * directly, so no script needs to read the tokens, and an XSS bug could not
 * steal them. SameSite=Lax blocks cross-site POSTs carrying the session.
 */
export function sessionCookieOptions(): CookieOptionsWithName {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookiesFor(),
    path: "/",
  };
}
