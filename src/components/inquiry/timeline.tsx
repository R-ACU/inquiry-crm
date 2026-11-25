import { ArrowRightLeft, CircleDot, FilePenLine, NotebookPen, UserRoundCheck, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Json } from "@/lib/supabase/database.types";
import { isInquiryStatus, SOURCE_LABELS, STATUS_LABELS } from "@/lib/domain/status";
import { formatTimestamp } from "@/lib/domain/time";
import { Avatar } from "@/components/ui/avatar";
import { pick } from "@/lib/i18n";

const T = pick({
  de: {
    you: "Du",
    someone: "Jemand",
    unknown: "unbekannt",
    toYou: "dir",
    toSomeone: "jemandem",
    formerMember: "Ehemaliges Mitglied",
    empty: "Noch kein Verlauf.",
    createdBy: (who: ReactNode) => <>{who} hat die Anfrage angelegt</>,
    created: "Anfrage angelegt",
    receivedVia: (source: ReactNode) => <>Anfrage über {source} eingegangen</>,
    statusChanged: (who: ReactNode, you: boolean, from: string, to: ReactNode) => (
      <>
        {who} {you ? "hast" : "hat"} den Stand von {from} auf {to} gesetzt
      </>
    ),
    assigned: (who: ReactNode, you: boolean, target: ReactNode) => (
      <>
        {who} {you ? "hast" : "hat"} die Anfrage {target} zugewiesen
      </>
    ),
    unassigned: (who: ReactNode, you: boolean) => (
      <>
        {who} {you ? "hast" : "hat"} die Zuweisung entfernt
      </>
    ),
    draftAccepted: (who: ReactNode, you: boolean) => (
      <>
        {who} {you ? "hast" : "hat"} einen KI-Entwurf als Notiz übernommen
      </>
    ),
    draftDiscarded: (who: ReactNode, you: boolean) => (
      <>
        {who} {you ? "hast" : "hat"} einen KI-Entwurf verworfen
      </>
    ),
    changed: (who: ReactNode, you: boolean) => (
      <>
        {who} {you ? "hast" : "hat"} Angaben geändert
      </>
    ),
  },
  en: {
    you: "You",
    someone: "Someone",
    unknown: "unknown",
    toYou: "you",
    toSomeone: "someone",
    formerMember: "Former member",
    empty: "No history yet.",
    createdBy: (who: ReactNode) => <>{who} created the inquiry</>,
    created: "Inquiry created",
    receivedVia: (source: ReactNode) => <>Inquiry received via {source}</>,
    statusChanged: (who: ReactNode, _you: boolean, from: string, to: ReactNode) => (
      <>
        {who} moved it from {from} to {to}
      </>
    ),
    assigned: (who: ReactNode, _you: boolean, target: ReactNode) => (
      <>
        {who} assigned the inquiry to {target}
      </>
    ),
    unassigned: (who: ReactNode) => <>{who} removed the assignment</>,
    draftAccepted: (who: ReactNode) => <>{who} saved an AI draft as a note</>,
    draftDiscarded: (who: ReactNode) => <>{who} discarded an AI draft</>,
    changed: (who: ReactNode) => <>{who} changed details</>,
  },
});

const strong = (text: string) => <span className="text-fg">{text}</span>;

interface Note {
  id: string;
  body: string;
  created_at: string;
  author: { id: string; full_name: string } | null;
}

interface HistoryEvent {
  id: number;
  kind: string;
  details: Json;
  created_at: string;
  actor: { id: string; full_name: string } | null;
}

type Entry = { type: "note"; at: string; note: Note } | { type: "event"; at: string; event: HistoryEvent };

function detail(details: Json, key: string): string | null {
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const value = (details as Record<string, Json | undefined>)[key];
    return typeof value === "string" ? value : null;
  }
  return null;
}

