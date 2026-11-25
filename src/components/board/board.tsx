"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { CalendarClock, Inbox, SearchX, ShieldQuestion, UsersRound, Wallet } from "lucide-react";
import type { BoardInquiry } from "@/lib/data/queries";
import { moveInquiry } from "@/lib/actions/inquiries";
import { formatEuro } from "@/lib/domain/money";
import { INQUIRY_STATUSES, isOpen, STATUS_LABELS, type InquiryStatus } from "@/lib/domain/status";
import { Dropdown } from "@/components/ui/dropdown";
import { buttonClasses } from "@/components/ui/button";
import { StatusDot } from "@/components/status";
import { BOARD_KEY, VIEW_KEYS, fetchBoard, fetchView, refreshViews, useFirstAppearance, useViewData } from "@/lib/client/views";
import type { AssigneesData } from "@/lib/data/views";
import { DateTile, countdownLabel, daysUntil } from "@/components/date-tile";
import { Avatar, EmptyAvatar } from "@/components/ui/avatar";
import { PageHeader, SearchField } from "@/components/ui/page-header";
import { SPRING } from "@/components/ui/segmented";
import { useMember, useToast } from "@/components/shell/providers";
import { useRiseIn } from "@/components/ui/rise-in";
import { cn } from "@/lib/cn";

function byEventDate(a: BoardInquiry, b: BoardInquiry) {
  if (a.event_date === b.event_date) return b.created_at.localeCompare(a.created_at);
  if (!a.event_date) return 1;
  if (!b.event_date) return -1;
  return a.event_date.localeCompare(b.event_date);
}

/**
 * One place on the board. The card rises in with the board's entrance (once,
 * see ui/rise-in.ts) and glides when it moves to another column (shared
 * layout id).
 */
function CardSlot({ id, index, rise, children }: { id: string; index: number; rise: boolean; children: ReactNode }) {
  const ref = useRiseIn<HTMLDivElement>(rise, Math.min(index, 8) * 30);
  return (
    <motion.li layout="position" layoutId={`card-${id}`} transition={SPRING}>
      <div ref={ref}>{children}</div>
    </motion.li>
  );
}

/**
 * The pipeline as four columns. Cards are dragged with the browser's own
 * drag and drop; after a drop the card glides to its new place (shared
 * layout id), the change is saved optimistically and rolled back on error.
 */
