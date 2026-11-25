"use client";

import type { ReactNode } from "react";
import { Tooltip as RadixTooltip } from "radix-ui";
import { cn } from "@/lib/cn";

/** One provider for the app: the first tooltip waits a moment, the next ones open at once. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={350} skipDelayDuration={400}>
      {children}
    </RadixTooltip.Provider>
  );
}

/** A short label for an icon button, with an optional key hint. */
export function Tooltip({
  content,
  keys,
  side = "bottom",
  children,
}: {
  content: ReactNode;
  keys?: string[];
  side?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
}) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={8}
          className={cn(
            "animate-pop z-50 flex items-center gap-2 rounded-lg bg-fg px-2.5 py-1.5 text-xs font-medium text-canvas shadow-pop select-none",
          )}
        >
          {content}
          {keys && (
            <span className="flex gap-1">
              {keys.map((k) => (
                <kbd key={k} className="rounded-[5px] bg-canvas/15 px-1.5 text-[11px] leading-[18px] font-medium">
                  {k}
                </kbd>
              ))}
            </span>
          )}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
