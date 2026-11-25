"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A button that opens a panel below it. Escape and a click outside close
 * it and return focus to the button. With `menu`, the panel is a menu:
 * arrow keys move between its items, Home and End jump.
 */
export function Popover({
  trigger,
  label,
  children,
  menu = false,
  align = "end",
  className,
  buttonClassName,
  onOpenChange,
}: {
  trigger: ReactNode;
  label: string;
  children: (close: () => void) => ReactNode;
  menu?: boolean;
  align?: "start" | "end";
  className?: string;
  buttonClassName?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const [refocus, setRefocus] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  function setOpen(next: boolean) {
    setOpenState(next);
    onOpenChange?.(next);
  }

  function close() {
    setOpen(false);
    setRefocus((n) => n + 1);
  }

  // After closing from inside the panel, focus goes back to the button.
  useEffect(() => {
    if (refocus > 0) button.current?.focus();
  }, [refocus]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    const first = panel.current?.querySelector<HTMLElement>(menu ? '[role="menuitem"]' : "a, button");
    first?.focus();
    return () => document.removeEventListener("pointerdown", onPointer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onPanelKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (!menu) return;
    const items = [...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const targets: Record<string, number> = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 };
    if (event.key in targets) {
      event.preventDefault();
      items[(targets[event.key] + items.length) % items.length]?.focus();
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup={menu ? "menu" : "dialog"}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (menu && event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={buttonClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          role={menu ? "menu" : "dialog"}
          aria-label={label}
          onKeyDown={onPanelKey}
          className={cn(
            "animate-pop-in absolute top-full z-40 mt-2 rounded-xl border border-line bg-surface p-1.5 shadow-pop",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

/** One row in a menu. Rows keep a 4px gap, so hover and focus surfaces never touch. */
export const menuItemClass =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-muted outline-none hover:bg-hover hover:text-fg focus-visible:bg-hover focus-visible:text-fg focus-visible:outline-none";