export function Board({ inquiries: fromServer, team: teamFromServer }: { inquiries: Promise<BoardInquiry[]>; team: Promise<AssigneesData> }) {
  const member = useMember();
  const viewer = { id: member.id, role: member.role, firstName: member.fullName.split(" ")[0] };
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState<string>("all");
  const [dropTarget, setDropTarget] = useState<InquiryStatus | null>(null);
  const [visibleColumn, setVisibleColumn] = useState<InquiryStatus>("new");
  const [dragging, setDragging] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Cards rise in once when the board first appears (not when a kept board is rebuilt, see
  // ui/entrance.ts); later moves glide instead.
  const entrance = useFirstAppearance("board");
  const [entered, setEntered] = useState(!entrance);
  useEffect(() => {
    const timer = window.setTimeout(() => setEntered(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  // Cached after the first visit, refreshed in the background (lib/client/views.ts).
  const inquiries = useViewData(BOARD_KEY, fromServer, fetchBoard);
  const team = useViewData(VIEW_KEYS.assignees, teamFromServer, () => fetchView<AssigneesData>("assignees"));

  const move = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: InquiryStatus }) => {
      const result = await moveInquiry(id, status);
      if (!result.ok) throw new Error(result.error);
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: BOARD_KEY });
      const previous = queryClient.getQueryData<BoardInquiry[]>(BOARD_KEY);
      queryClient.setQueryData<BoardInquiry[]>(BOARD_KEY, (list) =>
        list?.map((inquiry) => (inquiry.id === id ? { ...inquiry, status } : inquiry)),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(BOARD_KEY, context.previous);
      toast("error", error.message);
    },
    onSuccess: (_data, { status }) => toast("success", `Verschoben nach ${STATUS_LABELS[status]}.`),
    // The move changes figures elsewhere too (overview, open counts per contact).
    onSettled: () => refreshViews(queryClient),
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return inquiries.filter((inquiry) => {
      if (assignee === "unassigned" && inquiry.assignee) return false;
      if (assignee !== "all" && assignee !== "unassigned" && inquiry.assignee?.id !== assignee) return false;
      if (!needle) return true;
      return [inquiry.title, inquiry.contact?.full_name, inquiry.contact?.company]
        .filter(Boolean)
        .some((text) => text!.toLowerCase().includes(needle));
    });
  }, [inquiries, search, assignee]);

  const columns = useMemo(
    () => INQUIRY_STATUSES.map((status) => ({ status, items: filtered.filter((i) => i.status === status).sort(byEventDate) })),
    [filtered],
  );

  const assigneeOptions = [
    { value: "all", label: "Alle im Team" },
    { value: "unassigned", label: "Nicht zugewiesen" },
    ...team.map((m) => ({ value: m.id, label: m.fullName })),
  ];

  const filtering = search.trim() !== "" || assignee !== "all";

  function resetFilters() {
    setSearch("");
    setAssignee("all");
  }

  /** Phone layout: the columns sit side by side in a swipe row. */
  function showColumn(status: InquiryStatus) {
    const section = scroller.current?.querySelector<HTMLElement>(`section[data-status="${status}"]`);
    section?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    setVisibleColumn(status);
  }

  function onSwipe() {
    const row = scroller.current;
    if (!row || row.scrollWidth <= row.clientWidth) return;
    const sections = [...row.querySelectorAll<HTMLElement>("section[data-status]")];
    const distance = (section: HTMLElement) => Math.abs(section.offsetLeft - row.offsetLeft - row.scrollLeft);
    const closest = sections.reduce((best, section) => (distance(section) < distance(best) ? section : best));
    setVisibleColumn(closest.dataset.status as InquiryStatus);
  }

  function onDrop(event: DragEvent, status: InquiryStatus) {
    event.preventDefault();
    setDropTarget(null);
    setDragging(null);
    const id = event.dataTransfer.getData("text/inquiry-id");
    const inquiry = inquiries.find((i) => i.id === id);
    if (inquiry && inquiry.status !== status) move.mutate({ id, status });
  }

  const openCents = filtered.filter((i) => isOpen(i.status)).reduce((sum, i) => sum + (i.budget_cents ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Anfragen"
        actions={
          <>
            <SearchField value={search} onChange={setSearch} label="Anfragen durchsuchen" placeholder="Titel, Kontakt oder Firma" className="sm:w-72" />
            {viewer.role === "owner" && (
              <Dropdown
                label="Zuständig"
                value={assignee}
                options={assigneeOptions}
                onChange={setAssignee}
                align="end"
                className="sm:w-56"
                buttonClassName="h-10 rounded-full px-4"
              />
            )}
          </>
        }
      >
        <p>
          {viewer.role === "owner"
            ? "Alle Anfragen des Betriebs nach Stand. Ziehe eine Karte in eine andere Spalte, um den Stand zu ändern."
            : `Die Anfragen, die dir zugewiesen sind, ${viewer.firstName}. Ziehe eine Karte, um den Stand zu ändern.`}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
          <span>
            <span className="figures font-semibold text-fg">{filtered.length}</span> {filtered.length === 1 ? "Anfrage" : "Anfragen"}
            {filtering ? " in der Auswahl" : ""}
          </span>
          <span>
            <span className="figures font-semibold text-fg">{formatEuro(openCents)}</span> offen
          </span>
        </p>
      </PageHeader>

      {inquiries.length === 0 ? (
        <EmptyBoard owner={viewer.role === "owner"} />
      ) : filtered.length === 0 && filtering ? (
        <NoMatches search={search.trim()} onReset={resetFilters} />
      ) : (
        <>
          <nav aria-label="Spalten" className="mt-6 grid grid-cols-4 gap-1 rounded-full bg-track p-1 md:hidden">
            {columns.map(({ status, items }) => {
              const current = visibleColumn === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => showColumn(status)}
                  aria-current={current ? "true" : undefined}
                  className={cn("press relative flex h-9 items-center justify-center gap-1.5 rounded-full text-xs font-medium", current ? "text-fg" : "text-muted")}
                >
                  {current && <motion.span layoutId="board-column-pill" transition={SPRING} className="absolute inset-0 rounded-full bg-thumb shadow-card" aria-hidden />}
                  <span className="relative">{STATUS_LABELS[status]}</span>
                  <span className="figures relative text-muted">{items.length}</span>
                </button>
              );
            })}
          </nav>
          <div
            ref={scroller}
            onScroll={onSwipe}
            className="scroll-quiet -mx-4 mt-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:mt-7 md:grid md:snap-none md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-4"
          >
            {columns.map(({ status, items }) => (
              <section
                key={status}
                aria-label={STATUS_LABELS[status]}
                data-status={status}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dropTarget !== status) setDropTarget(status);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
                }}
                onDrop={(e) => onDrop(e, status)}
                className={cn(
                  "w-[84vw] shrink-0 snap-start rounded-2xl border p-2 transition-[background-color,border-color,box-shadow] duration-200 ease-[var(--ease-out)] sm:w-80 md:w-auto",
                  dropTarget === status ? "border-accent bg-accent-soft shadow-[0_0_0_4px_var(--color-accent-soft)]" : "border-transparent bg-track",
                )}
              >
                <header className="flex items-center gap-2 px-2.5 pt-2 pb-3">
                  <StatusDot status={status} className="size-2.5" />
                  <h2 className="heading text-sm">{STATUS_LABELS[status]}</h2>
                  <span className="figures inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface px-1.5 text-[11px] font-semibold text-muted shadow-card">
                    {items.length}
                  </span>
                  <span className="figures ml-auto text-xs text-muted">{formatEuro(items.reduce((sum, i) => sum + (i.budget_cents ?? 0), 0))}</span>
                </header>
                <ol className="flex min-h-24 flex-col gap-2">
                  {items.map((inquiry, index) => (
                    <CardSlot key={inquiry.id} id={inquiry.id} index={index} rise={!entered}>
                      <InquiryCard
                        inquiry={inquiry}
                        showAssignee={viewer.role === "owner"}
                        dragging={dragging === inquiry.id}
                        onDragState={(on) => setDragging(on ? inquiry.id : null)}
                      />
                    </CardSlot>
                  ))}
                  {items.length === 0 && (
                    <li className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3 py-8 text-center text-[13px] text-muted">
                      <Inbox className="size-4 text-faint" aria-hidden />
                      {filtering ? "Nichts in dieser Spalte" : "Hierher ziehen, um den Stand zu ändern"}
                    </li>
                  )}
                </ol>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function InquiryCard({
  inquiry,
  showAssignee,
  dragging,
  onDragState,
}: {
  inquiry: BoardInquiry;
  showAssignee: boolean;
  dragging: boolean;
  onDragState: (on: boolean) => void;
}) {
  const days = inquiry.event_date ? daysUntil(inquiry.event_date) : null;
  const closed = !isOpen(inquiry.status);
  const urgent = !closed && days !== null && days >= 0 && days <= 21;
  // Far-away dates need no countdown: the tile already shows month and year.
  const countdown = !closed && days !== null && days <= 60 ? countdownLabel(days) : null;
  const customer = inquiry.contact?.company ?? inquiry.contact?.full_name ?? "Kontakt unbekannt";

  return (
    <Link
      href={`/inquiries/${inquiry.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/inquiry-id", inquiry.id);
        e.dataTransfer.effectAllowed = "move";
        onDragState(true);
      }}
      onDragEnd={() => onDragState(false)}
      data-inquiry-id={inquiry.id}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-card",
        "transition-[border-color,box-shadow,transform,opacity] duration-200 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift active:scale-[0.985]",
        dragging && "scale-[0.97] opacity-45",
      )}
    >
      <div className="flex gap-3">
        <DateTile date={inquiry.event_date} muted={closed} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm leading-snug font-medium">{inquiry.title}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
            {inquiry.matched_existing_contact && (
              // Intake matched a known contact by e-mail only; the detail page shows what differs.
              <span title="Per E-Mail zugeordnet, nicht bestätigt" className="shrink-0 text-st-quoted">
                <ShieldQuestion className="size-3.5" aria-hidden />
                <span className="sr-only">Per E-Mail zugeordnet, nicht bestätigt: </span>
              </span>
            )}
            <span className="truncate" title={customer}>
              {customer}
            </span>
          </p>
        </div>
      </div>
      <div className="figures flex h-6 items-center gap-3 text-xs text-muted">
        {inquiry.guest_count !== null && (
          <span className="inline-flex items-center gap-1">
            <UsersRound className="size-3.5 text-faint" aria-hidden />
            {inquiry.guest_count}
            <span className="sr-only">Gäste</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Wallet className="size-3.5 text-faint" aria-hidden />
          {formatEuro(inquiry.budget_cents)}
          <span className="sr-only">Budget</span>
        </span>
        <span className="ml-auto flex items-center gap-2">
          {countdown && (
            <span
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full px-2 whitespace-nowrap",
                urgent ? "bg-accent-soft font-medium text-accent-fg" : "text-muted",
              )}
            >
              {urgent && <CalendarClock className="size-3.5" aria-hidden />}
              <span className="sr-only">Termin </span>
              {countdown}
            </span>
          )}
          {showAssignee &&
            (inquiry.assignee ? (
              <span title={inquiry.assignee.full_name}>
                <Avatar name={inquiry.assignee.full_name} size="sm" />
                <span className="sr-only">Zuständig: {inquiry.assignee.full_name}</span>
              </span>
            ) : (
              <EmptyAvatar size="sm" />
            ))}
        </span>
      </div>
    </Link>
  );
}

function NoMatches({ search, onReset }: { search: string; onReset: () => void }) {
  return (
    <div className="animate-rise-in mt-7 flex flex-col items-center rounded-2xl border border-line bg-surface px-6 py-20 text-center shadow-card">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent-fg">
        <SearchX className="size-5" aria-hidden />
      </span>
      <h2 className="heading mt-4 text-lg">{search ? `Keine Anfragen zu „${search}“` : "Keine Anfragen für diese Auswahl"}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted">
        {search ? "Gesucht wird in Titel, Kontakt und Firma. Strg und K durchsucht alles." : "Niemand im Team hat gerade eine passende Anfrage."}
      </p>
      <button type="button" onClick={onReset} className={buttonClasses("secondary", "md", "mt-6")}>
        {search ? "Suche zurücksetzen" : "Filter zurücksetzen"}
      </button>
    </div>
  );
}

function EmptyBoard({ owner }: { owner: boolean }) {
  return (
    <div className="animate-rise-in mt-7 flex flex-col items-center rounded-2xl border border-line bg-surface px-6 py-20 text-center shadow-card">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent-fg">
        <Inbox className="size-5" aria-hidden />
      </span>
      <h2 className="heading mt-4 text-lg">{owner ? "Noch keine Anfragen" : "Dir ist noch keine Anfrage zugewiesen"}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted">
        {owner
          ? "Neue Anfragen kommen über das Webformular oder die API. Den Schlüssel dafür legst du unter Team und API an."
          : "Sobald die Inhaberin oder der Inhaber dir eine Anfrage zuweist, erscheint sie hier."}
      </p>
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Anfragen werden geladen" className="loading-delayed">
      <div className="skeleton h-8 w-40" />
      <div className="skeleton mt-3 h-4 w-96 max-w-full" />
      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((col) => (
          <div key={col} className="flex flex-col gap-2 rounded-2xl bg-track p-2">
            <div className="skeleton mx-2 mt-2 mb-2 h-5 w-28" />
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-[7.25rem] rounded-xl bg-surface" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
