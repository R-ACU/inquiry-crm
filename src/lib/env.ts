import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

/**
 * Server-side configuration. Nothing here is exposed to the browser: the
 * browser never talks to Supabase directly, every query runs on the server
 * with the user's session and passes through RLS.
 */
export const serverEnv = {
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  /** The project's publishable (anon) key. Safe by design, still kept server-side. */
  get supabaseKey() {
    return required("SUPABASE_PUBLISHABLE_KEY");
  },
  /**
   * Public URL of the app. Required in production, because it also decides
   * whether session cookies are Secure (see cookie-options.ts).
   */
  get appUrl() {
    if (process.env.NODE_ENV === "production") return required("APP_URL");
    return process.env.APP_URL ?? "http://127.0.0.1:3210";
  },
};
