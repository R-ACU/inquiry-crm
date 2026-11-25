"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAnonClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { clientAddressFrom } from "@/lib/http";
import { pick } from "@/lib/i18n";

const T = pick({
  de: {
    throttled: "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.",
    missing: "Bitte E-Mail-Adresse und Passwort eingeben.",
    unavailable: "Die Anmeldung ist gerade nicht möglich. Bitte später erneut versuchen.",
    wrong: "E-Mail-Adresse oder Passwort ist falsch.",
  },
  en: {
    throttled: "Too many sign-in attempts. Please try again in 15 minutes.",
    missing: "Please enter your email address and password.",
    unavailable: "Signing in is not possible right now. Please try again later.",
    wrong: "Email address or password is incorrect.",
  },
});

export interface SignInState {
  error: string | null;
  email: string;
}

const credentials = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
});

/**
 * Sign-in runs on the server, so Supabase Auth sees the server's address for
 * every user and its own per-address limit would be shared by everyone. The
 * app therefore throttles in the database first: 5 failures per e-mail
 * address and 20 per client address within 15 minutes
 * (public.login_allowed / public.record_login_failure). Known and unknown
 * addresses are treated the same, so the limit reveals no accounts.
 */
export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const parsed = credentials.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) return { error: T.missing, email };

  const client = clientAddressFrom(await headers());
  const throttle = createSupabaseAnonClient();
  const allowed = await throttle.rpc("login_allowed", { p_email: parsed.data.email, p_client: client });
  if (allowed.error) {
    // Fail closed: without the throttle there is no sign-in.
    console.error("login throttle unavailable", { code: allowed.error.code });
    return { error: T.unavailable, email };
  }
  if (allowed.data !== true) return { error: T.throttled, email };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    await throttle.rpc("record_login_failure", { p_email: parsed.data.email, p_client: client });
    // One message for unknown e-mail and wrong password, so accounts cannot be enumerated.
    return { error: T.wrong, email };
  }
  redirect("/");
}
