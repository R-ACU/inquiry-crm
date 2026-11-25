import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CalendarPlus,
  Clock,
  Inbox,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  Tag,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { requireMember } from "@/lib/auth/dal";
import { getInquiry, getPendingDraft, listOtherInquiriesOfContact, listTeam, listTimeline } from "@/lib/data/queries";
import { EVENT_TYPE_LABELS, SOURCE_LABELS, STATUS_LABELS } from "@/lib/domain/status";
import { unconfirmedIntakeDetails } from "@/lib/domain/intake";
import { formatEuro } from "@/lib/domain/money";
import { formatEventDate, formatTimeRange, formatTimestamp } from "@/lib/domain/time";
import { DateTile, countdownSentence, daysUntil } from "@/components/date-tile";
import { StatusChip, StatusDot } from "@/components/status";
import { Avatar, EmptyAvatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Panel } from "@/components/ui/page-header";
import { StatusControl } from "@/components/inquiry/status-control";
import { AssigneeControl } from "@/components/inquiry/assignee-control";
import { DraftPanel } from "@/components/inquiry/draft-panel";
import { Timeline } from "@/components/inquiry/timeline";
import { NoteComposer } from "@/components/inquiry/note-composer";
import { cn } from "@/lib/cn";
import { pick } from "@/lib/i18n";

const T = pick({
  de: {
    title: "Anfrage",
    allInquiries: "Alle Anfragen",
    date: "Termin",
    time: "Uhrzeit",
    guests: "Gäste",
    budget: "Budget",
    place: "Ort",
    occasion: "Anlass",
    received: "Eingang",
    open: "offen",
    persons: (n: number) => `${n} Personen`,
    notClassified: "noch nicht eingeordnet",
    receivedVia: (when: string, source: string) => `${when} über ${source}`,
    calendarTitle: "Lädt eine Kalenderdatei (.ics), die jede Kalender-App öffnet",
    toCalendar: "In den Kalender",
    calendarNeedsDate: "Erst möglich, wenn ein Termin feststeht",
    state: "Stand der Anfrage",
    message: "Nachricht",
    noMessage: "Keine Nachricht mitgeschickt.",
    history: "Verlauf",
    historyDescription: "Notizen des Teams und jede Änderung, neueste zuerst.",
    contact: "Kontakt",
    unconfirmedTitle: "Per E-Mail zugeordnet, nicht bestätigt",
    unconfirmedDiffers: "Die Anfrage kam mit anderen Angaben. Vor dem Antworten prüfen, ob sie wirklich von diesem Kontakt stammt.",
    unconfirmedMatches: "Die Angaben stimmen mit dem Kontakt überein. Die E-Mail-Adresse selbst ist nicht bestätigt.",
    assignee: "Zuständig",
    unassigned: "Nicht zugewiesen",
    others: "Weitere Anfragen dieses Kontakts",
    loading: "Anfrage wird geladen",
  },
  en: {
    title: "Inquiry",
    allInquiries: "All inquiries",
    date: "Event date",
    time: "Time",
    guests: "Guests",
    budget: "Budget",
    place: "Venue",
    occasion: "Occasion",
    received: "Received",
    open: "open",
    persons: (n: number) => `${n} guests`,
    notClassified: "not classified yet",
    receivedVia: (when: string, source: string) => `${when} via ${source}`,
    calendarTitle: "Downloads a calendar file (.ics) that any calendar app opens",
    toCalendar: "Add to calendar",
    calendarNeedsDate: "Only possible once an event date is set",
    state: "Inquiry status",
    message: "Message",
    noMessage: "No message was sent.",
    history: "History",
    historyDescription: "Team notes and every change, newest first.",
    contact: "Contact",
    unconfirmedTitle: "Matched by email, not confirmed",
    unconfirmedDiffers: "The inquiry came with different details. Check that it really comes from this contact before replying.",
    unconfirmedMatches: "The details match the contact. The email address itself is not confirmed.",
    assignee: "Assigned to",
    unassigned: "Not assigned",
    others: "Other inquiries from this contact",
    loading: "Loading inquiry",
  },
});

export const metadata: Metadata = { title: T.title };

export default function InquiryPage({ params }: PageProps<"/inquiries/[id]">) {
  return (
    <div className="mx-auto max-w-[1360px]">
      <Link href="/inquiries" className={buttonClasses("ghost", "sm", "-ml-3 rounded-full max-md:h-10")}>
        <ArrowLeft aria-hidden />
        {T.allInquiries}
      </Link>
      <Suspense fallback={<DetailSkeleton />}>
        <InquiryDetail params={params} />
      </Suspense>
    </div>
  );
}

