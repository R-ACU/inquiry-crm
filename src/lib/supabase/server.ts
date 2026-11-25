import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import type { Database } from "./database.types";
import { sessionCookieOptions } from "./cookie-options";

/**
 * Supabase client bound to the signed-in user's session cookies. Every query
 * runs as that user, so Postgres RLS decides what comes back. Create one per
 * request, never share it.
 */
export async function createSupabaseServerClient() {
  // Session data is per request. Mark the render as request-time before the
  // auth client reads the clock, so it is never part of a prerendered shell.
  await connection();
  const cookieStore = await cookies();
  return createServerClient<Database>(serverEnv.supabaseUrl, serverEnv.supabaseKey, {
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot write cookies. The proxy refreshes the
          // session on every request, so this write is not needed there.
        }
      },
    },
  });
}

/**
 * Client without any user session, for the public intake API. It runs as the
 * anon role, which has no table privileges and may only call
 * public.ingest_inquiry. The app never holds a service-role key.
 */
export function createSupabaseAnonClient() {
  return createPlainClient<Database>(serverEnv.supabaseUrl, serverEnv.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
