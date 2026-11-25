"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { refreshViews } from "@/lib/client/views";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Sparkles } from "lucide-react";
import { acceptDraft, discardDraft, requestDraft } from "@/lib/actions/inquiries";
import { EVENT_TYPE_LABELS, type EventType } from "@/lib/domain/status";
import { formatTimestamp } from "@/lib/domain/time";
import { Button } from "@/components/ui/button";
import { IconCircle } from "@/components/ui/page-header";
import { useToast } from "@/components/shell/providers";
import { pick } from "@/lib/i18n";

const T = pick({
  de: {
    accepted: "Entwurf als Notiz übernommen.",
    discarded: "Entwurf verworfen.",
    createdLine: (timestamp: string, model: string) =>
      `Erstellt ${timestamp} ${model === "mock" ? "im Testmodus mit festen Beispielantworten, ohne KI-Aufruf" : `von ${model}`}. Der Entwurf ändert nichts an der Anfrage, bis du ihn übernimmst.`,
    heading: "Assistent",
    subtitle: "Fasst zusammen und schlägt Rückfragen vor. Entscheiden tust du.",
    testMode: "Testmodus",
    reading: "Die Anfrage wird gelesen und zusammengefasst.",
    draft: "Entwurf",
    suggestedQuestions: "Vorgeschlagene Rückfragen",
    classifiedAs: "Eingeordnet als",
    accept: "Als Notiz übernehmen",
    copied: "Kopiert",
    copyQuestions: "Rückfragen kopieren",
    discard: "Verwerfen",
    idle: "Liest die Anfrage, fasst sie in zwei Sätzen zusammen und schlägt Rückfragen für ein Angebot vor. Nichts wird gespeichert, bis du den Entwurf übernimmst.",
    create: "Entwurf erstellen",
  },
  en: {
    accepted: "Draft saved as a note.",
    discarded: "Draft discarded.",
    createdLine: (timestamp: string, model: string) =>
      `Created ${timestamp} ${model === "mock" ? "in test mode with fixed sample replies, no AI call" : `by ${model}`}. The draft changes nothing about the inquiry until you save it.`,
    heading: "Assistant",
    subtitle: "Summarises and suggests follow-up questions. You decide.",
    testMode: "Test mode",
    reading: "Reading and summarising the inquiry.",
    draft: "Draft",
    suggestedQuestions: "Suggested follow-up questions",
    classifiedAs: "Classified as",
    accept: "Save as note",
    copied: "Copied",
    copyQuestions: "Copy questions",
    discard: "Discard",
    idle: "Reads the inquiry, summarises it in two sentences and suggests follow-up questions for a quote. Nothing is saved until you accept the draft.",
    create: "Create draft",
  },
});

export interface DraftView {
  id: string;
  summary: string;
  questions: string[];
  suggestedEventType: EventType | null;
  model: string;
  createdAt: string;
}

const swap = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4, transition: { duration: 0.12 } },
  transition: { type: "spring", duration: 0.32, bounce: 0.1 },
} as const;

/**
 * The assistant only proposes. A draft is stored as pending and changes
 * nothing about the inquiry until a person accepts it, which turns it into
 * a note in their name. Discarding is logged as well.
 */
export function DraftPanel({
  inquiryId,
  draft,
  mode,
}: {
  inquiryId: string;
  draft: DraftView | null;
  mode: "mock" | "anthropic";
}) {
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"create" | "accept" | "discard" | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();

  function run(kind: "create" | "accept" | "discard") {
    setAction(kind);
    startTransition(async () => {
      const result =
        kind === "create"
          ? await requestDraft(inquiryId)
          : kind === "accept"
            ? await acceptDraft(draft!.id, inquiryId)
            : await discardDraft(draft!.id, inquiryId);
      setAction(null);
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      if (kind === "accept") {
        toast("success", T.accepted);
        await refreshViews(queryClient);
      }
      if (kind === "discard") toast("success", T.discarded);
      router.refresh();
    });
  }

  async function copyQuestions() {
    if (!draft) return;
    await navigator.clipboard.writeText(draft.questions.map((q) => `- ${q}`).join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const state = pending && action === "create" ? "loading" : draft ? "draft" : "idle";

  return (
    <section aria-labelledby="assistant-heading" className="flex flex-col rounded-card bg-surface p-6 shadow-card md:p-7">
      <header className="flex items-center gap-3.5">
        <IconCircle icon={Sparkles} tone="soft" />
        <div className="min-w-0 flex-1">
          <h2 id="assistant-heading" className="heading text-[17px]">
            {T.heading}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">{T.subtitle}</p>
        </div>
        <span className="hidden rounded-full bg-raised px-3 py-1 text-xs font-medium text-muted sm:inline">{mode === "mock" ? T.testMode : "Claude"}</span>
      </header>

      <div className="mt-5" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {state === "loading" ? (
            <motion.div key="loading" {...swap} aria-busy="true" className="rounded-inner bg-raised p-5">
              <p className="text-[13px] text-muted">{T.reading}</p>
              <div className="mt-3 flex flex-col gap-2">
                <div className="skeleton h-4 bg-hover" />
                <div className="skeleton h-4 w-11/12 bg-hover" />
                <div className="skeleton h-4 w-2/3 bg-hover" />
              </div>
            </motion.div>
          ) : state === "draft" && draft ? (
            <motion.div key={`draft-${draft.id}`} {...swap}>
              {/* Card in card: the draft sits on its own surface until someone decides. */}
              <div className="rounded-inner bg-accent-soft p-5">
                <span className="inline-flex h-6 items-center rounded-full bg-surface px-2.5 text-xs font-medium text-accent-fg">{T.draft}</span>
                <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-fg">{draft.summary}</p>
              </div>
              <h3 className="mt-5 text-[13px] font-medium text-muted">{T.suggestedQuestions}</h3>
              <ol className="mt-2 flex flex-col gap-2">
                {draft.questions.map((question, i) => (
                  <motion.li
                    key={question}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ type: "spring", duration: 0.3, bounce: 0.1, delay: 0.06 * (i + 1) }}
                    className="flex gap-3 rounded-2xl bg-raised px-4 py-3 text-sm leading-relaxed"
                  >
                    <span className="figures inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-muted">{i + 1}</span>
                    {question}
                  </motion.li>
                ))}
              </ol>
              {draft.suggestedEventType && (
                <p className="mt-4 text-[13px] text-muted">
                  {T.classifiedAs} <span className="font-medium text-fg">{EVENT_TYPE_LABELS[draft.suggestedEventType]}</span>
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Button variant="primary" pending={pending && action === "accept"} disabled={pending} onClick={() => run("accept")}>
                  {T.accept}
                </Button>
                <Button variant="secondary" onClick={copyQuestions} icon={copied ? <Check className="text-accent" aria-hidden /> : <Copy aria-hidden />}>
                  {copied ? T.copied : T.copyQuestions}
                </Button>
                <Button variant="ghost" pending={pending && action === "discard"} disabled={pending} onClick={() => run("discard")}>
                  {T.discard}
                </Button>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted">
                {T.createdLine(formatTimestamp(draft.createdAt), draft.model)}
              </p>
            </motion.div>
          ) : (
            <motion.div key="idle" {...swap} className="flex flex-col gap-4 rounded-inner bg-raised p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-md text-[13px] leading-relaxed text-muted">
                {T.idle}
              </p>
              <Button variant="primary" disabled={pending} onClick={() => run("create")} icon={<Sparkles aria-hidden />} className="self-start sm:self-auto">
                {T.create}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
