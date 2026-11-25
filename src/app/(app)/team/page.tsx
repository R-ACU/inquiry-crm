import type { Metadata } from "next";
import { Suspense } from "react";
import { loadTeam } from "@/lib/data/views";
import { TeamView } from "@/components/team/team-view";

export const metadata: Metadata = { title: "Team und API" };

export default function TeamPage() {
  return (
    <Suspense fallback={<TeamSkeleton />}>
      <TeamView data={loadTeam()} />
    </Suspense>
  );
}

function TeamSkeleton() {
  return (
    <div aria-busy="true" aria-label="Wird geladen" className="loading-delayed">
      <div className="skeleton h-8 w-48" />
      <div className="skeleton mt-3 h-4 w-80 max-w-full" />
      <div className="mt-7 grid gap-5 xl:grid-cols-12">
        <div className="skeleton h-72 rounded-card xl:col-span-5" />
        <div className="skeleton h-96 rounded-card xl:col-span-7" />
      </div>
    </div>
  );
}
