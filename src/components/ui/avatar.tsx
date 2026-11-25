import { UserRound } from "lucide-react";
import { cn } from "@/lib/cn";
import { pick } from "@/lib/i18n";

const T = pick({
  de: { unassigned: "Nicht zugewiesen" },
  en: { unassigned: "Unassigned" },
});

const TONES = 5;

/** Same person, same tone, everywhere: a small stable hash of the name. */
export function avatarTone(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return (hash % TONES) + 1;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const SIZES = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
} as const;

export function Avatar({ name, size = "md", className }: { name: string; size?: keyof typeof SIZES; className?: string }) {
  const tone = avatarTone(name);
  return (
    <span
      aria-hidden
      style={{ backgroundColor: `var(--avatar-${tone}-bg)`, color: `var(--avatar-${tone}-fg)` }}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide", SIZES[size], className)}
    >
      {initials(name)}
    </span>
  );
}

const ICON_SIZES = { xs: "size-2.5", sm: "size-3", md: "size-3.5", lg: "size-4" } as const;

/** Stand-in where nobody is assigned: a quiet dashed circle in the same size as an avatar. */
export function EmptyAvatar({ size = "md", className, label = T.unassigned }: { size?: keyof typeof SIZES; className?: string; label?: string }) {
  return (
    <span
      title={label || undefined}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-faint", SIZES[size], className)}
    >
      <UserRound className={ICON_SIZES[size]} aria-hidden />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
