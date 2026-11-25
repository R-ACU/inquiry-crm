"use client";

import { useCallback, useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
  useActiveTooltipCoordinate,
  useActiveTooltipLabel,
  useChartWidth,
  useIsTooltipActive,
  usePlotArea,
  useYAxisScale,
} from "recharts";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { changeAsPercent, type Delta } from "@/lib/domain/overview";
import { motionReduced } from "@/components/theme/theme-client";
import { useEntrance } from "@/components/ui/entrance";
import { cn } from "@/lib/cn";

/*
 * Charts of the overview, drawn with Recharts in one shape language: bars
 * are full pills, the remainder or the headroom is hatched (a pattern, no
 * gradient), the gauge is a thick arc with round ends. Every mark answers
 * the pointer: the hovered bar stays, the others step back, a tooltip card
 * shows the figures and glides from bar to bar. Entrances are short; with
 * reduced motion they are off.
 */

const ENTER_MS = 750;
/** The step back of the bars that are not hovered. */
const DIM = "200ms cubic-bezier(0.23, 1, 0.32, 1)";

function subscribeMotion(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", callback);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", callback);
  };
}

/**
 * True while charts may animate. Server render: no animation, so the first
 * paint is complete. A view rebuilt from the cache draws its charts at once
 * (see ui/entrance.ts).
 */
export function useChartMotion(): boolean {
  const allowed = useSyncExternalStore(subscribeMotion, () => !motionReduced(), () => false);
  const entrance = useEntrance();
  return allowed && entrance;
}

const AXIS_TICK = { fill: "var(--muted)", fontSize: 12 };

/** Diagonal hatching for "rest" and "headroom" areas. A pattern, not a gradient. */
function Hatch({ id, color = "var(--hatch)" }: { id: string; color?: string }) {
  return (
    <defs>
      <pattern id={id} patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="7" stroke={color} strokeWidth="2.2" />
      </pattern>
    </defs>
  );
}

/* ------------------------------------------------------------------ */
/* Tooltip card                                                         */
/* ------------------------------------------------------------------ */

export interface TooltipRow {
  label: string;
  value: string;
  /** CSS colour of the line key; omitted for totals */
  color?: string;
  strong?: boolean;
}

