import type { Metadata } from "next";
import { Suspense } from "react";
import { Lock } from "lucide-react";
import { requireMember } from "@/lib/auth/dal";
import { listApiKeys, listTeam } from "@/lib/data/queries";
import { serverEnv } from "@/lib/env";
import { TeamList } from "@/components/team/team-list";
import { ApiKeys } from "@/components/team/api-keys";
import { IconCircle, PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Team und API" };

export default function TeamPage() {
  return (
    <div>
      <Suspense fallback={<TeamSkeleton />}>
        <TeamLoader />
      </Suspense>
    </div>
  );
}

async function TeamLoader() {
  const member = await requireMember();
  if (member.role !== "owner") {
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center rounded-card bg-surface px-8 py-12 text-center shadow-card">
        <IconCircle icon={Lock} tone="plain" />
        <h1 className="heading mt-4 text-xl">Nur für Inhaber</h1>
        <p className="mt-2 text-sm text-muted">Rollen und API-Schlüssel verwaltet die Inhaberin oder der Inhaber des Betriebs.</p>
      </div>
    );
  }

  const [team, keys] = await Promise.all([listTeam(), listApiKeys()]);
  return (
    <div className="flex flex-col gap-6 md:gap-7">
      <PageHeader title="Team und API">
        <p>Wer welche Rechte hat und welche Systeme Anfragen schicken dürfen.</p>
      </PageHeader>
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12 xl:gap-5">
        <TeamList className="xl:col-span-5" team={team.map((p) => ({ id: p.id, fullName: p.full_name, role: p.role }))} viewerId={member.id} />
        <ApiKeys className="xl:col-span-7" keys={keys} endpoint={`${serverEnv.appUrl.replace(/\/$/, "")}/api/v1/inquiries`} />
      </div>
    </div>
  );
}

function TeamSkeleton() {
  return (
    <div aria-busy="true" aria-label="Wird geladen">
      <div className="skeleton h-8 w-48" />
      <div className="skeleton mt-3 h-4 w-80 max-w-full" />
      <div className="mt-7 grid gap-5 xl:grid-cols-12">
        <div className="skeleton h-72 rounded-card xl:col-span-5" />
        <div className="skeleton h-96 rounded-card xl:col-span-7" />
      </div>
    </div>
  );
}
