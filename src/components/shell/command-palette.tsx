"use client";

import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { CornerDownLeft, FileText, Keyboard, LayoutDashboard, LogOut, Search, Settings2, SlidersHorizontal, UsersRound, Inbox } from "lucide-react";
import { BOARD_KEY, fetchBoard } from "@/lib/client/views";
import { Dialog } from "@/components/ui/dialog";
import { StatusDot } from "@/components/status";
import { cn } from "@/lib/cn";
import { LOCALE, pick } from "@/lib/i18n";

const T = pick({
  de: {
    pages: "Seiten",
    inquiries: "Anfragen",
    actions: "Aktionen",
    overview: "Übersicht",
    contacts: "Kontakte",
    teamAndApi: "Team und API",
    showShortcuts: "Tastenkürzel anzeigen",
    settings: "Einstellungen",
    signOut: "Abmelden",
    keywordsOverview: "dashboard start",
    keywordsInquiries: "board pipeline",
    keywordsContacts: "kunden",
    keywordsTeam: "rollen schlüssel api",
    keywordsShortcuts: "hilfe shortcuts",
    keywordsSettings: "animation bewegung",
    keywordsSignOut: "logout",
    label: "Befehlspalette",
    inputLabel: "Suchen oder Befehl eingeben",
    placeholder: "Anfrage, Kontakt oder Seite suchen",
    results: "Ergebnisse",
    nothingFound: (query: string) => `Nichts gefunden zu „${query}“. Gesucht wird in Seiten, Anfragen, Kontakten und Firmen.`,
    select: "auswählen",
    open: "öffnen",
    onlyVisible: "Nur Anfragen, die du sehen darfst",
  },
  en: {
    pages: "Pages",
    inquiries: "Inquiries",
    actions: "Actions",
    overview: "Overview",
    contacts: "Contacts",
    teamAndApi: "Team & API",
    showShortcuts: "Show keyboard shortcuts",
    settings: "Settings",
    signOut: "Sign out",
    keywordsOverview: "dashboard home start",
    keywordsInquiries: "board pipeline",
    keywordsContacts: "customers clients",
    keywordsTeam: "roles key api",
    keywordsShortcuts: "help shortcuts",
    keywordsSettings: "animation motion",
    keywordsSignOut: "logout sign out",
    label: "Command palette",
    inputLabel: "Search or enter a command",
    placeholder: "Search inquiry, contact or page",
    results: "Results",
    nothingFound: (query: string) => `No matches for “${query}”. Searches pages, inquiries, contacts and companies.`,
    select: "select",
    open: "open",
    onlyVisible: "Only inquiries you may see",
  },
});

const GROUP_LABELS = { pages: T.pages, inquiries: T.inquiries, actions: T.actions };

interface Command {
  id: string;
  group: "pages" | "inquiries" | "actions";
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void;
}

const normalise = (text: string) => text.toLocaleLowerCase(LOCALE).normalize("NFD").replace(/\p{Diacritic}/gu, "");

/**
 * Ctrl+K / Cmd+K: jump to a page, open an inquiry by title, contact or
 * company, or run an action. Results come from the same RLS-scoped data as
 * the board, so it finds only what this user may open.
 */