export function TooltipCard({ title, subtitle, rows }: { title: string; subtitle?: string; rows: TooltipRow[] }) {
  return (
    <div className="min-w-48 rounded-2xl bg-surface px-4 py-3.5 text-fg shadow-pop">
      <p className="text-[13px] font-medium">{title}</p>
      {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      <ul className="mt-2.5 flex flex-col gap-1.5">
        {rows.map((row) => (
          <li key={row.label} className={cn("flex items-center gap-2 text-xs", row.strong && "mt-0.5 border-t border-line pt-2")}>
            {row.color ? <span className="h-2 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden /> : <span className="w-3.5 shrink-0" aria-hidden />}
            <span className="text-muted">{row.label}</span>
            <span className="figures ml-auto pl-5 text-[13px] font-semibold">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hover card for the bar charts                                        */
/* ------------------------------------------------------------------ */

/** Where the active bar is, in chart pixels. */
export interface BarHover {
  index: number;
  /** centre of the active bar */
  x: number;
  /** half the drawn bar width */
  half: number;
  /** top of the active bar */
  top: number;
  /** bottom of the plot area */
  floor: number;
  /** width of the whole chart */
  width: number;
}

/**
 * Lives inside a bar chart and reports which bar is active and where it
 * stands. Recharts decides "active" for the pointer, touch and the keyboard
 * alike, so all three get the same card. Renders nothing.
 */
function BarHoverProbe<Row extends { label: string }>({
  rows,
  value,
  maxBarSize,
  categoryGap,
  minPointSize,
  onChange,
}: {
  rows: Row[];
  value: (row: Row) => number;
  maxBarSize: number;
  /** barCategoryGap as a fraction of the band */
  categoryGap: number;
  minPointSize: number;
  onChange: (hover: BarHover | null) => void;
}) {
  const active = useIsTooltipActive();
  const label = useActiveTooltipLabel();
  const coordinate = useActiveTooltipCoordinate();
  const plot = usePlotArea();
  const width = useChartWidth();
  const yScale = useYAxisScale();

  const index = active ? rows.findIndex((r) => r.label === label) : -1;
  const row = index >= 0 ? rows[index] : undefined;
  const x = coordinate?.x;
  const floor = plot ? plot.y + plot.height : undefined;
  const half = plot && rows.length > 0 ? Math.min(maxBarSize, (plot.width / rows.length) * (1 - categoryGap)) / 2 : 0;
  const scaled = row && yScale ? yScale(value(row)) : undefined;
  const top = scaled !== undefined && floor !== undefined ? Math.min(scaled, floor - minPointSize) : undefined;

  useEffect(() => {
    onChange(
      index >= 0 && x !== undefined && top !== undefined && floor !== undefined && width
        ? { index, x, half, top, floor, width }
        : null,
    );
  }, [index, x, half, top, floor, width, onChange]);

  return null;
}

/** Measures an element with a ResizeObserver; starts from an estimate. */
function useMeasuredSize(estimate: { width: number; height: number }) {
  const [size, setSize] = useState(estimate);
  const ref = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize[0];
      const next = { width: Math.round(box.inlineSize), height: Math.round(box.blockSize) };
      setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [size, ref] as const;
}

const GLIDE = { type: "spring", visualDuration: 0.22, bounce: 0 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const CARD_GAP = 12;

/**
 * The tooltip card of a bar chart. It sits beside the active bar, level
 * with its top, and glides to the next bar instead of jumping. It appears
 * where it is needed (no slide in from elsewhere) and fades out when the
 * pointer leaves. When the card has to change sides near the edge, it
 * cross-fades instead of sweeping over the bars. Where neither side has
 * room (a phone), it sits above the bar. Reduced motion keeps only the fades.
 */
function BarHoverCard({ hover, estimate, children }: { hover: BarHover | null; estimate: { width: number; height: number }; children: ReactNode }) {
  const [size, measure] = useMeasuredSize(estimate);

  let place: { side: "left" | "right" | "above"; x: number; y: number } | null = null;
  if (hover) {
    const right = hover.x + hover.half + CARD_GAP;
    const left = hover.x - hover.half - CARD_GAP - size.width;
    // Beside the bar, level with its top, but never below the plot.
    const level = Math.max(0, Math.min(hover.top - 4, hover.floor - size.height));
    if (right + size.width <= hover.width + 8) place = { side: "right", x: right, y: level };
    else if (left >= -8) place = { side: "left", x: left, y: level };
    // Too narrow for either side (a phone): above the bar, where a finger does not cover it.
    else
      place = {
        side: "above",
        x: Math.max(-8, Math.min(hover.x - size.width / 2, hover.width + 8 - size.width)),
        y: hover.top - CARD_GAP - size.height,
      };
  }

  return (
    <AnimatePresence>
      {place && (
        <motion.div
          key={place.side}
          className="pointer-events-none absolute top-0 left-0 z-20"
          style={{ transformOrigin: place.side === "right" ? "0% 0%" : place.side === "left" ? "100% 0%" : "50% 100%" }}
          initial={{ opacity: 0, scale: 0.97, x: place.x, y: place.y }}
          animate={{ opacity: 1, scale: 1, x: place.x, y: place.y }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12, ease: EASE_OUT } }}
          transition={{ x: GLIDE, y: GLIDE, opacity: { duration: 0.14, ease: EASE_OUT }, scale: { duration: 0.18, ease: EASE_OUT } }}
        >
          <div ref={measure}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Change chip                                                          */
/* ------------------------------------------------------------------ */

const percent = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0, signDisplay: "exceptZero" });
const count = new Intl.NumberFormat("de-DE");

/**
 * Up is green, down is a quiet grey: red stays reserved for errors. Counts
 * show the difference; amounts show a percentage only on a sound base
 * (see changeAsPercent), otherwise the amount.
 */
export function DeltaChip({
  delta,
  formatAmount,
  onAccent = false,
  className,
}: {
  delta: Delta;
  /** Formats the absolute change; without it the change is a plain count. */
  formatAmount?: (change: number) => string;
  /** On a card filled with the accent: a translucent white chip. */
  onAccent?: boolean;
  className?: string;
}) {
  const { change, ratio } = delta;
  const dir = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const sign = change > 0 ? "+" : "−";
  const text =
    dir === "flat"
      ? "±0"
      : formatAmount && changeAsPercent(delta)
        ? `${percent.format(ratio! * 100)} %`
        : `${sign}${formatAmount ? formatAmount(Math.abs(change)) : count.format(Math.abs(change))}`;
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : ArrowRight;
  return (
    <span
      className={cn(
        "figures inline-flex h-7 items-center gap-0.5 rounded-full pr-2.5 pl-2 text-xs font-semibold whitespace-nowrap",
        onAccent && "bg-black/20 text-on-primary",
        className,
      )}
      style={onAccent ? undefined : { backgroundColor: `var(--delta-${dir}-bg)`, color: `var(--delta-${dir}-fg)` }}
    >
      <Icon className="size-3.5" strokeWidth={2.25} aria-hidden />
      {text}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Sparklines (KPI cards)                                               */
/* ------------------------------------------------------------------ */

export interface SparkPoint {
  label: string;
  value: number;
}

function SparkTooltip({ format, onAccent }: { format: (v: number) => string; onAccent?: boolean }) {
  return (
    <Tooltip
      cursor={onAccent ? { stroke: "rgb(255 255 255 / 0.5)", strokeWidth: 1 } : false}
      isAnimationActive={false}
      wrapperStyle={{ outline: "none", zIndex: 20 }}
      allowEscapeViewBox={{ x: true, y: true }}
      offset={14}
      position={{ y: -52 }}
      content={({ active, payload }) => {
        const point = active && payload?.[0] ? (payload[0].payload as SparkPoint) : null;
        if (!point) return null;
        return (
          <div className="rounded-xl bg-surface px-3 py-2 text-fg shadow-pop">
            <p className="text-[11px] text-muted">{point.label}</p>
            <p className="figures text-[13px] font-semibold">{format(point.value)}</p>
          </div>
        );
      }}
    />
  );
}

/** Small pill bars; the latest bar and the hovered one in the accent. */
export function SparkBars({ points, format, label }: { points: SparkPoint[]; format: (v: number) => string; label: string }) {
  const animate = useChartMotion();
  const [active, setActive] = useState<number | null>(null);
  const last = points.length - 1;
  return (
    <div role="img" aria-label={label} className="h-14">
      <BarChart
        responsive
        style={{ width: "100%", height: "100%" }}
        data={points}
        margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
        barCategoryGap="18%"
        accessibilityLayer={false}
        onMouseMove={(state) => setActive(state.isTooltipActive ? Number(state.activeTooltipIndex) : null)}
        onMouseLeave={() => setActive(null)}
      >
        <YAxis hide domain={[0, (max: number) => Math.max(1, max)]} />
        <SparkTooltip format={format} />
        <Bar dataKey="value" radius={999} minPointSize={6} isAnimationActive={animate} animationDuration={ENTER_MS} animationEasing="ease-out">
          {points.map((p, i) => (
            <Cell
              key={p.label}
              fill={i === active || (active === null && i === last) ? "var(--accent)" : "var(--chart-track)"}
              style={{ transition: "fill 160ms ease-out" }}
            />
          ))}
        </Bar>
      </BarChart>
    </div>
  );
}

/** A soft line with a flat, translucent area. On an accent card it is drawn in white. */
export function SparkArea({
  points,
  format,
  label,
  onAccent = false,
  height = 56,
}: {
  points: SparkPoint[];
  format: (v: number) => string;
  label: string;
  onAccent?: boolean;
  height?: number;
}) {
  const animate = useChartMotion();
  const stroke = onAccent ? "#ffffff" : "var(--accent)";
  return (
    <div role="img" aria-label={label} style={{ height }}>
      <AreaChart responsive style={{ width: "100%", height: "100%" }} data={points} margin={{ top: 6, right: 6, bottom: 4, left: 6 }} accessibilityLayer={false}>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <SparkTooltip format={format} onAccent={onAccent} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={2.5}
          fill={stroke}
          fillOpacity={onAccent ? 0.16 : 0.1}
          isAnimationActive={animate}
          animationDuration={ENTER_MS}
          animationEasing="ease-out"
          dot={false}
          activeDot={{ r: 5.5, fill: stroke, stroke: onAccent ? "var(--primary)" : "var(--surface)", strokeWidth: 3 }}
        />
      </AreaChart>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero: pipeline value as pill bars                                    */
/* ------------------------------------------------------------------ */

export interface PipelineRow {
  label: string;
  title: string;
  total: number;
  newValue: number;
  quotedValue: number;
  newCount: number;
  quotedCount: number;
}

/**
 * One pill per period end: the whole pill is the pipeline (Neu plus
 * Angebot), the accent pill inside it from the bottom is the part already
 * quoted. The hatched column above shows the headroom to the period's peak.
 */
export function PipelineBars({ rows, formatValue, height = 250 }: { rows: PipelineRow[]; formatValue: (v: number) => string; height?: number }) {
  const animate = useChartMotion();
  const hatchId = `hatch-${useId().replace(/:/g, "")}`;
  const [hover, setHover] = useState<BarHover | null>(null);
  const active = hover?.index ?? null;
  const row = active !== null ? rows[active] : undefined;
  const barSize = rows.length <= 7 ? 46 : rows.length <= 10 ? 38 : 28;
  return (
    <div className="relative" style={{ height }}>
      <BarChart responsive style={{ width: "100%", height: "100%" }} data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
        <Hatch id={hatchId} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} tickMargin={12} interval="preserveStartEnd" minTickGap={12} />
        <YAxis hide domain={[0, (max: number) => Math.max(1, max)]} />
        {/* Recharts tracks the active bar; the card itself is BarHoverCard below. */}
        <Tooltip cursor={false} content={() => null} />
        <BarHoverProbe rows={rows} value={(r) => r.total} maxBarSize={barSize} categoryGap={0.22} minPointSize={14} onChange={setHover} />
        <Bar
          dataKey="total"
          name="Pipeline-Wert"
          maxBarSize={barSize}
          minPointSize={14}
          background={{ fill: `url(#${hatchId})`, radius: 999 }}
          isAnimationActive={animate}
          animationDuration={ENTER_MS}
          animationEasing="ease-out"
          shape={(props: unknown) => <PillPair {...(props as PillPairProps)} active={active} />}
        />
      </BarChart>
      <BarHoverCard hover={hover} estimate={{ width: 216, height: 128 }}>
        {row && (
          <TooltipCard
            title={row.title}
            rows={[
              { label: `Neu (${row.newCount})`, value: formatValue(row.newValue), color: "var(--chart-2)" },
              { label: `Angebot (${row.quotedCount})`, value: formatValue(row.quotedValue), color: "var(--accent)" },
              { label: "Pipeline-Wert", value: formatValue(row.total), strong: true },
            ]}
          />
        )}
      </BarHoverCard>
    </div>
  );
}

interface PillPairProps {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  payload: PipelineRow;
  active: number | null;
}

/** One pipeline pill: the whole pill is Neu plus Angebot, the accent pill from the bottom is Angebot. */
function PillPair({ x, y, width, height, index, payload, active }: PillPairProps) {
  if (!(width > 0) || !(height > 0)) return null;
  const quoted = payload.total > 0 ? Math.max(payload.quotedValue > 0 ? width : 0, (height * payload.quotedValue) / payload.total) : 0;
  const r = width / 2;
  return (
    <g style={{ opacity: active === null || active === index ? 1 : 0.4, transition: `opacity ${DIM}` }}>
      <rect x={x} y={y} width={width} height={height} rx={Math.min(r, height / 2)} fill="var(--chart-2)" />
      {quoted > 0 && <rect x={x} y={y + height - quoted} width={width} height={quoted} rx={Math.min(r, quoted / 2)} fill="var(--accent)" />}
    </g>
  );
}

/** Legend with the current value of each series. The swatch is a small pill, like the marks. */
export function ValueLegend({ items }: { items: { label: string; value: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-[13px]">
          <span className="h-2.5 w-4 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
          <span className="text-muted">{item.label}</span>
          <span className="figures font-semibold text-fg">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Inquiries per week                                                   */
/* ------------------------------------------------------------------ */

export interface WeekRow {
  label: string;
  title: string;
  subtitle: string;
  count: number;
  inPeriod: boolean;
}

export function WeeklyBars({ rows, height = 240 }: { rows: WeekRow[]; height?: number }) {
  const animate = useChartMotion();
  const [hover, setHover] = useState<BarHover | null>(null);
  const active = hover?.index ?? null;
  const row = active !== null ? rows[active] : undefined;
  return (
    <div className="relative" style={{ height }}>
      <BarChart responsive style={{ width: "100%", height: "100%" }} data={rows} margin={{ top: 22, right: 0, bottom: 0, left: 0 }} barCategoryGap="24%">
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} tickMargin={12} interval="preserveStartEnd" minTickGap={8} />
        <YAxis hide allowDecimals={false} domain={[0, (max: number) => Math.max(1, max)]} />
        <Tooltip cursor={false} content={() => null} />
        <BarHoverProbe rows={rows} value={(r) => r.count} maxBarSize={40} categoryGap={0.24} minPointSize={8} onChange={setHover} />
        <Bar
          dataKey="count"
          radius={999}
          maxBarSize={40}
          minPointSize={8}
          background={{ fill: "var(--raised)", radius: 999 }}
          isAnimationActive={animate}
          animationDuration={ENTER_MS}
          animationEasing="ease-out"
        >
          {rows.map((row, i) => (
            <Cell
              key={row.label}
              fill={row.inPeriod ? "var(--accent)" : "var(--chart-2)"}
              fillOpacity={active === null || active === i ? 1 : 0.4}
              style={{ transition: `fill-opacity ${DIM}` }}
            />
          ))}
        </Bar>
      </BarChart>
      <BarHoverCard hover={hover} estimate={{ width: 200, height: 92 }}>
        {row && (
          <TooltipCard
            title={row.title}
            subtitle={row.subtitle}
            rows={[{ label: "Anfragen", value: String(row.count), color: row.inPeriod ? "var(--accent)" : "var(--chart-2)" }]}
          />
        )}
      </BarHoverCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Win rate gauge                                                       */
/* ------------------------------------------------------------------ */

export interface GaugePart {
  key: string;
  label: string;
  value: number;
}

/**
 * A thick half ring with round ends: won in the accent, lost hatched.
 * Hovering a part shows its count in the middle.
 */
export function WinGauge({ parts, center, label }: { parts: GaugePart[]; center: (hovered: GaugePart | null) => ReactNode; label: string }) {
  const animate = useChartMotion();
  const hatchId = `hatch-${useId().replace(/:/g, "")}`;
  const [hovered, setHovered] = useState<number | null>(null);
  const total = parts.reduce((s, p) => s + p.value, 0);
  const data = total === 0 ? [{ key: "none", label: "", value: 1 }] : parts.filter((p) => p.value > 0);
  const fill = (part: { key: string }) => (part.key === "won" ? "var(--accent)" : `url(#${hatchId})`);
  return (
    <div role="img" aria-label={label} className="relative mx-auto h-[148px] w-[280px]">
      <PieChart width={280} height={148} accessibilityLayer={false}>
        <Hatch id={hatchId} color="var(--hatch)" />
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          cx={140}
          cy={140}
          innerRadius={102}
          outerRadius={138}
          startAngle={180}
          endAngle={0}
          paddingAngle={data.length > 1 ? 4 : 0}
          cornerRadius={999}
          stroke="none"
          isAnimationActive={animate}
          animationDuration={900}
          animationEasing="ease-out"
          onMouseEnter={(_, index) => total > 0 && setHovered(index)}
          onMouseLeave={() => setHovered(null)}
        >
          {data.map((part, i) => (
            <Cell
              key={part.key}
              fill={total === 0 ? `url(#${hatchId})` : fill(part)}
              fillOpacity={hovered === null || hovered === i ? 1 : 0.35}
              style={{ transition: "fill-opacity 180ms ease-out", cursor: total > 0 ? "pointer" : "default", outline: "none" }}
            />
          ))}
        </Pie>
      </PieChart>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center text-center">
        {center(hovered === null || total === 0 ? null : (data[hovered] as GaugePart))}
      </div>
    </div>
  );
}
