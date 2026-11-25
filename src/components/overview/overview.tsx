"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { BarChart3, CalendarClock, CircleCheckBig, Gauge, Inbox, Layers, Wallet, type LucideIcon } from "lucide-react";
import {
  PERIODS,
  computeOverview,
  upcomingEvents,
  weeklyReceived,
  type Delta,
  type OverviewInquiry,
  type PeriodDays,
  type StatusChange,
} from "@/lib/domain/overview";
import { formatEuro } from "@/lib/domain/money";
import { formatTimeRange } from "@/lib/domain/time";
import { Segmented } from "@/components/ui/segmented";
import { Avatar, EmptyAvatar } from "@/components/ui/avatar";
import { StatusChip, StatusDot } from "@/components/status";
import { countdownLabel, daysUntil } from "@/components/date-tile";
import { buttonClasses } from "@/components/ui/button";
import { ArrowLink, IconCircle, PageHeader, Panel } from "@/components/ui/page-header";
import { DeltaChip, PipelineBars, SparkArea, SparkBars, ValueLegend, WeeklyBars, WinGauge, type PipelineRow, type WeekRow } from "./charts";
import { useCountUp } from "./use-count-up";
import { useMember } from "@/components/shell/providers";
import { VIEW_KEYS, fetchView, useFirstAppearance, useViewData } from "@/lib/client/views";
import { EntranceContext } from "@/components/ui/entrance";
import type { OverviewData } from "@/lib/data/views";
import { cn } from "@/lib/cn";
import { BUSINESS_TIME_ZONE, INTL_LOCALE, LOCALE, pick } from "@/lib/i18n";

