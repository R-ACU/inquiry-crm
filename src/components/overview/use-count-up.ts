"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motionReduced } from "@/components/theme/theme-client";
import { useEntrance } from "@/components/ui/entrance";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Counts up to a value: from zero when the figure first appears, from the
 * previous value when it changes (for example after switching the period).
 * The server render holds the final value; with reduced motion it stays there,
 * and so it does when the view is rebuilt from the cache (see ui/entrance.ts).
 */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(target);
  // What the reader currently sees; null before the first effect.
  const shown = useRef<number | null>(null);
  const entrance = useEntrance();

  useIsoLayoutEffect(() => {
    // The entrance only decides the first run; later runs start from what is shown.
    const start = shown.current ?? (entrance ? 0 : target);
    if (start === target || motionReduced()) {
      shown.current = target;
      setValue(target);
      return;
    }
    let frame = 0;
    const began = performance.now();
    shown.current = start;
    setValue(start);
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      const next = t < 1 ? start + (target - start) * eased : target;
      shown.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, entrance]);

  return value;
}
