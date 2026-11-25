"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { refreshViews } from "@/lib/client/views";
import { assignInquiry } from "@/lib/actions/inquiries";
import { Dropdown } from "@/components/ui/dropdown";
import { Avatar, EmptyAvatar } from "@/components/ui/avatar";
import { useToast } from "@/components/shell/providers";
import { pick } from "@/lib/i18n";

const T = pick({
  de: {
    unassigned: "Nicht zugewiesen",
    label: "Zuständig",
    nowResponsible: (name: string) => `${name} ist jetzt zuständig.`,
    removed: "Zuweisung entfernt.",
  },
  en: {
    unassigned: "Unassigned",
    label: "Assigned to",
    nowResponsible: (name: string) => `${name} is now assigned.`,
    removed: "Assignment removed.",
  },
});

const NOBODY = "none";

export function AssigneeControl({
  inquiryId,
  assigneeId,
  team,
}: {
  inquiryId: string;
  assigneeId: string | null;
  team: { id: string; fullName: string }[];
}) {
  const [value, setValue] = useOptimistic(assigneeId ?? NOBODY);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();

  const options = [
    {
      value: NOBODY,
      label: T.unassigned,
      icon: <EmptyAvatar size="sm" label="" />,
    },
    ...team.map((m) => ({ value: m.id, label: m.fullName, icon: <Avatar name={m.fullName} size="sm" /> })),
  ];

  return (
    <Dropdown
      label={T.label}
      value={value}
      options={options}
      disabled={pending}
      buttonClassName="h-11 rounded-full pl-1.5 pr-4"
      onChange={(next) =>
        startTransition(async () => {
          setValue(next);
          const result = await assignInquiry(inquiryId, next === NOBODY ? null : next);
          if (!result.ok) {
            toast("error", result.error);
            return;
          }
          const name = team.find((m) => m.id === next)?.fullName;
          toast("success", name ? T.nowResponsible(name) : T.removed);
          await refreshViews(queryClient);
          router.refresh();
        })
      }
    />
  );
}