const T = pick({
  de: {
    periods: { 7: "7 Tage", 30: "30 Tage", 90: "90 Tage" } as Record<PeriodDays, string>,
    versus: (period: string) => `ggü. den ${period}n davor`,
    sinceStart: "seit Beginn des Zeitraums",
    morning: "Guten Morgen",
    afternoon: "Guten Tag",
    evening: "Guten Abend",
    today: "Heute",
    todayDate: (date: string) => `Heute, ${date}`,
    range: (from: string, to: string) => `${from} bis ${to}`,
    rangeWord: "bis",
    until: (to: string) => `bis ${to}`,
    asOfToday: "Stand heute",
    asOf: (date: string) => `Stand ${date}`,
    week: (n: number) => `KW ${n}`,
    weekCurrent: (n: number) => `KW ${n}, laufende Woche`,
    weekRange: (day: string, month: string, end: string) => `${day}. ${month ? `${month} ` : ""}bis ${end}`,
    emptyIntro: "Hier erscheinen Kennzahlen, sobald Anfragen da sind.",
    newCount: (n: number) => (n === 1 ? "1 neue Anfrage" : `${n} neue Anfragen`),
    winCount: (n: number) => (n === 1 ? "1 Zusage" : `${n} Zusagen`),
    summary: (news: string, wins: string, period: string) => `${news} und ${wins} in den letzten ${period}n.`,
    period: "Zeitraum",
    ownerLabels: { page: "Übersicht", pipeline: "Pipeline-Wert", pipelineNote: "Budgets aller offenen Anfragen im Verlauf", won: "Zugesagt" },
    staffLabels: { page: "Deine Übersicht", pipeline: "Deine Pipeline", pipelineNote: "Budgets deiner offenen Anfragen im Verlauf", won: "Deine Zusagen" },
    quoted: "Angebot",
    newWord: "Neu",
    openAsOfToday: "Offen, Stand heute",
    pipelineCaption: "Pipeline-Wert je Abschnitt",
    pipelineHead: ["Abschnitt", "Neu", "Angebot", "Gesamt"],
    newInquiries: "Neue Anfragen",
    inquiryCount: (n: number) => (n === 1 ? "1 Anfrage" : `${n} Anfragen`),
    newPerSection: (series: string) => `Neue Anfragen je Abschnitt: ${series}`,
    openInquiries: "Offene Anfragen",
    openCount: (n: number) => (n === 1 ? "1 offen" : `${n} offen`),
    openOverTime: (series: string) => `Offene Anfragen im Verlauf: ${series}`,
    wonSpark: "Zugesagtes Volumen, aufsummiert über den Zeitraum",
    winRate: "Abschlussquote",
    winRateHint: "Zusagen unter den Entschiedenen",
    upcoming: "Nächste Termine",
    upcomingHint: "Ab heute, ohne abgesagte",
    allInquiries: "Alle Anfragen",
    perWeek: "Anfragen je Woche",
    perWeekHint: (oneWeek: boolean, weeks: number, received: number) =>
      `Letzte 13 Wochen, hervorgehoben ${oneWeek ? "diese Woche" : `die ${weeks} Wochen im Zeitraum`}: ${received} Anfragen`,
    weekHead: ["Woche", "Anfragen"],
    won: "Gewonnen",
    lost: "Verloren",
    noDecision: "Keine Entscheidung im Zeitraum",
    winRateLabel: (percent: number, won: number, lost: number) => `Abschlussquote ${percent} Prozent, ${won} gewonnen, ${lost} verloren`,
    nothingDecided: "Nichts entschieden",
    percent: (n: number) => `${n} %`,
    decided: "entschieden",
    sameAsBefore: "Gleich wie im Zeitraum davor",
    pointsVs: (sign: string, n: number) => `${sign}${n} Prozentpunkte ggü. dem Zeitraum davor`,
    noUpcoming: "Keine Termine ab heute. Sobald eine Anfrage ein Datum hat, steht sie hier.",
    guests: (n: number) => `${n} Gäste`,
    emptyOwner: "Noch keine Anfragen",
    emptyStaff: "Dir ist noch keine Anfrage zugewiesen",
    emptyOwnerHint: "Die Übersicht füllt sich mit der ersten Anfrage. Neue Anfragen kommen über das Webformular oder die API; den Schlüssel legst du unter Team und API an.",
    emptyStaffHint: "Sobald dir jemand eine Anfrage zuweist, siehst du hier Kennzahlen, Termine und den Verlauf.",
    createKey: "API-Schlüssel anlegen",
  },
  en: {
    periods: { 7: "7 days", 30: "30 days", 90: "90 days" } as Record<PeriodDays, string>,
    versus: (period: string) => `vs. the previous ${period}`,
    sinceStart: "since the start of the period",
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
    today: "Today",
    todayDate: (date: string) => `Today, ${date}`,
    range: (from: string, to: string) => `${from} to ${to}`,
    rangeWord: "to",
    until: (to: string) => `to ${to}`,
    asOfToday: "As of today",
    asOf: (date: string) => `As of ${date}`,
    week: (n: number) => `Wk ${n}`,
    weekCurrent: (n: number) => `Wk ${n}, current week`,
    weekRange: (day: string, month: string, end: string) => `${day}${month ? ` ${month}` : ""} to ${end}`,
    emptyIntro: "Figures appear here as soon as there are inquiries.",
    newCount: (n: number) => (n === 1 ? "1 new inquiry" : `${n} new inquiries`),
    winCount: (n: number) => (n === 1 ? "1 win" : `${n} wins`),
    summary: (news: string, wins: string, period: string) => `${news} and ${wins} in the last ${period}.`,
    period: "Period",
    ownerLabels: { page: "Overview", pipeline: "Pipeline value", pipelineNote: "Budgets of all open inquiries over time", won: "Won" },
    staffLabels: { page: "Your overview", pipeline: "Your pipeline", pipelineNote: "Budgets of your open inquiries over time", won: "Your wins" },
    quoted: "Quoted",
    newWord: "New",
    openAsOfToday: "Open, as of today",
    pipelineCaption: "Pipeline value per section",
    pipelineHead: ["Section", "New", "Quoted", "Total"],
    newInquiries: "New inquiries",
    inquiryCount: (n: number) => (n === 1 ? "1 inquiry" : `${n} inquiries`),
    newPerSection: (series: string) => `New inquiries per section: ${series}`,
    openInquiries: "Open inquiries",
    openCount: (n: number) => `${n} open`,
    openOverTime: (series: string) => `Open inquiries over time: ${series}`,
    wonSpark: "Won volume, summed up over the period",
    winRate: "Win rate",
    winRateHint: "Wins among decided inquiries",
    upcoming: "Upcoming events",
    upcomingHint: "From today, excluding cancelled",
    allInquiries: "All inquiries",
    perWeek: "Inquiries per week",
    perWeekHint: (oneWeek: boolean, weeks: number, received: number) =>
      `Last 13 weeks, highlighted ${oneWeek ? "this week" : `the ${weeks} weeks in the period`}: ${received === 1 ? "1 inquiry" : `${received} inquiries`}`,
    weekHead: ["Week", "Inquiries"],
    won: "Won",
    lost: "Lost",
    noDecision: "No decision in the period",
    winRateLabel: (percent: number, won: number, lost: number) => `Win rate ${percent} percent, ${won} won, ${lost} lost`,
    nothingDecided: "Nothing decided",
    percent: (n: number) => `${n}%`,
    decided: "decided",
    sameAsBefore: "Same as the period before",
    pointsVs: (sign: string, n: number) => `${sign}${n} percentage points vs. the period before`,
    noUpcoming: "No events from today. As soon as an inquiry has a date, it appears here.",
    guests: (n: number) => `${n} guests`,
    emptyOwner: "No inquiries yet",
    emptyStaff: "No inquiry is assigned to you yet",
    emptyOwnerHint: "The overview fills with the first inquiry. New inquiries arrive through the web form or the API; you create the key under Team & API.",
    emptyStaffHint: "As soon as someone assigns you an inquiry, you will see figures, events and history here.",
    createKey: "Create API key",
  },
});