export function CommandPalette({
  open,
  onClose,
  owner,
  onShowShortcuts,
  onShowSettings,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  owner: boolean;
  onShowShortcuts: () => void;
  onShowSettings: () => void;
  onSignOut: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const { data: inquiries = [] } = useQuery({ queryKey: BOARD_KEY, queryFn: fetchBoard, enabled: open });

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    const pages: Command[] = [
      { id: "p-overview", group: "pages", label: T.overview, icon: <LayoutDashboard className="size-4" />, keywords: T.keywordsOverview, run: go("/") },
      { id: "p-inquiries", group: "pages", label: T.inquiries, icon: <Inbox className="size-4" />, keywords: T.keywordsInquiries, run: go("/inquiries") },
      { id: "p-contacts", group: "pages", label: T.contacts, icon: <UsersRound className="size-4" />, keywords: T.keywordsContacts, run: go("/contacts") },
      ...(owner
        ? [{ id: "p-team", group: "pages" as const, label: T.teamAndApi, icon: <Settings2 className="size-4" />, keywords: T.keywordsTeam, run: go("/team") }]
        : []),
    ];
    const actions: Command[] = [
      { id: "a-keys", group: "actions", label: T.showShortcuts, icon: <Keyboard className="size-4" />, keywords: T.keywordsShortcuts, run: onShowShortcuts },
      { id: "a-settings", group: "actions", label: T.settings, icon: <SlidersHorizontal className="size-4" />, keywords: T.keywordsSettings, run: onShowSettings },
      { id: "a-signout", group: "actions", label: T.signOut, icon: <LogOut className="size-4" />, keywords: T.keywordsSignOut, run: onSignOut },
    ];
    const found: Command[] = inquiries.map((inquiry) => ({
      id: `i-${inquiry.id}`,
      group: "inquiries",
      label: inquiry.title,
      hint: inquiry.contact?.company ?? inquiry.contact?.full_name ?? undefined,
      icon: <StatusDot status={inquiry.status} />,
      keywords: `${inquiry.contact?.full_name ?? ""} ${inquiry.contact?.company ?? ""}`,
      run: go(`/inquiries/${inquiry.id}`),
    }));
    return [...pages, ...found, ...actions];
  }, [inquiries, owner, router, onShowShortcuts, onShowSettings, onSignOut]);

  const results = useMemo(() => {
    const needle = normalise(query.trim());
    const match = (c: Command) => !needle || normalise(`${c.label} ${c.hint ?? ""} ${c.keywords ?? ""}`).includes(needle);
    const list = commands.filter(match);
    // Without a query, show a short list of inquiries instead of all of them.
    const limited = needle ? list.filter((c) => c.group !== "inquiries").concat(list.filter((c) => c.group === "inquiries").slice(0, 8)) : list.filter((c) => c.group !== "inquiries").concat(list.filter((c) => c.group === "inquiries").slice(0, 4));
    const order = { pages: 0, inquiries: 1, actions: 2 };
    return limited.sort((a, b) => order[a.group] - order[b.group]);
  }, [commands, query]);

  function close() {
    setQuery("");
    setActive(0);
    onClose();
  }

  function run(command: Command | undefined) {
    if (!command) return;
    close();
    command.run();
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(results[active]);
    }
  }

  const rows = results.map((command, index) => ({
    command,
    index,
    header: index === 0 || results[index - 1].group !== command.group ? command.group : null,
  }));
  return (
    <Dialog open={open} onClose={close} label={T.label}>
      <div className="flex items-center gap-3 px-5">
        <Search className="size-4 shrink-0 text-faint" aria-hidden />
        <input
          data-autofocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
          aria-label={T.inputLabel}
          placeholder={T.placeholder}
          className="h-16 flex-1 bg-transparent text-base placeholder:text-faint focus:outline-none focus-visible:outline-none"
        />
        <kbd className="rounded-full bg-raised px-2.5 py-1 font-sans text-[11px] text-muted">Esc</kbd>
      </div>
      <ul id="palette-list" role="listbox" aria-label={T.results} className="flex max-h-[min(60vh,26rem)] flex-col gap-1 overflow-y-auto px-2.5 pb-2.5">
        {results.length === 0 && (
          <li className="px-3 py-8 text-center text-sm text-muted">
            {T.nothingFound(query.trim())}
          </li>
        )}
        {rows.map(({ command, index, header }) => {
          return (
            <li key={command.id} role="presentation">
              {header && <p className="px-3 pt-3 pb-1.5 text-xs font-medium text-muted">{GROUP_LABELS[header]}</p>}
              <div
                id={`palette-${command.id}`}
                role="option"
                aria-selected={index === active}
                onPointerMove={() => setActive(index)}
                onClick={() => run(command)}
                className="relative flex cursor-pointer items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm text-fg"
              >
                {index === active && (
                  <motion.span layoutId="palette-active" transition={{ type: "spring", duration: 0.22, bounce: 0.1 }} className="absolute inset-0 rounded-2xl bg-hover" aria-hidden />
                )}
                <span className={cn("relative inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors", index === active ? "bg-fg text-surface" : "bg-raised text-muted")} aria-hidden>
                  {command.icon}
                </span>
                <span className="relative min-w-0 flex-1 truncate">
                  {command.label}
                  {command.hint && <span className="ml-2 text-xs text-muted">{command.hint}</span>}
                </span>
                {index === active && <CornerDownLeft className="relative size-3.5 shrink-0 text-muted" aria-hidden />}
                {command.group === "inquiries" && index !== active && <FileText className="relative size-3.5 shrink-0 text-faint" aria-hidden />}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-4 bg-raised px-5 py-3 text-xs text-muted">
        <span><kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> {T.select}</span>
        <span><kbd className="font-sans">Enter</kbd> {T.open}</span>
        <span className="ml-auto">{T.onlyVisible}</span>
      </div>
    </Dialog>
  );
}
