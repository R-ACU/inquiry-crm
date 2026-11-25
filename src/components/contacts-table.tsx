"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Building2, Inbox, Mail, Phone, UserRound, UsersRound, type LucideIcon } from "lucide-react";
import { formatRelativeDay } from "@/lib/domain/time";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { IconCircle, PageHeader, SearchField } from "@/components/ui/page-header";
import { useCountUp } from "@/components/overview/use-count-up";
import { useMember } from "@/components/shell/providers";
import { VIEW_KEYS, fetchView, useFirstAppearance, useViewData } from "@/lib/client/views";
import { EntranceContext, useEntrance } from "@/components/ui/entrance";
import { useRiseIn } from "@/components/ui/rise-in";
import type { ContactsData } from "@/lib/data/views";
import { pick } from "@/lib/i18n";

const T = pick({
  de: {
    inquiryCount: (total: number, open: number) => {
      const label = total === 1 ? "1 Anfrage" : `${total} Anfragen`;
      return open > 0 ? `${label}, ${open} offen` : label;
    },
    private: "Privat",
    emailTo: (email: string) => `E-Mail an ${email}`,
    call: (name: string) => `${name} anrufen`,
    latestInquiryPrefix: "Letzte Anfrage, ",
    last: (when: string) => `Zuletzt ${when}`,
    title: "Kontakte",
    searchLabel: "Kontakte durchsuchen",
    searchPlaceholder: "Name, Firma oder E-Mail",
    ownerCount: (n: number) => `${n} Kontakte im Betrieb.`,
    staffCount: (n: number) => `${n} Kontakte aus deinen Anfragen.`,
    statContacts: "Kontakte",
    statWithOpen: "mit offener Anfrage",
    statCompanies: "Firmenkunden",
    emptyNone: "Noch keine Kontakte. Sie entstehen mit der ersten Anfrage.",
    emptyNoMatch: "Kein Kontakt passt zur Suche.",
    colName: "Name",
    colEmail: "E-Mail",
    colPhone: "Telefon",
    colInquiries: "Anfragen",
    colOpen: "Offen",
    colLatest: "Letzte Anfrage",
    noEmail: "keine E-Mail",
    noPhone: "kein Telefon",
    none: "keine",
  },
  en: {
    inquiryCount: (total: number, open: number) => {
      const label = total === 1 ? "1 inquiry" : `${total} inquiries`;
      return open > 0 ? `${label}, ${open} open` : label;
    },
    private: "Private",
    emailTo: (email: string) => `Email ${email}`,
    call: (name: string) => `Call ${name}`,
    latestInquiryPrefix: "Latest inquiry, ",
    last: (when: string) => `Latest: ${when}`,
    title: "Contacts",
    searchLabel: "Search contacts",
    searchPlaceholder: "Name, company or email",
    ownerCount: (n: number) => `${n} ${n === 1 ? "contact" : "contacts"} in the business.`,
    staffCount: (n: number) => `${n} ${n === 1 ? "contact" : "contacts"} from your inquiries.`,
    statContacts: "Contacts",
    statWithOpen: "with open inquiry",
    statCompanies: "Business clients",
    emptyNone: "No contacts yet. They appear with the first inquiry.",
    emptyNoMatch: "No contact matches the search.",
    colName: "Name",
    colEmail: "Email",
    colPhone: "Phone",
    colInquiries: "Inquiries",
    colOpen: "Open",
    colLatest: "Latest inquiry",
    noEmail: "no email",
    noPhone: "no phone",
    none: "none",
  },
});

interface ContactRow {
  id: string;
  full_name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  stats: { total: number; open: number; last: string | null; lastId: string | null };
}

function inquiryCount(stats: ContactRow["stats"]) {
  return T.inquiryCount(stats.total, stats.open);
}

const roundAction =
  "press inline-flex size-10 items-center justify-center rounded-full bg-raised text-muted hover:bg-fg hover:text-surface";

