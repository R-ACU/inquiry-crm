"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";

interface SegmentedProps<V extends string | number> {
  label: string;
  value: V;
  options: readonly { value: V; label: string }[];
  onChange: (value: V) => void;
  className?: string;
  size?: "sm" | "md";
}

export const SPRING = { type: "spring", duration: 0.32, bounce: 0.16 } as const;

/**
 * Radio group styled as one pill. The selection is a thumb that glides to
 * the chosen option; arrow keys move the selection.
 */
export function Segmented<V extends string | number>({ label, value, options, onChange, className, size = "md" }: SegmentedProps<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKey}
      className={cn("inline-flex gap-1 rounded-full bg-track p-1", className)}
    >
      {options.map((option, i) => {
        const checked = option.value === value;
        return (
          <button
            key={String(option.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "press relative rounded-full font-medium whitespace-nowrap",
              size === "sm" ? "h-7 px-3 text-xs" : "h-8 px-3.5 text-[13px]",
              checked ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {checked && (
              <motion.span
                layoutId={`segment-${id}`}
                transition={SPRING}
                className="absolute inset-0 rounded-full bg-thumb shadow-[0_1px_2px_0_rgb(16_24_40/0.08),0_1px_3px_0_rgb(16_24_40/0.06)]"
                aria-hidden
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
