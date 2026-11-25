import { ChefHat } from "lucide-react";
import { cn } from "@/lib/cn";
import { pick } from "@/lib/i18n";

/** The demo's business name and what it does, in the language of this build. */
export const BRAND = pick({
  de: { name: "Lindgrün", tagline: "Catering und Events" },
  en: { name: "Larkspur", tagline: "Catering & Events" },
});

/** The demo's own invented business. Company themes change its accent, never its name or mark. */
export function BrandMark({ onGlass = false, className }: { onGlass?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-[10px]",
        onGlass ? "bg-primary text-on-primary" : "bg-primary text-on-primary shadow-[0_1px_2px_0_rgb(16_24_40/0.16)]",
        className,
      )}
    >
      <ChefHat className="size-[18px]" strokeWidth={2} aria-hidden />
    </span>
  );
}

export function Brand({ onGlass = false, subtitle = true }: { onGlass?: boolean; subtitle?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark onGlass={onGlass} />
      <span className="leading-tight">
        <span className={cn("heading block text-[15px]", onGlass && "text-glass-fg")}>{BRAND.name}</span>
        {subtitle && <span className={cn("block text-xs", onGlass ? "text-glass-muted" : "text-faint")}>{BRAND.tagline}</span>}
      </span>
    </div>
  );
}