/** Phone layout: one card per contact, with thumb-sized actions. */
function ContactCard({ contact }: { contact: ContactRow }) {
  return (
    <li className="rounded-inner bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={contact.full_name} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{contact.full_name}</p>
            <p className="truncate text-[13px] text-muted">{contact.company ?? T.private}</p>
          </div>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", contact.stats.open > 0 ? "bg-accent-soft text-accent-fg" : "bg-raised text-muted")}>
          {inquiryCount(contact.stats)}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {contact.email && (
          <a href={`mailto:${contact.email}`} className={roundAction} aria-label={T.emailTo(contact.email)} title={contact.email}>
            <Mail className="size-4" aria-hidden />
          </a>
        )}
        {contact.phone && (
          <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className={roundAction} aria-label={T.call(contact.full_name)} title={contact.phone}>
            <Phone className="size-4" aria-hidden />
          </a>
        )}
        {contact.stats.lastId && contact.stats.last && (
          <Link
            href={`/inquiries/${contact.stats.lastId}`}
            className="press ml-auto inline-flex h-10 items-center gap-1.5 rounded-full bg-raised pr-2 pl-4 text-[13px] text-muted hover:text-fg"
          >
            <span className="sr-only">{T.latestInquiryPrefix}</span>
            {T.last(formatRelativeDay(contact.stats.last))}
            <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
    </li>
  );
}

function Stat({ icon, label, value, tone }: { icon: LucideIcon; label: string; value: number; tone?: "soft" | "solid" | "plain" }) {
  const shown = useCountUp(value);
  return (
    <div className="flex items-center gap-4 rounded-card bg-surface p-4 shadow-card sm:p-5">
      <IconCircle icon={icon} tone={tone} className="max-sm:hidden" />
      <div>
        <p className="figures text-[24px] leading-none font-medium sm:text-[28px]">{Math.round(shown)}</p>
        <p className="mt-1 text-xs text-muted sm:text-[13px]">{label}</p>
      </div>
    </div>
  );
}

/**
 * A table row that rises in when it appears (first load, a search that
 * brings it back), and only then; rows of a view rebuilt from the cache just
 * stand there (see ui/entrance.ts and ui/rise-in.ts).
 */
function RiseInRow({ index, rise, className, children }: { index: number; rise: boolean; className: string; children: ReactNode }) {
  const ref = useRiseIn<HTMLTableRowElement>(rise, Math.min(index, 12) * 20);
  return (
    <tr ref={ref} className={className}>
      {children}
    </tr>
  );
}

/** The contacts page: cached after the first visit, refreshed in the background. */
export function ContactsView({ contacts }: { contacts: Promise<ContactsData> }) {
  const member = useMember();
  const entrance = useFirstAppearance("contacts");
  const data = useViewData(VIEW_KEYS.contacts, contacts, () => fetchView<ContactsData>("contacts"));
  return (
    <EntranceContext value={entrance}>
      <ContactsTable contacts={data} owner={member.role === "owner"} />
    </EntranceContext>
  );
}

export function ContactsTable({ contacts, owner }: { contacts: ContactRow[]; owner: boolean }) {
  const [search, setSearch] = useState("");
  // Rows of the first render rise in only on the view's entrance; rows a search brings back always do.
  const entrance = useEntrance();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((c) => [c.full_name, c.company, c.email].filter(Boolean).some((v) => v!.toLowerCase().includes(needle)));
  }, [contacts, search]);

  const withOpen = contacts.filter((c) => c.stats.open > 0).length;
  const companies = contacts.filter((c) => c.company).length;

  return (
    <div>
      <PageHeader
        title={T.title}
        actions={<SearchField value={search} onChange={setSearch} label={T.searchLabel} placeholder={T.searchPlaceholder} className="sm:w-80" />}
      >
        <p>{owner ? T.ownerCount(contacts.length) : T.staffCount(contacts.length)}</p>
      </PageHeader>

      <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4 xl:gap-5">
        <Stat icon={UsersRound} label={T.statContacts} value={contacts.length} tone="solid" />
        <Stat icon={Inbox} label={T.statWithOpen} value={withOpen} />
        <Stat icon={Building2} label={T.statCompanies} value={companies} tone="plain" />
      </div>

      {filtered.length === 0 ? (
        <div className="animate-rise-in mt-5 flex flex-col items-center rounded-card bg-surface px-6 py-16 text-center shadow-card">
          <IconCircle icon={UserRound} tone="plain" />
          <p className="mt-3 text-sm text-muted">
            {contacts.length === 0 ? T.emptyNone : T.emptyNoMatch}
          </p>
        </div>
      ) : (
        <>
          <ul className="mt-5 flex flex-col gap-2 md:hidden">
            {filtered.map((contact) => (
              <ContactCard key={contact.id} contact={contact} />
            ))}
          </ul>

          <div className="mt-5 hidden rounded-card bg-surface p-3 shadow-card md:block">
            <table className="w-full border-separate border-spacing-y-1 text-left text-[13px]">
              <thead className="text-muted">
                <tr>
                  <th scope="col" className="px-4 pt-3 pb-2 font-medium">{T.colName}</th>
                  <th scope="col" className="px-4 pt-3 pb-2 font-medium">{T.colEmail}</th>
                  <th scope="col" className="px-4 pt-3 pb-2 font-medium">{T.colPhone}</th>
                  <th scope="col" className="px-4 pt-3 pb-2 text-right font-medium">{T.colInquiries}</th>
                  <th scope="col" className="px-4 pt-3 pb-2 text-right font-medium">{T.colOpen}</th>
                  <th scope="col" className="px-4 pt-3 pb-2 text-right font-medium">{T.colLatest}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((contact, index) => (
                  <RiseInRow
                    key={contact.id}
                    index={index}
                    rise={entrance || mounted}
                    className="group [&>td]:transition-colors [&>td]:duration-150 hover:[&>td]:bg-hover [&>td:first-child]:rounded-l-2xl [&>td:last-child]:rounded-r-2xl"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={contact.full_name} size="lg" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{contact.full_name}</p>
                          <p className="text-muted">{contact.company ?? T.private}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      {contact.email ? (
                        <a href={`mailto:${contact.email}`} className="rounded-sm hover:text-fg hover:underline">
                          {contact.email}
                        </a>
                      ) : (
                        <span>{T.noEmail}</span>
                      )}
                    </td>
                    <td className="figures px-4 py-2.5 text-muted">{contact.phone ?? T.noPhone}</td>
                    <td className="figures px-4 py-2.5 text-right">{contact.stats.total}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={cn(
                          "figures inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-semibold",
                          contact.stats.open > 0 ? "bg-accent-soft text-accent-fg" : "text-muted",
                        )}
                      >
                        {contact.stats.open}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {contact.stats.lastId && contact.stats.last ? (
                        <Link
                          href={`/inquiries/${contact.stats.lastId}`}
                          className="press inline-flex h-8 items-center gap-1.5 rounded-full pr-1.5 pl-3 text-muted hover:bg-surface hover:text-fg"
                        >
                          {formatRelativeDay(contact.stats.last)}
                          <span className="inline-flex size-6 items-center justify-center rounded-full bg-raised transition-colors group-hover:bg-fg group-hover:text-surface">
                            <ArrowUpRight className="size-3.5" aria-hidden />
                          </span>
                        </Link>
                      ) : (
                        <span className="text-muted">{T.none}</span>
                      )}
                    </td>
                  </RiseInRow>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
