import type { Metadata } from "next";
import { Suspense } from "react";
import { loadOverview } from "@/lib/data/views";
import { OverviewView } from "@/components/overview/overview";
import { pick } from "@/lib/i18n";

const T = pick({
  de: { title: "Übersicht", loading: "Übersicht wird geladen" },
  en: { title: "Overview", loading: "Loading overview" },
});

export const metadata: Metadata = { title: T.title };

export default function OverviewPage() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <OverviewView data={loadOverview()} />
    </Suspense>
  );
}

function OverviewSkeleton() {
  return (
    <div aria-busy="true" aria-label={T.loading} className="loading-delayed flex flex-col gap-6 md:gap-7">
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
