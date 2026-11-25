"use client";

import { useEffect, useLayoutEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { motion, useReducedMotionConfig, type TargetAndTransition } from "motion/react";
import { Eye, EyeOff } from "lucide-react";
import { inputClasses } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { pick } from "@/lib/i18n";

const T = pick({
  de: { show: "Passwort anzeigen" },
  en: { show: "Show password" },
});

/**
 * A blink: the icon that leaves closes like an eyelid, the one that comes
 * opens with a short spring once the first is nearly shut. With reduced
 * motion the icons swap at once.
 */
const OPEN: TargetAndTransition = {
  opacity: 1,
  scaleY: 1,
  transition: {
    scaleY: { type: "spring", duration: 0.28, bounce: 0.4, delay: 0.07 },
    opacity: { duration: 0.1, delay: 0.07 },
  },
};
const SHUT: TargetAndTransition = { opacity: 0, scaleY: 0.1, transition: { duration: 0.09, ease: [0.55, 0, 1, 0.45] } };
const OPEN_REDUCED: TargetAndTransition = { opacity: 1, scaleY: 1, transition: { duration: 0 } };
const SHUT_REDUCED: TargetAndTransition = { opacity: 0, scaleY: 0.1, transition: { duration: 0 } };

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id"> & { id: string };

/**
 * Password field with an eye that shows the password and hides it again.
 *
 * - It stays the same <input>, only its type changes, so password managers
 *   and autofill keep recognising the field (keep `name` and `autoComplete`).
 * - The eye is a toggle button (fixed name, `aria-pressed`). It never sends
 *   the form, and a click or tap leaves focus and caret in the field.
 * - Sending the form hides the password first, so the browser never treats
 *   it as plain text (form history, saving the login).
 * - Spell check and autocorrect are off: shown as text, the password must
 *   not be underlined or sent to a spelling service.
 */
export function PasswordInput({ id, className, ...rest }: PasswordInputProps) {
  const field = useRef<HTMLInputElement>(null);
  const caret = useRef<[number, number] | null>(null);
  const [visible, setVisible] = useState(false);
  const reduce = useReducedMotionConfig();
  const [open, shut] = reduce ? [OPEN_REDUCED, SHUT_REDUCED] : [OPEN, SHUT];

  useEffect(() => {
    const input = field.current;
    const form = input?.form;
    if (!input || !form) return;
    const hide = () => {
      input.type = "password";
      setVisible(false);
    };
    form.addEventListener("submit", hide, true);
    return () => form.removeEventListener("submit", hide, true);
  }, []);

  // Changing the type can move the caret; put it back where it was.
  useLayoutEffect(() => {
    const input = field.current;
    const at = caret.current;
    caret.current = null;
    if (input && at && document.activeElement === input) input.setSelectionRange(at[0], at[1]);
  }, [visible]);

  const toggle = () => {
    const input = field.current;
    if (input && document.activeElement === input) caret.current = [input.selectionStart ?? 0, input.selectionEnd ?? 0];
    setVisible((v) => !v);
  };

  return (
    <div className="relative">
      <input
        ref={field}
        id={id}
        type={visible ? "text" : "password"}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className={cn(inputClasses, "pr-12 [&::-ms-reveal]:hidden", className)}
        {...rest}
      />
      <button
        type="button"
        aria-label={T.show}
        aria-pressed={visible}
        aria-controls={id}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        className="press absolute inset-y-1.5 right-1.5 grid aspect-square place-items-center rounded-full text-muted hover:bg-hover hover:text-fg focus-visible:outline-offset-0"
      >
        <span className="grid *:[grid-area:1/1]" aria-hidden>
          <motion.span data-eye="show" className="grid" initial={false} animate={visible ? shut : open}>
            <Eye className="size-[18px]" />
          </motion.span>
          <motion.span data-eye="hide" className="grid" initial={false} animate={visible ? open : shut}>
            <EyeOff className="size-[18px]" />
          </motion.span>
        </span>
      </button>
    </div>
  );
}
