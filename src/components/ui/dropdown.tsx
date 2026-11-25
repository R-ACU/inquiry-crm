"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface DropdownOption<V extends string> {
  value: V;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

interface DropdownProps<V extends string> {
  value: V;
  options: readonly DropdownOption<V>[];
  onChange: (value: V) => void;
  label: string;
  disabled?: boolean;
  align?: "start" | "end";
  className?: string;
  buttonClassName?: string;
}

/**
 * Accessible single-select built from a button and a listbox, because a
 * native <select> opens an unstyled OS list on Windows. Keyboard: Enter,
 * Space or arrow keys open; arrows, Home and End move; Enter selects;
 * Escape, Tab and a click outside close.
 */
export function Dropdown<V extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
  align = "start",
  className,
  buttonClassName,
}: DropdownProps<V>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  function openList() {
    setActive(selectedIndex);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    setOpen(false);
    buttonRef.current?.focus();
    if (option && option.value !== value) onChange(option.value);
  }

  function onButtonKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      openList();
    }
  }

  function onListKey(event: KeyboardEvent<HTMLUListElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((i) => Math.min(options.length - 1, i + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`${label}: ${selected?.label ?? ""}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onButtonKey}
        className={cn(
          "press flex h-9 w-full items-center gap-2 rounded-field border border-line bg-surface px-3 text-left text-sm shadow-card",
          "hover:border-line-strong hover:bg-hover disabled:cursor-not-allowed disabled:text-faint aria-expanded:border-line-strong",
          buttonClassName,
        )}
      >
        {selected?.icon}
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-faint transition-transform duration-200 ease-[var(--ease-out)]", open && "rotate-180")}
          aria-hidden
        />
      </button>

      <AnimatePresence>
      {open && (
        <motion.ul
          ref={listRef}
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
          transition={{ type: "spring", duration: 0.24, bounce: 0.1 }}
          style={{ transformOrigin: align === "end" ? "top right" : "top left" }}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-opt-${active}`}
          onKeyDown={onListKey}
          className={cn(
            "absolute z-30 mt-2 flex max-h-72 min-w-full flex-col gap-1 overflow-auto rounded-2xl border border-line bg-surface p-1.5 shadow-pop outline-none",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={isSelected}
                data-value={option.value}
                onPointerEnter={() => setActive(index)}
                onClick={() => choose(index)}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm whitespace-nowrap transition-colors duration-100",
                  index === active ? "bg-hover text-fg" : "text-muted",
                )}
              >
                {option.icon}
                <span className="flex-1">
                  <span className="block">{option.label}</span>
                  {option.hint && <span className="block text-xs text-faint">{option.hint}</span>}
                </span>
                <Check className={cn("size-4 text-accent", !isSelected && "invisible")} aria-hidden />
              </li>
            );
          })}
        </motion.ul>
      )}
      </AnimatePresence>
    </div>
  );
}
