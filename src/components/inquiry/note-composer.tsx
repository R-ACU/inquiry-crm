"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addNote } from "@/lib/actions/inquiries";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/shell/providers";

/** Tallest the field grows before it scrolls inside: about 14 lines. */
const MAX_HEIGHT = 320;

/**
 * Sizes the field to its text, like a chat composer: three lines when
 * empty, growing line by line, scrolling only past MAX_HEIGHT. There is no
 * drag handle, so nothing sits in the middle of the composer.
 */
function fitToContent(field: HTMLTextAreaElement) {
  field.style.height = "auto";
  const full = field.scrollHeight;
  field.style.height = `${Math.min(full, MAX_HEIGHT)}px`;
  field.style.overflowY = full > MAX_HEIGHT ? "auto" : "hidden";
}

export function NoteComposer({ inquiryId }: { inquiryId: string }) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const toast = useToast();

  useLayoutEffect(() => {
    if (ref.current) fitToContent(ref.current);
  }, [body]);

  // A narrower window wraps the text onto more lines.
  useEffect(() => {
    const refit = () => {
      if (ref.current) fitToContent(ref.current);
    };
    window.addEventListener("resize", refit);
    return () => window.removeEventListener("resize", refit);
  }, []);

  function submit() {
    if (!body.trim()) return;
    startTransition(async () => {
      const result = await addNote(inquiryId, body);
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <form
      className="rounded-inner bg-raised transition-shadow duration-150 focus-within:shadow-[0_0_0_2px_var(--color-accent),0_0_0_6px_var(--color-accent-soft)]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="note-body" className="sr-only">
        Notiz
      </label>
      <textarea
        id="note-body"
        ref={ref}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        rows={3}
        maxLength={4000}
        placeholder="Notiz für das Team, zum Beispiel ein Telefonat oder eine Absprache"
        className="scroll-quiet block w-full resize-none overflow-hidden rounded-t-[22px] bg-transparent px-5 pt-4 pb-2 text-sm placeholder:text-faint focus:outline-none focus-visible:outline-none"
      />
      {/* The footer belongs to the field: a click beside the button puts the cursor into the text. */}
      <div
        className="flex cursor-text items-center justify-between gap-3 px-3 pb-3"
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          e.preventDefault();
          const field = ref.current;
          if (!field) return;
          field.focus();
          field.setSelectionRange(field.value.length, field.value.length);
        }}
      >
        <span className="hidden pl-2 text-xs text-muted sm:inline">Strg und Enter speichert</span>
        <Button type="submit" variant="primary" size="sm" pending={pending} disabled={!body.trim()} className="ml-auto">
          Notiz speichern
        </Button>
      </div>
    </form>
  );
}
