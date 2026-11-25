"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { DropdownMenu, Popover } from "radix-ui";
import {
  Bell,
  Inbox,
  Keyboard,
  LayoutDashboard,
  LogOut,
  Moon,
  Search,
  Settings2,
  SlidersHorizontal,
  Sun,
  UserRoundPlus,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { BOARD_KEY, fetchBoard } from "@/lib/client/views";
import { ROLE_LABELS } from "@/lib/domain/status";
import { formatRelativeDay } from "@/lib/domain/time";
import { MOTION_KEY } from "@/lib/theme/themes";
import { Brand } from "@/components/brand";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { SPRING } from "@/components/ui/segmented";
import { setMode, useCompany, useMode } from "@/components/theme/theme-client";
import { CommandPalette } from "./command-palette";
import type { ShellMember } from "./providers";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  key: string;
  ownerOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/", label: "Übersicht", icon: LayoutDashboard, key: "o" },
  { href: "/inquiries", label: "Anfragen", icon: Inbox, key: "a" },
  { href: "/contacts", label: "Kontakte", icon: UsersRound, key: "k" },
  { href: "/team", label: "Team", icon: Settings2, key: "t", ownerOnly: true },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

const SEEN_KEY = "crm-notifications-seen";

/** Icon buttons in the header: round, quiet, with a tooltip. */
const iconButton =
  "press relative inline-flex size-10 items-center justify-center rounded-full bg-surface text-muted shadow-card hover:text-fg hover:shadow-lift data-[state=open]:text-fg";

export const menuItem =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-muted outline-none transition-colors duration-150 data-[highlighted]:bg-hover data-[highlighted]:text-fg [&_svg]:size-4";

const panel = "animate-pop z-50 rounded-[22px] bg-surface p-2 shadow-pop";

export function AppHeader({ member }: { member: ShellMember }) {
  const pathname = usePathname();
  const router = useRouter();
  const owner = member.role === "owner";
  const items = NAV.filter((item) => !item.ownerOnly || owner);
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [settings, setSettings] = useState(false);
  const signOutForm = useRef<HTMLFormElement>(null);
  const pendingG = useRef<number | null>(null);
  const company = useCompany();

  const showShortcuts = useCallback(() => setShortcuts(true), []);
  const showSettings = useCallback(() => setSettings(true), []);
  const doSignOut = useCallback(() => signOutForm.current?.requestSubmit(), []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((open) => !open);
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"], [role="menu"]')) return;

      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const key = event.key.toLowerCase() === "ü" ? "o" : event.key.toLowerCase();
        const target = items.find((item) => item.key === key);
        if (target) {
          event.preventDefault();
          router.push(target.href);
        }
        return;
      }
      if (event.key === "g") {
        pendingG.current = window.setTimeout(() => (pendingG.current = null), 1200);
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setShortcuts(true);
        return;
      }
      if (event.key === "d") {
        event.preventDefault();
        setMode(document.documentElement.classList.contains("dark") ? "light" : "dark");
        return;
      }
      if (event.key === "/") {
        // Pages kept alive for a quick return stay in the document, hidden; take the visible field.
        const search = [...document.querySelectorAll<HTMLInputElement>("[data-page-search]")].find((field) => field.offsetParent !== null);
        event.preventDefault();
        if (search) search.focus();
        else setPalette(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [items, router]);

  return (
    <>
      <header className="sticky top-0 z-30 bg-canvas/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-[72px] max-w-[1680px] items-center gap-3 px-4 md:gap-5 md:px-8">
          <Link href="/" aria-label="Lindgrün, zur Übersicht" className="press shrink-0 rounded-xl">
            <Brand subtitle={false} />
          </Link>

          <nav aria-label="Hauptnavigation" className="hidden items-center gap-1 rounded-full bg-surface p-1 shadow-card md:flex">
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "press relative flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium",
                    active ? "text-surface" : "text-muted hover:bg-hover hover:text-fg",
                  )}
                >
                  {active && <motion.span layoutId="nav-pill" transition={SPRING} className="absolute inset-0 rounded-full bg-fg" aria-hidden />}
                  <item.icon className="relative size-4" aria-hidden />
                  <span className="relative">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {company && (
              <span className="mr-2 hidden items-center gap-2 text-xs text-faint xl:inline-flex">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                Demo für {company}
              </span>
            )}
            <button
              type="button"
              onClick={() => setPalette(true)}
              aria-label="Suchen (Strg und K)"
              className="press group flex h-10 items-center gap-2 rounded-full bg-surface px-3 text-sm text-muted shadow-card hover:text-fg hover:shadow-lift sm:w-64 sm:pr-2 sm:pl-4"
            >
              <Search className="size-4 shrink-0" aria-hidden />
              <span className="hidden flex-1 text-left sm:inline">Suchen</span>
              <kbd className="hidden h-6 items-center rounded-full bg-raised px-2 font-sans text-[11px] font-medium text-muted sm:inline-flex">
                Strg K
              </kbd>
            </button>
            <ModeToggle />
            <Notifications member={member} />
            <ProfileMenu member={member} owner={owner} onSettings={showSettings} onShortcuts={showShortcuts} onSignOut={doSignOut} />
          </div>
        </div>
        {/* A plain form post: the browser loads /login afresh, so no data of this session stays in the tab. */}
        <form ref={signOutForm} method="post" action="/api/auth/sign-out" hidden />
      </header>

      {/* Phone: the same areas as a tab bar at the bottom, in thumb reach. */}
      <nav
        aria-label="Bereiche"
        className="fixed inset-x-3 bottom-3 z-30 rounded-full bg-surface/90 pb-[env(safe-area-inset-bottom)] shadow-pop backdrop-blur-xl md:hidden"
      >
        <div className={cn("grid gap-1 p-1.5", owner ? "grid-cols-4" : "grid-cols-3")}>
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "press relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium",
                  active ? "text-surface" : "text-muted",
                )}
              >
                {active && <motion.span layoutId="tab-pill" transition={SPRING} className="absolute inset-0 rounded-full bg-fg" aria-hidden />}
                <item.icon className="relative size-[18px]" aria-hidden />
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        owner={owner}
        onShowShortcuts={showShortcuts}
        onShowSettings={showSettings}
        onSignOut={doSignOut}
      />
      <ShortcutsDialog open={shortcuts} onClose={() => setShortcuts(false)} owner={owner} />
      {settings && <SettingsDialog onClose={() => setSettings(false)} />}
    </>
  );
}

