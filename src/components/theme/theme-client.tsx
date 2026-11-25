"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import {
  MODE_KEY,
  MOTION_KEY,
  THEME_COMPANY,
  THEME_COOKIE,
  THEME_PARAM,
  themeFromRequest,
  type Mode,
  type ThemeSlug,
} from "@/lib/theme/themes";
import { cn } from "@/lib/cn";

function readCookie(name: string): string | null {
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(name.length + 1));
  } catch {
    return null;
  }
}

function currentTheme(): ThemeSlug {
  return themeFromRequest(new URLSearchParams(window.location.search).get(THEME_PARAM), readCookie(THEME_COOKIE));
}

function storedMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/**
 * The head script sets data-theme, the dark class and the motion setting
 * before the first paint. In development, React's Strict Mode remount resets
 * the attributes of <html>; this puts them back before paint.
 */
export function ThemeSync() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", currentTheme());
    root.classList.toggle("dark", storedMode() === "dark");
    if (localStorage.getItem(MOTION_KEY) === "reduce") root.setAttribute("data-motion", "reduce");
  }, []);
  return null;
}

const noop = () => () => {};

/** The mode as the page shows it. Server render and hydration assume light. */
function subscribeMode(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

export function useMode(): Mode {
  return useSyncExternalStore(
    subscribeMode,
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => "light",
  );
}

export function motionReduced(): boolean {
  if (typeof window === "undefined") return false;
  return (
    document.documentElement.getAttribute("data-motion") === "reduce" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Switches light and dark, stores the choice and cross-fades the page where the browser can. */
export function setMode(mode: Mode) {
  const apply = () => {
    document.documentElement.classList.toggle("dark", mode === "dark");
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // Private mode without storage: the switch still works for this page.
    }
  };
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition && !motionReduced()) doc.startViewTransition(() => flushSync(apply));
  else apply();
}

/** "Demo für <Firma>": a quiet line, only in a company theme. */
export function ThemeNote({ className }: { className?: string }) {
  const company = useSyncExternalStore(
    noop,
    () => THEME_COMPANY[currentTheme()],
    () => null,
  );
  if (!company) return null;
  return <p className={cn("text-xs text-faint", className)}>Demo für {company}</p>;
}

export function useCompany(): string | null {
  return useSyncExternalStore(
    noop,
    () => THEME_COMPANY[currentTheme()],
    () => null,
  );
}