const PERIOD_LABELS = T.periods;

const TZ = BUSINESS_TIME_ZONE;
// English spells the month ("12 Dec"): "8/5" reads differently in the US and in Europe.
const dayMonth = new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: TZ, day: "numeric", month: LOCALE === "en" ? "short" : "numeric" });
const dayMonthLong = new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: TZ, day: "numeric", month: "long" });
const weekdayShort = new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: TZ, weekday: "short" });
const weekdayLong = new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const monthShort = new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: "UTC", month: "short" });
const dayOnly = new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: "UTC", day: "numeric" });
const dayMonthUtc = new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: "UTC", day: "numeric", month: "long" });
const eventDay = new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

const euro = (euros: number) => formatEuro(Math.round(euros) * 100);
const euroFromCents = (cents: number) => formatEuro(Math.round(cents / 100) * 100);

function greeting(hour: number) {
  if (hour < 11) return T.morning;
  if (hour < 18) return T.afternoon;
  return T.evening;
}

/** Running total, so the won card shows how the period added up. */
function cumulative(values: number[]): number[] {
  let sum = 0;
  return values.map((v) => (sum += v));
}

const weekday = (t: number) => weekdayShort.format(t).replace(".", "");

/** The overview page: cached after the first visit, refreshed in the background. */
export function OverviewView({ data }: { data: Promise<OverviewData> }) {
  const member = useMember();
  // Rebuilt from the cache, the overview appears without its entrance; switching the period animates again.
  const entrance = useFirstAppearance("overview");
  const [periodChanged, setPeriodChanged] = useState(false);
  const { inquiries, changes, now } = useViewData(VIEW_KEYS.overview, data, () => fetchView<OverviewData>("overview"));
  return (
    <EntranceContext value={entrance || periodChanged}>
      <Overview
        inquiries={inquiries}
        changes={changes}
        now={now}
        firstName={member.fullName.split(" ")[0]}
        owner={member.role === "owner"}
        onPeriodChange={() => setPeriodChanged(true)}
      />
    </EntranceContext>
  );
}

