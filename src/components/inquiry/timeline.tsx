import { ArrowRightLeft, CircleDot, FilePenLine, NotebookPen, UserRoundCheck, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Json } from "@/lib/supabase/database.types";
import { isInquiryStatus, SOURCE_LABELS, STATUS_LABELS } from "@/lib/domain/status";
import { formatTimestamp } from "@/lib/domain/time";
import { Avatar } from "@/components/ui/avatar";

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
  const actor = event.actor ? (event.actor.id === viewerId ? "Du" : event.actor.full_name) : null;
  const strong = (text: string) => <span className="text-fg">{text}</span>;
  const iconClass = "size-3.5";

  switch (event.kind) {
    case "created": {
      const source = detail(event.details, "source");
      const label = source && source in SOURCE_LABELS ? SOURCE_LABELS[source as keyof typeof SOURCE_LABELS] : null;
      return {
        icon: <CircleDot className={iconClass} aria-hidden />,
        text:
          source === "manual" || !label ? (
            <>{actor ? <>{strong(actor)} hat die Anfrage angelegt</> : "Anfrage angelegt"}</>
          ) : (
            <>Anfrage über {strong(label)} eingegangen</>
          ),
      };
    }
    case "status_changed": {
      const from = detail(event.details, "from");
      const to = detail(event.details, "to");
      const label = (s: string | null) => (s && isInquiryStatus(s) ? STATUS_LABELS[s] : "unbekannt");
      return {
        icon: <ArrowRightLeft className={iconClass} aria-hidden />,
        text: (
          <>
            {actor ? strong(actor) : "Jemand"} {actor === "Du" ? "hast" : "hat"} den Stand von {label(from)} auf {strong(label(to))} gesetzt
          </>
        ),
      };
    }
    case "assigned": {
      const to = detail(event.details, "to");
      const target = to ? (to === viewerId ? "dir" : names[to] ?? "jemandem") : null;
      return {
        icon: <UserRoundCheck className={iconClass} aria-hidden />,
        text: target ? (
          <>
            {actor ? strong(actor) : "Jemand"} {actor === "Du" ? "hast" : "hat"} die Anfrage {strong(target)} zugewiesen
          </>
        ) : (
          <>{actor ? strong(actor) : "Jemand"} {actor === "Du" ? "hast" : "hat"} die Zuweisung entfernt</>
        ),
      };
    }
    case "ai_draft_accepted":
      return {
        icon: <NotebookPen className={iconClass} aria-hidden />,
        text: (
          <>
            {actor ? strong(actor) : "Jemand"} {actor === "Du" ? "hast" : "hat"} einen KI-Entwurf als Notiz übernommen
          </>
        ),
      };
    case "ai_draft_discarded":
      return {
        icon: <X className={iconClass} aria-hidden />,
        text: (
          <>
            {actor ? strong(actor) : "Jemand"} {actor === "Du" ? "hast" : "hat"} einen KI-Entwurf verworfen
          </>
        ),
      };
    default:
      return {
        icon: <FilePenLine className={iconClass} aria-hidden />,
        text: <>{actor ? strong(actor) : "Jemand"} {actor === "Du" ? "hast" : "hat"} Angaben geändert</>,
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
    return <p className="mt-6 text-sm text-muted">Noch kein Verlauf.</p>;
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
                  {entry.note.author ? (entry.note.author.id === viewerId ? "Du" : entry.note.author.full_name) : "Ehemaliges Mitglied"}
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
