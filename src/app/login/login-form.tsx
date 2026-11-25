"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, CircleAlert, KeyRound, LoaderCircle } from "lucide-react";
import { signIn, type SignInState } from "@/lib/actions/auth";
import type { DemoAccess } from "@/lib/demo-access";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { MotionProvider } from "@/components/theme/motion-provider";
import { cn } from "@/lib/cn";

const initial: SignInState = { error: null, email: "" };

export function LoginForm({ demo = null }: { demo?: DemoAccess | null }) {
  const [state, action, pending] = useActionState(signIn, initial);
  const [chosen, setChosen] = useState<string | null>(null);

  // The login sits outside the app's providers; motion follows the system setting and the app's switch here too.
  return (
    <MotionProvider>
      {demo && (
        // Public demo only (DEMO_LOGIN_*): each row is a small form with the same sign-in action,
        // so the password check, the throttle and RLS apply exactly as for typed credentials.
        <section aria-label="Demo-Zugang" className="animate-rise-in mt-8 rounded-[22px] bg-raised p-1.5 [animation-delay:120ms]">
          <div className="flex items-center gap-2.5 px-2.5 pt-1.5 pb-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-fg">
              <KeyRound className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 text-[13px] leading-tight">
              <span className="block font-medium text-fg">Demo-Zugang</span>
              <span className="block text-muted">
                Passwort <span className="figures font-medium text-fg">{demo.password}</span>
              </span>
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {demo.accounts.map((account) => {
              const busy = pending && chosen === account.email;
              return (
                <li key={account.email}>
                  <form action={action} onSubmit={() => setChosen(account.email)}>
                    <input type="hidden" name="email" value={account.email} />
                    <input type="hidden" name="password" value={demo.password} />
                    <button
                      type="submit"
                      disabled={pending}
                      aria-label={`Demo als ${account.role} öffnen (${account.name})`}
                      className="press group flex w-full items-center gap-3 rounded-[18px] bg-surface py-2.5 pr-2.5 pl-3 text-left shadow-card transition-colors hover:bg-hover disabled:cursor-default"
                    >
                      <Avatar name={account.name} size="lg" />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-[14px] font-medium text-fg">
                          {account.role}
                          <span className="font-normal text-muted"> · {account.name}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[12.5px] text-muted">{account.email}</span>
                      </span>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-fg transition-transform duration-200 ease-out group-hover:translate-x-0.5">
                        {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
                      </span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <form action={action} onSubmit={() => setChosen(null)} className={cn("flex flex-col gap-4", demo ? "mt-6" : "mt-8")} noValidate>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg">E-Mail-Adresse</span>
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            defaultValue={state.email}
            placeholder="name@betrieb.de"
            className={cn(inputClasses, "h-11")}
          />
        </label>
        {/* Label outside the field box: the eye button must not become part of the field's name. */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="login-password" className="text-[13px] font-medium text-fg">
            Passwort
          </label>
          <PasswordInput id="login-password" name="password" autoComplete="current-password" required className="h-11" />
        </div>

        <AnimatePresence initial={false}>
          {state.error && (
            <motion.p
              key={state.error}
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", duration: 0.28, bounce: 0.1 }}
              className="flex items-start gap-2 rounded-xl bg-danger/8 px-3 py-2.5 text-sm text-danger"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {state.error}
            </motion.p>
          )}
        </AnimatePresence>

        <Button type="submit" variant="primary" size="lg" pending={pending && chosen === null} disabled={pending} className="mt-2 w-full">
          Anmelden
        </Button>
      </form>
    </MotionProvider>
  );
}
