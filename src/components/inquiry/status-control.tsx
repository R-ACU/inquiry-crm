"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { moveInquiry } from "@/lib/actions/inquiries";
import { INQUIRY_STATUSES, STATUS_LABELS, type InquiryStatus } from "@/lib/domain/status";
import { StatusDot } from "@/components/status";
import { SPRING } from "@/components/ui/segmented";
import { useToast } from "@/components/shell/providers";
import { cn } from "@/lib/cn";

/** Pill control for the pipeline stage. The thumb glides; arrow keys move between stages. */
export function StatusControl({ inquiryId, status }: { inquiryId: string; status: InquiryStatus }) {
  const [optimistic, setOptimistic] = useOptimistic(status);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();

  function change(next: InquiryStatus) {
    if (next === optimistic) return;
    startTransition(async () => {
      setOptimistic(next);
      const result = await moveInquiry(inquiryId, next);
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      toast("success", `Stand auf ${STATUS_LABELS[next]} gesetzt.`);
      await queryClient.invalidateQueries({ queryKey: ["board"] });
      router.refresh();
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label="Stand der Anfrage"
      aria-busy={pending || undefined}
      className="grid w-full grid-cols-4 gap-1 rounded-full bg-track p-1 sm:inline-flex sm:w-auto"
      onKeyDown={(event) => {
        const index = INQUIRY_STATUSES.indexOf(optimistic);
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          change(INQUIRY_STATUSES[Math.min(INQUIRY_STATUSES.length - 1, index + 1)]);
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          change(INQUIRY_STATUSES[Math.max(0, index - 1)]);
        }
      }}
    >
      {INQUIRY_STATUSES.map((value) => {
        const checked = value === optimistic;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => change(value)}
            className={cn(
              "press relative flex h-9 items-center justify-center gap-2 rounded-full px-2 text-[13px] font-medium sm:px-4",
              checked ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {checked && (
              <motion.span layoutId={`stage-${inquiryId}`} transition={SPRING} className="absolute inset-0 rounded-full bg-thumb shadow-card" aria-hidden />
            )}
            <StatusDot status={value} className={cn("relative transition-opacity max-sm:hidden", !checked && "opacity-50")} />
            <span className="relative">{STATUS_LABELS[value]}</span>
          </button>
        );
      })}
    </div>
  );
}
