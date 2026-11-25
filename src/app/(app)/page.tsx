import type { Metadata } from "next";
import { Suspense } from "react";
import { requireMember } from "@/lib/auth/dal";
import { listOverviewData } from "@/lib/data/queries";
import { toStatusChange, type OverviewInquiry, type StatusChange } from "@/lib/domain/overview";
import { Overview } from "@/components/overview/overview";

export const metadata: Metadata = { title: "Übersicht" };

export default function OverviewPage() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <OverviewLoader />
    </Suspense>
  );
}

async function OverviewLoader() {
  const member = await requireMember();
  const { inquiries, events, now } = await listOverviewData();
  const changes = events.map(toStatusChange).filter((c): c is StatusChange => c !== null);
  return (
    <Overview
      inquiries={inquiries as OverviewInquiry[]}
      changes={changes}
      now={now}
      firstName={member.fullName.split(" ")[0]}
      owner={member.role === "owner"}
    />
  );
}

function OverviewSkeleton() {
  return (
    <div aria-busy="true" aria-label="Übersicht wird geladen" className="flex flex-col gap-6 md:gap-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="skeleton h-8 w-44" />
          <div className="skeleton mt-3 h-4 w-[26rem] max-w-full" />
        </div>
        <div className="skeleton hidden h-10 w-64 rounded-full sm:block" />
      </div>
      <div className="grid gap-5 xl:grid-cols-12">
        <div className="skeleton h-[25rem] rounded-card xl:col-span-8" />
        <div className="flex flex-col gap-5 xl:col-span-4">
          <div className="skeleton h-48 rounded-card" />
          <div className="skeleton h-48 rounded-card" />
        </div>
      </div>
    </div>
  );
}
