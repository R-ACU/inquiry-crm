import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, LayoutDashboard, UsersRound } from "lucide-react";
import { Brand } from "@/components/brand";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = { title: "Seite nicht gefunden" };

/** Any unknown address. Inquiries have their own page in inquiries/[id]/not-found.tsx. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col px-5 py-6 md:px-10">
      <Link href="/" className="press self-start rounded-xl">
        <Brand />
      </Link>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center pb-16">
        <div className="animate-rise-in flex w-full flex-col items-center rounded-card bg-surface px-8 py-14 text-center shadow-card">
          <p className="figures text-[96px] leading-none font-medium tracking-[-0.03em] text-accent-fg select-none md:text-[120px]" aria-hidden>
            404
          </p>
          <h1 className="display-title mt-4 text-[26px] leading-tight">Seite nicht gefunden</h1>
          <p className="mt-2 max-w-sm text-[15px] text-muted">Diese Adresse gibt es nicht. Vielleicht ist der Link veraltet oder unvollständig. Von hier aus geht es weiter:</p>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <Link href="/" className={buttonClasses("primary", "md")}>
              <LayoutDashboard aria-hidden />
              Zur Übersicht
            </Link>
            <Link href="/inquiries" className={buttonClasses("secondary", "md")}>
              <Inbox aria-hidden />
              Anfragen
            </Link>
            <Link href="/contacts" className={buttonClasses("secondary", "md")}>
              <UsersRound aria-hidden />
              Kontakte
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