function describe(event: HistoryEvent, names: Record<string, string>, viewerId: string): { icon: ReactNode; text: ReactNode } {
  const actor = event.actor ? (event.actor.id === viewerId ? T.you : event.actor.full_name) : null;
  const you = actor === T.you;
  const who = actor ? strong(actor) : T.someone;
  const iconClass = "size-3.5";

  switch (event.kind) {
    case "created": {
      const source = detail(event.details, "source");
      const label = source && source in SOURCE_LABELS ? SOURCE_LABELS[source as keyof typeof SOURCE_LABELS] : null;
      return {
        icon: <CircleDot className={iconClass} aria-hidden />,
        text:
          source === "manual" || !label ? (
            <>{actor ? T.createdBy(strong(actor)) : T.created}</>
          ) : (
            T.receivedVia(strong(label))
          ),
      };
    }
    case "status_changed": {
      const from = detail(event.details, "from");
      const to = detail(event.details, "to");
      const label = (s: string | null) => (s && isInquiryStatus(s) ? STATUS_LABELS[s] : T.unknown);
      return {
        icon: <ArrowRightLeft className={iconClass} aria-hidden />,
        text: T.statusChanged(who, you, label(from), strong(label(to))),
      };
    }
    case "assigned": {
      const to = detail(event.details, "to");
      const target = to ? (to === viewerId ? T.toYou : names[to] ?? T.toSomeone) : null;
      return {
        icon: <UserRoundCheck className={iconClass} aria-hidden />,
        text: target ? T.assigned(who, you, strong(target)) : T.unassigned(who, you),
      };
    }
    case "ai_draft_accepted":
      return {
        icon: <NotebookPen className={iconClass} aria-hidden />,
        text: T.draftAccepted(who, you),
      };
    case "ai_draft_discarded":
      return {
        icon: <X className={iconClass} aria-hidden />,
        text: T.draftDiscarded(who, you),
      };
    default:
      return {
        icon: <FilePenLine className={iconClass} aria-hidden />,
        text: T.changed(who, you),
      };
  }
}

export function Timeline({
  notes,
  events,
  names,
  viewerId,
}: {
  notes: Note[];
  events: HistoryEvent[];
  names: Record<string, string>;
  viewerId: string;
}) {
  const entries: Entry[] = [
    ...notes.map((note): Entry => ({ type: "note", at: note.created_at, note })),
    ...events.map((event): Entry => ({ type: "event", at: event.created_at, event })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  if (entries.length === 0) {
    return <p className="mt-6 text-sm text-muted">{T.empty}</p>;
  }

  return (
    <ol className="relative mt-7 flex flex-col gap-5 before:absolute before:top-3 before:bottom-3 before:left-[15px] before:w-0.5 before:rounded-full before:bg-raised">
      {entries.map((entry) =>
        entry.type === "note" ? (
          <li key={`n-${entry.note.id}`} className="animate-rise-in relative flex gap-3">
            <Avatar name={entry.note.author?.full_name ?? "?"} className="ring-4 ring-surface" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-muted">
                <span className="text-fg">
                  {entry.note.author ? (entry.note.author.id === viewerId ? T.you : entry.note.author.full_name) : T.formerMember}
                </span>
                <span className="figures ml-2 text-xs text-muted">{formatTimestamp(entry.note.created_at)}</span>
              </p>
              <p className="mt-1.5 max-w-prose rounded-2xl rounded-tl-md bg-raised px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                {entry.note.body}
              </p>
            </div>
          </li>
        ) : (
          <li key={`e-${entry.event.id}`} className="relative flex items-start gap-3">
            {(() => {
              const { icon, text } = describe(entry.event, names, viewerId);
              return (
                <>
                  <span className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-raised text-muted ring-4 ring-surface">
                    {icon}
                  </span>
                  <p className="pt-1 text-[13px] leading-relaxed text-muted">
                    {text}
                    <span className="figures ml-2 text-xs text-muted">{formatTimestamp(entry.event.created_at)}</span>
                  </p>
                </>
              );
            })()}
          </li>
        ),
      )}
    </ol>
  );
}
