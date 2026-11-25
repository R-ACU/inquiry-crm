import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Search, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/*
 * The building blocks of every page: a title row, outer cards (28 px), inner
 * cards (22 px), round icon circles beside titles and round arrow buttons.
 * Cards separate by soft surfaces, not by lines.
 */

/** Title row of every page: the title, one sentence below it, actions on the right. */
export function PageHeader({ title, children, actions, className }: { title: string; children?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="display-title text-[30px] leading-tight md:text-[34px]">{title}</h1>
        {children && <div className="mt-1 max-w-2xl text-[15px] text-muted">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">{actions}</div>}
    </header>
  );
}

/** Round icon beside a card title: soft in the accent, or solid in the text colour. */
export function IconCircle({ icon: Icon, tone = "soft", className }: { icon: LucideIcon; tone?: "soft" | "solid" | "plain"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full",
        tone === "soft" && "bg-accent-soft text-accent-fg",
        tone === "solid" && "bg-fg text-surface",
        tone === "plain" && "bg-raised text-fg",
        className,
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
    </span>
  );
}

/** Round arrow button that leads somewhere, with a short label for screen readers. */
export function ArrowLink({ href, label, className }: { href: string; label: string; className?: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        "press group/arrow inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line-strong text-fg hover:border-fg hover:bg-fg hover:text-surface",
        className,
      )}
    >
      <ArrowUpRight className="size-4 transition-transform duration-200 ease-[var(--ease-out)] group-hover/arrow:translate-x-px group-hover/arrow:-translate-y-px" aria-hidden />
    </Link>
  );
}

/** An outer card with an optional title row. */
export function Panel({
  title,
  description,
  icon,
  iconTone,
  aside,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: string;
  description?: ReactNode;
  icon?: LucideIcon;
  iconTone?: "soft" | "solid" | "plain";
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section
      aria-labelledby={title && id ? id : undefined}
      aria-label={title && !id ? title : undefined}
      className={cn("flex flex-col rounded-card bg-surface p-6 shadow-card md:p-7", className)}
    >
      {title && (
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            {icon && <IconCircle icon={icon} tone={iconTone} />}
            <div className="min-w-0">
              <h2 id={id} className="heading text-[17px] leading-snug">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p>}
            </div>
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </header>
      )}
      <div className={cn(title && "mt-6", "flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Search field for a page: a pill with an icon and the "/" hint. */
export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  className?: string;
}) {
  return (
    <label className={cn("group relative block", className)}>
      <span className="sr-only">{label}</span>
      <input
        type="search"
        data-page-search
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-full bg-surface pr-11 pl-11 text-sm shadow-card transition-[box-shadow] duration-150 placeholder:text-faint focus:shadow-[0_0_0_2px_var(--color-accent),0_0_0_6px_var(--color-accent-soft)] focus-visible:outline-none"
      />
      <Search
        className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-faint transition-colors group-focus-within:text-accent"
        aria-hidden
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3 hidden h-6 -translate-y-1/2 items-center rounded-full bg-raised px-2 font-sans text-[11px] text-muted transition-opacity group-focus-within:opacity-0 sm:inline-flex">
        /
      </kbd>
    </label>
  );
}