/**
 * The overview as a bento grid: one large dark hero for the pipeline, the
 * key figures around it in cards of different sizes, the gauge and the
 * calendar below. Every figure is computed from the rows RLS lets this user
 * see (lib/domain/overview.ts).
 */
export function Overview({
  inquiries,
  changes,
  now,
  firstName,
  owner,
  onPeriodChange,
}: {
  inquiries: OverviewInquiry[];
  changes: StatusChange[];
  now: number;
  firstName: string;
  owner: boolean;
  onPeriodChange?: () => void;
}) {
  const [period, setPeriod] = useState<PeriodDays>(30);
  const data = useMemo(() => computeOverview(inquiries, changes, period, now), [inquiries, changes, period, now]);
  const weeks = useMemo(() => weeklyReceived(inquiries, now, 13), [inquiries, now]);
  const upcoming = useMemo(() => upcomingEvents(inquiries, now, 6), [inquiries, now]);
  // German formats the hour as "09 Uhr"; read the number part, not the whole string.
  const hour = Number(
    new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).formatToParts(now).find((p) => p.type === "hour")?.value,
  );

  const last = data.buckets.length - 1;
  const bucketLabel = (i: number) => {
    const b = data.buckets[i];
    if (i === last) return T.today;
    return period === 7 ? weekday(b.end) : dayMonth.format(b.end);
  };
  const bucketTitle = (i: number) => {
    const b = data.buckets[i];
    if (period === 7) return i === last ? T.todayDate(dayMonthLong.format(b.end)) : weekdayLong.format(b.end);
    return T.range(dayMonth.format(b.start + 1), dayMonth.format(b.end));
  };

  const pipelineRows: PipelineRow[] = data.pipeline.map((p, i) => ({
    label: bucketLabel(i),
    title: i === last ? T.asOfToday : T.asOf(dayMonthLong.format(p.end)),
    total: (p.newCents + p.quotedCents) / 100,
    newValue: p.newCents / 100,
    quotedValue: p.quotedCents / 100,
    newCount: p.newCount,
    quotedCount: p.quotedCount,
  }));
  const current = pipelineRows[last];

  const periodStartDay = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now - period * 86_400_000);
  const weekRows: WeekRow[] = weeks.map((w, i) => {
    const start = Date.parse(w.start);
    const end = Date.parse(w.end);
    return {
      label: T.week(w.week),
      title: i === weeks.length - 1 ? T.weekCurrent(w.week) : T.week(w.week),
      subtitle: T.weekRange(dayOnly.format(start), monthShort.format(start) !== monthShort.format(end) ? monthShort.format(start) : "", dayMonthUtc.format(end)),
      count: w.count,
      inPeriod: w.end >= periodStartDay,
    };
  });
  const weeksInPeriod = weekRows.filter((w) => w.inPeriod);
  const receivedInWeeks = weeksInPeriod.reduce((s, w) => s + w.count, 0);

  const empty = inquiries.length === 0;
  const versus = T.versus(PERIOD_LABELS[period]);
  const series = (values: number[]) => values.map((value, i) => ({ label: bucketTitle(i), value }));
  const shownPipeline = useCountUp(data.openVolume.value / 100);
  // A staff member sees only their own inquiries (RLS). The labels say so, so nobody reads them as the business's figures.
  const labels = owner ? T.ownerLabels : T.staffLabels;

  return (
    <div className="flex flex-col gap-6 md:gap-7">
      <PageHeader
        title={labels.page}
        actions={
          <Segmented
            label={T.period}
            value={period}
            onChange={(next) => {
              setPeriod(next);
              onPeriodChange?.();
            }}
            options={PERIODS.map((p) => ({ value: p, label: PERIOD_LABELS[p] }))}
            className="self-start sm:self-auto"
          />
        }
      >
        <p>
          {greeting(hour)}, {firstName}.{" "}
          {empty
            ? T.emptyIntro
            : T.summary(T.newCount(data.newInquiries.value), T.winCount(data.wonVolume.count), PERIOD_LABELS[period])}
        </p>
      </PageHeader>

      {empty ? (
        <EmptyOverview owner={owner} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12 xl:gap-5">
          {/* Hero: a dark island, in light and dark mode. */}
          <section aria-label={labels.pipeline} className="dark flex flex-col rounded-card bg-surface p-6 md:col-span-2 md:p-8 xl:col-span-8 xl:row-span-2">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <IconCircle icon={Wallet} tone="soft" />
                <div>
                  <h2 className="heading text-[17px]">{labels.pipeline}</h2>
                  <p className="mt-0.5 text-[13px] text-muted">{labels.pipelineNote}</p>
                </div>
              </div>
              <ValueLegend
                items={[
                  { label: T.quoted, value: euro(current.quotedValue), color: "var(--accent)" },
                  { label: T.newWord, value: euro(current.newValue), color: "var(--chart-2)" },
                ]}
              />
            </header>
            <div className="mt-6 flex flex-1 flex-col gap-6 lg:flex-row lg:items-end">
              <div className="shrink-0 lg:w-56 lg:pb-9">
                <p className="text-[13px] text-muted">{T.openAsOfToday}</p>
                <p className="figures mt-1 text-[44px] leading-none font-medium tracking-[-0.02em]">{euro(shownPipeline)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <DeltaChip delta={data.openVolume.delta} formatAmount={euroFromCents} />
                  <span className="text-xs text-muted">{T.sinceStart}</span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <PipelineBars rows={pipelineRows} formatValue={euro} height={260} />
              </div>
            </div>
            <ChartTable
              caption={T.pipelineCaption}
              head={T.pipelineHead}
              rows={pipelineRows.map((r) => [r.title, euro(r.newValue), euro(r.quotedValue), euro(r.total)])}
            />
          </section>

          <KpiCard
            className="xl:col-span-4"
            icon={Inbox}
            label={T.newInquiries}
            value={data.newInquiries.value}
            format={(v) => String(Math.round(v))}
            delta={data.newInquiries.delta}
            compare={versus}
            chart={
              <SparkBars
                points={series(data.newInquiries.series)}
                format={(v) => T.inquiryCount(v)}
                label={T.newPerSection(data.newInquiries.series.join(", "))}
              />
            }
          />
          <KpiCard
            className="xl:col-span-4"
            icon={Layers}
            label={T.openInquiries}
            value={data.openCount.value}
            format={(v) => String(Math.round(v))}
            delta={data.openCount.delta}
            compare={T.sinceStart}
            chart={
              <SparkArea
                points={series(data.openCount.series)}
                format={(v) => T.openCount(v)}
                label={T.openOverTime(data.openCount.series.join(", "))}
              />
            }
          />

          <WonCard
            className="xl:col-span-4"
            label={labels.won}
            value={data.wonVolume.value / 100}
            count={data.wonVolume.count}
            delta={data.wonVolume.delta}
            compare={versus}
            points={cumulative(data.wonVolume.series).map((cents, i) => ({ label: T.until(bucketTitle(i).replace(new RegExp(`^.* ${T.rangeWord} `), "")), value: cents / 100 }))}
          />

          <Panel className="xl:col-span-4" title={T.winRate} description={T.winRateHint} icon={Gauge} iconTone="plain">
            <WinRate winRate={data.winRate} />
          </Panel>

          <Panel
            className="md:col-span-2 xl:col-span-4 xl:row-span-2"
            title={T.upcoming}
            description={T.upcomingHint}
            icon={CalendarClock}
            iconTone="solid"
            aside={<ArrowLink href="/inquiries" label={T.allInquiries} />}
          >
            <Upcoming items={upcoming} now={now} showAssignee={owner} />
          </Panel>

          <Panel
            className="md:col-span-2 xl:col-span-8"
            title={T.perWeek}
            description={T.perWeekHint(weeksInPeriod.length === 1, weeksInPeriod.length, receivedInWeeks)}
            icon={BarChart3}
            iconTone="plain"
          >
            <WeeklyBars rows={weekRows} height={230} />
            <ChartTable caption={T.perWeek} head={T.weekHead} rows={weekRows.map((w) => [`${w.title}, ${w.subtitle}`, String(w.count)])} />
          </Panel>
        </div>
      )}
    </div>
  );
}

