"use client";

import { useLayoutEffect, useRef } from "react";
import { motionReduced } from "@/components/theme/theme-client";

/**
 * Lets an element rise in once, when it mounts with `rise` set. It uses the
 * Web Animations API on purpose: React keeps pages alive (hidden) for a quick
 * return, and when such a page reappears, CSS animations start over and
 * motion replays its entrances. That would look like loading. An animation
 * started here runs once and is never repeated for the same element.
 */
export function useRiseIn<T extends HTMLElement>(rise: boolean, delayMs = 0) {
  const ref = useRef<T>(null);
  const started = useRef(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (started.current || !element) return;
    started.current = true;
    if (!rise || motionReduced()) return;
    element.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], {
      duration: 260,
      delay: delayMs,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      fill: "backwards",
    });
  }, [rise, delayMs]);
  return ref;
}
