import { STATUS_LABELS, type InquiryStatus } from "@/lib/domain/status";
import { cn } from "@/lib/cn";

export const STATUS_DOT: Record<InquiryStatus, string> = {
  new: "bg-st-new",
  quoted: "bg-st-quoted",
  won: "bg-st-won",
  lost: "bg-st-lost",
};

const STATUS_COLOR: Record<InquiryStatus, string> = {
  new: "var(--st-new)",
  quoted: "var(--st-quoted)",
  won: "var(--st-won)",
  lost: "var(--st-lost)",
};

export function StatusDot({ status, className }: { status: InquiryStatus; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", STATUS_DOT[status], className)} aria-hidden />;
}

export function StatusLabel({ status }: { status: InquiryStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
      <StatusDot status={status} />
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Stage as a pill: a light wash of the stage colour, the text stays in the text colour. */
export function StatusChip({ status, className }: { status: InquiryStatus; className?: string }) {
  return (
    <span
      style={{ backgroundColor: `color-mix(in srgb, ${STATUS_COLOR[status]} 14%, var(--surface))` }}
      className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap text-fg", className)}
    >
      <StatusDot status={status} className="size-1.5" />
      {STATUS_LABELS[status]}
    </span>
  );
}
