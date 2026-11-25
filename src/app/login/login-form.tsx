"use client";

import { useActionState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleAlert } from "lucide-react";
import { signIn, type SignInState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { MotionProvider } from "@/components/theme/motion-provider";
import { cn } from "@/lib/cn";

const initial: SignInState = { error: null, email: "" };

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initial);

  // The login sits outside the app's providers; motion follows the system setting and the app's switch here too.
  return (
    <MotionProvider>
      <form action={action} className="mt-8 flex flex-col gap-4" noValidate>
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

        <Button type="submit" variant="primary" size="lg" pending={pending} className="mt-2 w-full">
          Anmelden
        </Button>
      </form>
    </MotionProvider>
  );
}
