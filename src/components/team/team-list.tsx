"use client";

import { useOptimistic, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UsersRound } from "lucide-react";
import { setMemberRole } from "@/lib/actions/team";
import { ROLE_LABELS } from "@/lib/domain/status";
import { Dropdown } from "@/components/ui/dropdown";
import { Avatar } from "@/components/ui/avatar";
import { Panel } from "@/components/ui/page-header";
import { useToast } from "@/components/shell/providers";
import { VIEW_KEYS, refreshViews } from "@/lib/client/views";
import type { TeamData } from "@/lib/data/views";
import { pick } from "@/lib/i18n";

const T = pick({
  de: {
    ownerHint: "Sieht und ändert alles, verwaltet Rollen und API",
    staffHint: "Sieht nur zugewiesene Anfragen und deren Kontakte",
    you: "Du",
    roleOf: (name: string) => `Rolle von ${name}`,
    roleChanged: (name: string, role: string) => `${name} ist jetzt ${role}.`,
    title: "Team",
    description: "Neue Konten richtet der Betreiber ein. Sie starten als Mitarbeiter, die Rolle änderst du hier.",
  },
  en: {
    ownerHint: "Sees and edits everything, manages roles and API",
    staffHint: "Sees only assigned inquiries and their contacts",
    you: "You",
    roleOf: (name: string) => `Role of ${name}`,
    roleChanged: (name: string, role: string) => `${name}'s role is now ${role}.`,
    title: "Team",
    description: "New accounts are set up by the operator. They start as staff; you change the role here.",
  },
});

type Role = "owner" | "staff";

const ROLE_OPTIONS = [
  { value: "owner" as const, label: ROLE_LABELS.owner, hint: T.ownerHint },
  { value: "staff" as const, label: ROLE_LABELS.staff, hint: T.staffHint },
];

function MemberRow({ member, isViewer }: { member: { id: string; fullName: string; role: Role }; isViewer: boolean }) {
  const [role, setRole] = useOptimistic(member.role);
  const [pending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const toast = useToast();

  return (
    <li className="flex flex-col gap-3 rounded-inner bg-raised p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={member.fullName} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {member.fullName}
            {isViewer && <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">{T.you}</span>}
          </p>
          <p className="mt-0.5 text-xs text-muted">{ROLE_OPTIONS.find((o) => o.value === role)?.hint}</p>
        </div>
      </div>
      <Dropdown
        label={T.roleOf(member.fullName)}
        value={role}
        options={ROLE_OPTIONS}
        disabled={pending}
        align="end"
        className="sm:w-40"
        buttonClassName="h-10 rounded-full px-4"
        onChange={(next) =>
          startTransition(async () => {
            setRole(next);
            const result = await setMemberRole(member.id, next);
            if (!result.ok) {
              toast("error", result.error);
              return;
            }
            toast("success", T.roleChanged(member.fullName, ROLE_LABELS[next]));
            // Write the new role into the cached view first, so the row keeps it when the optimistic value ends.
            queryClient.setQueryData<TeamData>(VIEW_KEYS.team, (data) =>
              data ? { ...data, team: data.team.map((m) => (m.id === member.id ? { ...m, role: next } : m)) } : data,
            );
            await refreshViews(queryClient);
          })
        }
      />
    </li>
  );
}

export function TeamList({ team, viewerId, className }: { team: { id: string; fullName: string; role: Role }[]; viewerId: string; className?: string }) {
  return (
    <Panel
      id="team-heading"
      title={T.title}
      icon={UsersRound}
      iconTone="solid"
      description={T.description}
      className={className}
    >
      <ul className="flex flex-col gap-2">
        {team.map((member) => (
          <MemberRow key={member.id} member={member} isViewer={member.id === viewerId} />
        ))}
      </ul>
    </Panel>
  );
}
