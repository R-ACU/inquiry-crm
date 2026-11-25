"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { MotionConfig } from "motion/react";

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  return () => observer.disconnect();
}

/**
 * Motion follows the system setting ("user") and the app's own switch,
 * which sets data-motion="reduce" on <html>. Reduced means: no movement,
 * opacity changes only.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const reduce = useSyncExternalStore(
    subscribe,
    () => document.documentElement.getAttribute("data-motion") === "reduce",
    () => false,
  );
  return <MotionConfig reducedMotion={reduce ? "always" : "user"}>{children}</MotionConfig>;
}
