"use client";

import { Lock } from "lucide-react";
import { useMember } from "@/components/shell/providers";
import { IconCircle, PageHeader } from "@/components/ui/page-header";
import { VIEW_KEYS, fetchView, useViewData } from "@/lib/client/views";
import type { TeamData } from "@/lib/data/views";
import { TeamList } from "./team-list";
import { ApiKeys } from "./api-keys";
import { pick } from "@/lib/i18n";

const T = pick({
  de: {
    title: "Team und API",
    intro: "Wer welche Rechte hat und welche Systeme Anfragen schicken dürfen.",
    ownersOnly: "Nur für Inhaber",
    ownersOnlyHint: "Rollen und API-Schlüssel verwaltet die Inhaberin oder der Inhaber des Betriebs.",
  },
  en: {
    title: "Team & API",
    intro: "Who has which rights and which systems may send inquiries.",
    ownersOnly: "Owners only",
    ownersOnlyHint: "Roles and API keys are managed by the owner of the business.",
  },
});

/** Team and API: cached after the first visit, refreshed in the background. Owners only. */
export function TeamView({ data }: { data: Promise<TeamData> }) {
  const member = useMember();
  if (member.role !== "owner") return <OwnerOnly />;
  return <OwnerTeam data={data} viewerId={member.id} />;
}

function OwnerTeam({ data, viewerId }: { data: Promise<TeamData>; viewerId: string }) {
  const team = useViewData(VIEW_KEYS.team, data, () => fetchView<TeamData>("team"));
  if (!team) return <OwnerOnly />;
  return (
    <div className="flex flex-col gap-6 md:gap-7">
      <PageHeader title={T.title}>
        <p>{T.intro}</p>
      </PageHeader>
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12 xl:gap-5">
        <TeamList className="xl:col-span-5" team={team.team} viewerId={viewerId} />
        <ApiKeys className="xl:col-span-7" keys={team.keys} endpoint={team.endpoint} />
      </div>
    </div>
  );
}

function OwnerOnly() {
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center rounded-card bg-surface px-8 py-12 text-center shadow-card">
      <IconCircle icon={Lock} tone="plain" />
      <h1 className="heading mt-4 text-xl">{T.ownersOnly}</h1>
      <p className="mt-2 text-sm text-muted">{T.ownersOnlyHint}</p>
    </div>
  );
}