/** The figures behind a chart, for screen readers. */
function ChartTable({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row[0]}>
            {row.map((cell, i) =>
              i === 0 ? (
                <th key={i} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={i}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function KpiCard({
  icon,
  label,
  value,
  format,
  delta,
  compare,
  chart,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  format: (v: number) => string;
  delta: Delta;
  compare: string;
  chart: ReactNode;
  className?: string;
}) {
  const shown = useCountUp(value);
  return (
    <article
      className={cn(
        "group flex flex-col rounded-card bg-surface p-6 shadow-card transition-[box-shadow,transform] duration-300 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-lift",
        className,
      )}
    >
      <header className="flex items-center gap-3">
        <IconCircle icon={icon} className="size-10 transition-transform duration-300 ease-[var(--ease-out)] group-hover:scale-105" />
        <h2 className="text-[15px] font-medium text-fg">{label}</h2>
        <DeltaChip delta={delta} className="ml-auto" />
      </header>
      <div className="mt-4 flex items-end gap-5">
        <div className="shrink-0">
          <p className="figures text-[40px] leading-none font-medium tracking-[-0.02em]">{format(shown)}</p>
          <p className="mt-2 text-xs text-muted">{compare}</p>
        </div>
        <div className="min-w-0 flex-1">{chart}</div>
      </div>
    </article>
  );
}

/** Won volume on a card filled with the accent, the bold spot of the grid. */
function WonCard({
  label,
  value,
  count,
  delta,
  compare,
  points,
  className,
}: {
  label: string;
  value: number;
  count: number;
  delta: Delta;
  compare: string;
  points: { label: string; value: number }[];
  className?: string;
}) {
  const shown = useCountUp(value);
  return (
    <article
      aria-label={label}
      className={cn(
        "group flex flex-col rounded-card bg-primary p-6 text-on-primary shadow-card transition-[box-shadow,transform] duration-300 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-lift",
        className,
      )}
    >
      <header className="flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-white/20">
          <CircleCheckBig className="size-[18px]" aria-hidden />
        </span>
        <h2 className="text-[15px] font-medium">{label}</h2>
        <DeltaChip delta={delta} formatAmount={euroFromCents} onAccent className="ml-auto" />
      </header>
      <p className="figures mt-5 text-[40px] leading-none font-medium tracking-[-0.02em]">{euro(shown)}</p>
      <p className="mt-2 text-xs text-on-primary">
        {T.winCount(count)}, {compare}
      </p>
      <div className="-mx-1 mt-auto pt-4">
        <SparkArea points={points} format={euro} label={T.wonSpark} onAccent height={96} />
      </div>
    </article>
  );
}

function WinRate({ winRate }: { winRate: { won: number; lost: number; rate: number | null; previousRate: number | null } }) {
  const { won, lost, rate, previousRate } = winRate;
  const shownRate = useCountUp(rate === null ? 0 : Math.round(rate * 100));
  const points = rate !== null && previousRate !== null ? Math.round((rate - previousRate) * 100) : null;
  const parts = [
    { key: "won", label: T.won, value: won },
    { key: "lost", label: T.lost, value: lost },
  ];
  return (
    <div className="flex h-full flex-col gap-4">
      {/* Card in card: the gauge sits on its own soft surface. */}
      <div className="rounded-inner bg-raised px-4 pt-6 pb-5">
        <WinGauge
          parts={parts}
          label={rate === null ? T.noDecision : T.winRateLabel(Math.round(rate * 100), won, lost)}
          center={(hovered) =>
            rate === null ? (
              <span className="pb-2 text-[13px] text-muted">{T.nothingDecided}</span>
            ) : hovered ? (
              <>
                <span className="figures text-[34px] leading-none font-medium">{hovered.value}</span>
                <span className="mt-1 text-xs text-muted">{hovered.label}</span>
              </>
            ) : (
              <>
                <span className="figures text-[34px] leading-none font-medium">{T.percent(Math.round(shownRate))}</span>
                <span className="mt-1 text-xs text-muted">{won + lost} {T.decided}</span>
              </>
            )
          }
        />
      </div>
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-4 rounded-full bg-accent" aria-hidden />
          <span className="text-muted">{T.won}</span>
          <span className="figures font-semibold">{won}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-4 rounded-full border border-line-strong bg-raised" aria-hidden />
          <span className="text-muted">{T.lost}</span>
          <span className="figures font-semibold">{lost}</span>
        </span>
      </div>
      {points !== null && (
        <p className="text-xs text-muted">
          {points === 0 ? T.sameAsBefore : T.pointsVs(points > 0 ? "+" : "−", Math.abs(points))}
        </p>
      )}
    </div>
  );
}

/** Upcoming events as a timeline. Chip and avatar sit in fixed columns, so they line up. */
function Upcoming({ items, now, showAssignee }: { items: OverviewInquiry[]; now: number; showAssignee: boolean }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <IconCircle icon={CalendarClock} tone="plain" />
        <p className="mt-3 max-w-xs text-sm text-muted">{T.noUpcoming}</p>
      </div>
    );
  }
  return (
    <ol className="relative -mx-2 flex flex-col gap-1">
      <span className="absolute top-6 bottom-6 left-[19px] w-0.5 rounded-full bg-raised" aria-hidden />
      {items.map((item, index) => {
        const days = daysUntil(item.event_date!, new Date(now));
        const time = formatTimeRange(item.start_time, null);
        return (
          <li key={item.id} className="relative">
            <Link
              href={`/inquiries/${item.id}`}
              className={cn(
                "group grid items-center gap-x-3 rounded-2xl px-2 py-2.5 transition-colors duration-150 hover:bg-hover",
                showAssignee ? "grid-cols-[1.5rem_minmax(0,1fr)_5.75rem_1.5rem]" : "grid-cols-[1.5rem_minmax(0,1fr)_5.75rem]",
              )}
            >
              <span className="flex justify-center">
                <span
                  className={cn(
                    "size-3.5 rounded-full border-2 transition-transform duration-200 ease-[var(--ease-out)] group-hover:scale-125",
                    index === 0 ? "border-accent bg-accent" : "border-line-strong bg-surface",
                  )}
                  aria-hidden
                />
              </span>
              <span className="min-w-0">
                <span className="figures block text-xs font-semibold text-fg">
                  {eventDay.format(Date.parse(item.event_date!))}
                  <span className="font-normal text-muted">, {countdownLabel(days)}</span>
                </span>
                <span className="mt-0.5 block truncate text-sm text-fg">{item.title}</span>
                <span className="block truncate text-xs text-muted">
                  {[time, item.guest_count ? T.guests(item.guest_count) : null].filter(Boolean).join(", ")}
                </span>
              </span>
              <span className="flex justify-start">
                <StatusChip status={item.status} className="max-sm:hidden" />
                <StatusDot status={item.status} className="sm:hidden" />
              </span>
              {showAssignee && (item.assignee ? <Avatar name={item.assignee.full_name} size="sm" /> : <EmptyAvatar size="sm" />)}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function EmptyOverview({ owner }: { owner: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-card bg-surface px-6 py-20 text-center shadow-card">
      <IconCircle icon={Inbox} />
      <h2 className="heading mt-4 text-lg">{owner ? T.emptyOwner : T.emptyStaff}</h2>
      <p className="mt-2 max-w-md text-sm text-muted">
        {owner ? T.emptyOwnerHint : T.emptyStaffHint}
      </p>
      {owner && (
        <Link href="/team" className={buttonClasses("primary", "md", "mt-6")}>
          {T.createKey}
        </Link>
      )}
    </div>
  );
}
