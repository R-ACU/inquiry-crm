import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, LayoutDashboard, UsersRound } from "lucide-react";
import { Brand } from "@/components/brand";
import { buttonClasses } from "@/components/ui/button";
import { pick } from "@/lib/i18n";

const T = pick({
  de: {
    title: "Seite nicht gefunden",
    text: "Diese Adresse gibt es nicht. Vielleicht ist der Link veraltet oder unvollständig. Von hier aus geht es weiter:",
    overview: "Zur Übersicht",
    inquiries: "Anfragen",
    contacts: "Kontakte",
  },
  en: {
    title: "Page not found",
    text: "This address does not exist. The link may be out of date or incomplete. You can carry on from here:",
    overview: "Back to overview",
    inquiries: "Inquiries",
    contacts: "Contacts",
  },
});

export const metadata: Metadata = { title: T.title };

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
          <h1 className="display-title mt-4 text-[26px] leading-tight">{T.title}</h1>
          <p className="mt-2 max-w-sm text-[15px] text-muted">{T.text}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <Link href="/" className={buttonClasses("primary", "md")}>
              <LayoutDashboard aria-hidden />
              {T.overview}
            </Link>
            <Link href="/inquiries" className={buttonClasses("secondary", "md")}>
              <Inbox aria-hidden />
              {T.inquiries}
            </Link>
            <Link href="/contacts" className={buttonClasses("secondary", "md")}>
              <UsersRound aria-hidden />
              {T.contacts}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