function ModeToggle() {
  const mode = useMode();
  const dark = mode === "dark";
  return (
    <Tooltip content={dark ? "Helles Design" : "Dunkles Design"} keys={["D"]}>
      <button
        type="button"
        onClick={() => setMode(dark ? "light" : "dark")}
        aria-label={dark ? "Zum hellen Design wechseln" : "Zum dunklen Design wechseln"}
        className={iconButton}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={mode}
            initial={{ opacity: 0, rotate: -60, scale: 0.7 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 60, scale: 0.7 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
            className="inline-flex"
          >
            {dark ? <Moon className="size-[18px]" aria-hidden /> : <Sun className="size-[18px]" aria-hidden />}
          </motion.span>
        </AnimatePresence>
      </button>
    </Tooltip>
  );
}

function ProfileMenu({
  member,
  owner,
  onSettings,
  onShortcuts,
  onSignOut,
}: {
  member: ShellMember;
  owner: boolean;
  onSettings: () => void;
  onShortcuts: () => void;
  onSignOut: () => void;
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label="Profilmenü"
        className="press flex items-center gap-2.5 rounded-full bg-surface p-1 shadow-card outline-offset-2 hover:shadow-lift xl:pr-4"
      >
        <Avatar name={member.fullName} />
        <span className="hidden text-left leading-tight xl:block">
          <span className="block text-[13px] font-medium text-fg">{member.fullName}</span>
          <span className="block text-xs text-muted">{ROLE_LABELS[member.role]}</span>
        </span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className={cn(panel, "flex w-72 flex-col gap-1")}>
          <div className="flex items-center gap-3 px-2.5 pt-2 pb-2.5">
            <Avatar name={member.fullName} size="lg" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium">{member.fullName}</p>
              <p className="mt-0.5 truncate text-xs text-muted">{member.email}</p>
            </div>
          </div>
          <DropdownMenu.Separator className="mx-1 h-px bg-line" />
          {owner && (
            <DropdownMenu.Item asChild className={menuItem}>
              <Link href="/team">
                <Settings2 aria-hidden />
                Team und API
              </Link>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item className={menuItem} onSelect={onSettings}>
            <SlidersHorizontal aria-hidden />
            Einstellungen
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menuItem} onSelect={onShortcuts}>
            <Keyboard aria-hidden />
            Tastenkürzel
            <kbd className="ml-auto rounded-md border border-line px-1.5 font-sans text-[11px] text-muted">?</kbd>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="mx-1 h-px bg-line" />
          <DropdownMenu.Item className={menuItem} onSelect={onSignOut}>
            <LogOut aria-hidden />
            Abmelden
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** New arrivals and unassigned inquiries from the last 14 days, newest first. */
function Notifications({ member }: { member: ShellMember }) {
  const { data: inquiries = [] } = useQuery({ queryKey: BOARD_KEY, queryFn: fetchBoard });
  const [seen, setSeen] = useState<number | null>(() => (typeof window === "undefined" ? null : Number(localStorage.getItem(SEEN_KEY) ?? 0)));
  const [since] = useState(() => Date.now() - 14 * 86_400_000);

  const items = useMemo(() => {
    return inquiries
      .filter((i) => Date.parse(i.created_at) > since)
      .filter((i) => member.role === "owner" || i.assignee?.id === member.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 6);
  }, [inquiries, member, since]);

  const unread = seen === null ? 0 : items.filter((i) => Date.parse(i.created_at) > seen).length;
  const label = unread > 0 ? `Benachrichtigungen, ${unread} neu` : "Benachrichtigungen";

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (open) {
          const now = Date.now();
          localStorage.setItem(SEEN_KEY, String(now));
          window.setTimeout(() => setSeen(now), 1200);
        }
      }}
    >
      <Popover.Trigger aria-label={label} className={iconButton}>
        <Bell className="size-[18px]" aria-hidden />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={SPRING}
              className="absolute top-1 right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-on-primary ring-2 ring-surface"
            >
              {unread}
            </motion.span>
          )}
        </AnimatePresence>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} aria-label={label} className={cn(panel, "w-[min(23rem,calc(100vw-2rem))]")}>
          <p className="px-2.5 pt-2 pb-2 text-sm font-medium">Neu in den letzten 14 Tagen</p>
          {items.length === 0 ? (
            <p className="px-2.5 pb-3 text-[13px] text-muted">Keine neuen Anfragen. Neue Eingänge über das Webformular oder die API erscheinen hier.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((inquiry) => (
                <li key={inquiry.id}>
                  <Popover.Close asChild>
                    <Link
                      href={`/inquiries/${inquiry.id}`}
                      className="flex items-start gap-3 rounded-xl px-2.5 py-2 transition-colors duration-150 hover:bg-hover"
                    >
                      <span
                        className={cn(
                          "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full",
                          inquiry.assignee ? "bg-accent-soft text-accent-fg" : "bg-hover text-muted",
                        )}
                      >
                        {inquiry.assignee ? <Inbox className="size-3.5" aria-hidden /> : <UserRoundPlus className="size-3.5" aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-fg">{inquiry.title}</span>
                        <span className="block text-xs text-muted">
                          {inquiry.assignee ? `Neue Anfrage, ${inquiry.assignee.full_name}` : "Neue Anfrage, noch niemand zuständig"}
                        </span>
                      </span>
                      {seen !== null && Date.parse(inquiry.created_at) > seen && (
                        <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-label="ungelesen" />
                      )}
                      <span className="shrink-0 pt-0.5 text-xs text-muted">{formatRelativeDay(inquiry.created_at)}</span>
                    </Link>
                  </Popover.Close>
                </li>
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const Key = ({ children }: { children: string }) => (
  <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line-strong bg-canvas px-1.5 font-sans text-xs font-medium text-fg">
    {children}
  </kbd>
);

function ShortcutsDialog({ open, onClose, owner }: { open: boolean; onClose: () => void; owner: boolean }) {
  const rows: { keys: string[]; label: string }[] = [
    { keys: ["Strg", "K"], label: "Suchen und Befehle" },
    { keys: ["/"], label: "Suche auf der Seite" },
    { keys: ["G", "Ü"], label: "Zur Übersicht (auch G, O)" },
    { keys: ["G", "A"], label: "Zu den Anfragen" },
    { keys: ["G", "K"], label: "Zu den Kontakten" },
    ...(owner ? [{ keys: ["G", "T"], label: "Zu Team und API" }] : []),
    { keys: ["D"], label: "Hell oder dunkel" },
    { keys: ["Strg", "Enter"], label: "Notiz speichern" },
    { keys: ["?"], label: "Diese Hilfe" },
    { keys: ["Esc"], label: "Fenster schließen" },
  ];
  return (
    <Dialog open={open} onClose={onClose} label="Tastenkürzel" className="max-w-md">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="heading text-base">Tastenkürzel</h2>
        <button type="button" onClick={onClose} className="press rounded-full px-3 py-1 text-sm text-muted hover:bg-hover hover:text-fg">
          Schließen
        </button>
      </div>
      <ul className="flex flex-col gap-1 p-3">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-4 rounded-lg px-2 py-1.5 text-sm">
            <span className="text-muted">{row.label}</span>
            <span className="flex items-center gap-1">
              {row.keys.map((k, i) => (
                <span key={k} className="flex items-center gap-1">
                  {i > 0 && <span className="text-xs text-muted">{row.keys[0] === "G" ? "dann" : "+"}</span>}
                  <Key>{k}</Key>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Mounted only while open, so it reads the stored setting fresh each time. */
function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [reduced, setReduced] = useState(() => localStorage.getItem(MOTION_KEY) === "reduce");

  function toggle() {
    const next = !reduced;
    setReduced(next);
    localStorage.setItem(MOTION_KEY, next ? "reduce" : "full");
    if (next) document.documentElement.setAttribute("data-motion", "reduce");
    else document.documentElement.removeAttribute("data-motion");
  }

  return (
    <Dialog open onClose={onClose} label="Einstellungen" className="max-w-md">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="heading text-base">Einstellungen</h2>
        <button type="button" onClick={onClose} className="press rounded-full px-3 py-1 text-sm text-muted hover:bg-hover hover:text-fg">
          Fertig
        </button>
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p id="motion-label" className="text-sm font-medium">
              Animationen reduzieren
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Zahlen und Diagramme erscheinen sofort, ohne Bewegung. Gilt nur in diesem Browser. Ist Bewegung im System reduziert, gilt das ohnehin.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={reduced}
            aria-labelledby="motion-label"
            onClick={toggle}
            className={cn(
              "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200",
              reduced ? "bg-primary" : "bg-line-strong",
            )}
          >
            <span
              className={cn(
                "inline-block size-5 rounded-full bg-white shadow-card transition-transform duration-200 ease-[var(--ease-out)]",
                reduced ? "translate-x-[22px]" : "translate-x-0.5",
              )}
            />
          </button>
        </div>
      </div>
    </Dialog>
  );
}