const contactLink =
  "flex min-h-10 min-w-0 items-center gap-2.5 rounded-lg px-2 -mx-2 transition-colors duration-150 hover:bg-hover hover:text-fg md:min-h-9";

async function InquiryDetail({ params }: { params: PageProps<"/inquiries/[id]">["params"] }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const member = await requireMember();
  const inquiry = await getInquiry(id);
  if (!inquiry) notFound();

  const [timeline, draft, others, team] = await Promise.all([
    listTimeline(id),
    getPendingDraft(id),
    inquiry.contact ? listOtherInquiriesOfContact(inquiry.contact.id, id) : Promise.resolve([]),
    listTeam(),
  ]);

  const days = inquiry.event_date ? daysUntil(inquiry.event_date) : null;
  const facts: { label: string; value: string; icon: LucideIcon; wide?: boolean }[] = [
    { label: T.date, value: formatEventDate(inquiry.event_date), icon: CalendarDays },
    { label: T.time, value: formatTimeRange(inquiry.start_time, inquiry.end_time) ?? T.open, icon: Clock },
    { label: T.guests, value: inquiry.guest_count ? T.persons(inquiry.guest_count) : T.open, icon: UsersRound },
    { label: T.budget, value: formatEuro(inquiry.budget_cents), icon: Wallet },
    { label: T.place, value: inquiry.location ?? T.open, icon: MapPin },
    { label: T.occasion, value: inquiry.event_type ? EVENT_TYPE_LABELS[inquiry.event_type] : T.notClassified, icon: Tag },
    { label: T.received, value: T.receivedVia(formatTimestamp(inquiry.created_at), SOURCE_LABELS[inquiry.source]), icon: Inbox, wide: true },
  ];
  const unconfirmed =
    inquiry.matched_existing_contact && inquiry.contact ? unconfirmedIntakeDetails(inquiry.submitted_contact, inquiry.contact) : null;
  const assistantMode = process.env.AI_MODE === "anthropic" ? "anthropic" : "mock";

  return (
    <article className="mt-3">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <DateTile date={inquiry.event_date} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="display-title text-[24px] leading-tight text-balance md:text-[28px]">{inquiry.title}</h1>
              <StatusChip status={inquiry.status} />
            </div>
            <p className="mt-1 text-[15px] text-muted">
              {inquiry.contact?.company ?? inquiry.contact?.full_name}
              {days !== null && (
                <span className="block text-muted sm:inline">
                  <span className="mx-2.5 inline-block size-1 -translate-y-0.5 rounded-full bg-line-strong max-sm:hidden" aria-hidden />
                  {countdownSentence(days)}
                </span>
              )}
            </p>
          </div>
        </div>
        {inquiry.event_date ? (
          <a
            href={`/api/inquiries/${inquiry.id}/calendar`}
            download
            title={T.calendarTitle}
            className={buttonClasses("secondary", "md", "rounded-full max-sm:h-10 max-sm:w-full")}
          >
            <CalendarPlus className="text-accent-fg" aria-hidden />
            {T.toCalendar}
          </a>
        ) : (
          <span className={buttonClasses("secondary", "md", "cursor-not-allowed rounded-full opacity-60 max-sm:h-10 max-sm:w-full")} title={T.calendarNeedsDate}>
            <CalendarPlus aria-hidden />
            {T.toCalendar}
          </span>
        )}
      </header>

      <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] font-medium text-muted">{T.state}</p>
              <StatusControl inquiryId={inquiry.id} status={inquiry.status} />
            </div>
          </Panel>

          <Panel title={T.title} id="facts-heading">
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {facts.map((fact) => (
                <div key={fact.label} className={cn("flex items-start gap-3 rounded-2xl bg-raised px-3.5 py-3", fact.wide && "sm:col-span-2 xl:col-span-3")}>
                  <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface text-muted shadow-card">
                    <fact.icon className="size-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted">{fact.label}</dt>
                    <dd className="figures mt-0.5 text-sm font-medium text-fg">{fact.value}</dd>
                  </div>
                </div>
              ))}
            </dl>
            <div className="mt-5">
              <p className="text-xs font-medium text-muted">{T.message}</p>
              <p className="mt-2 max-w-prose text-[15px] leading-relaxed whitespace-pre-wrap">{inquiry.message || T.noMessage}</p>
            </div>
          </Panel>

          <DraftPanel
            inquiryId={inquiry.id}
            mode={assistantMode}
            draft={
              draft
                ? {
                    id: draft.id,
                    summary: draft.summary,
                    questions: Array.isArray(draft.questions) ? draft.questions.map(String) : [],
                    suggestedEventType: draft.suggested_event_type,
                    model: draft.model,
                    createdAt: draft.created_at,
                  }
                : null
            }
          />

          <Panel title={T.history} id="history-heading" description={T.historyDescription}>
            <NoteComposer inquiryId={inquiry.id} />
            <Timeline
              notes={timeline.notes}
              events={timeline.events}
              names={Object.fromEntries(team.map((p) => [p.id, p.full_name]))}
              viewerId={member.id}
            />
          </Panel>
        </div>

        <aside className="flex flex-col gap-5">
          <Panel title={T.contact} id="contact-heading">
            {inquiry.contact && (
              <>
                <div className="flex items-center gap-3">
                  <Avatar name={inquiry.contact.full_name} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium">{inquiry.contact.full_name}</p>
                    {inquiry.contact.company && (
                      <p className="flex items-center gap-1.5 truncate text-[13px] text-muted">
                        <Building2 className="size-3.5 shrink-0" aria-hidden />
                        {inquiry.contact.company}
                      </p>
                    )}
                  </div>
                </div>
                <ul className="mt-4 flex flex-col gap-1 text-[13px] text-muted">
                  {inquiry.contact.email && (
                    <li>
                      <a href={`mailto:${inquiry.contact.email}`} className={contactLink}>
                        <Mail className="size-4 shrink-0 text-faint" aria-hidden />
                        <span className="truncate">{inquiry.contact.email}</span>
                      </a>
                    </li>
                  )}
                  {inquiry.contact.phone && (
                    <li>
                      <a href={`tel:${inquiry.contact.phone.replace(/\s/g, "")}`} className={contactLink}>
                        <Phone className="size-4 shrink-0 text-faint" aria-hidden />
                        <span className="figures">{inquiry.contact.phone}</span>
                      </a>
                    </li>
                  )}
                </ul>
                {unconfirmed && (
                  <div role="note" className="mt-4 rounded-xl border border-st-quoted/30 bg-[color-mix(in_srgb,var(--color-st-quoted)_7%,var(--color-surface))] p-3.5">
                    <p className="flex items-center gap-2 text-[13px] font-medium text-fg">
                      <ShieldAlert className="size-4 shrink-0 text-st-quoted" aria-hidden />
                      {T.unconfirmedTitle}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      {unconfirmed.length > 0
                        ? T.unconfirmedDiffers
                        : T.unconfirmedMatches}
                    </p>
                    {unconfirmed.length > 0 && (
                      <dl className="mt-2.5 flex flex-col gap-1 text-xs">
                        {unconfirmed.map((item) => (
                          <div key={item.label} className="flex gap-2">
                            <dt className="w-16 shrink-0 text-muted">{item.label}</dt>
                            <dd className="min-w-0 break-words text-fg">{item.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                )}
              </>
            )}
          </Panel>

          <Panel title={T.assignee} id="assignee-heading">
            {member.role === "owner" ? (
              <AssigneeControl
                inquiryId={inquiry.id}
                assigneeId={inquiry.assignee?.id ?? null}
                team={team.map((p) => ({ id: p.id, fullName: p.full_name }))}
              />
            ) : (
              <p className="flex items-center gap-2.5 text-sm">
                {inquiry.assignee ? <Avatar name={inquiry.assignee.full_name} size="sm" /> : <EmptyAvatar size="sm" />}
                {inquiry.assignee?.full_name ?? T.unassigned}
              </p>
            )}
          </Panel>

          {others.length > 0 && (
            <Panel title={T.others} id="others-heading">
              <ul className="-mx-2 flex flex-col gap-1">
                {others.map((other) => (
                  <li key={other.id}>
                    <Link
                      href={`/inquiries/${other.id}`}
                      className="flex min-h-10 items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] text-muted transition-colors duration-150 hover:bg-hover hover:text-fg"
                    >
                      <StatusDot status={other.status} />
                      <span className="min-w-0 flex-1 truncate">{other.title}</span>
                      <span className="shrink-0 text-xs text-muted">{STATUS_LABELS[other.status]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </article>
  );
}

function DetailSkeleton() {
  return (
    <div className="mt-3" aria-busy="true" aria-label={T.loading}>
      <div className="flex items-center gap-4">
        <div className="skeleton size-16 rounded-2xl" />
        <div className="flex-1">
          <div className="skeleton h-7 w-72 max-w-full" />
          <div className="skeleton mt-2 h-4 w-48" />
        </div>
      </div>
      <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex flex-col gap-5">
          <div className="skeleton h-20 rounded-2xl" />
          <div className="skeleton h-72 rounded-2xl" />
          <div className="skeleton h-40 rounded-2xl" />
        </div>
        <div className="flex flex-col gap-5">
          <div className="skeleton h-44 rounded-2xl" />
          <div className="skeleton h-24 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
