import type { InquiryStatus } from "./status";

export interface KpiInput {
  status: InquiryStatus;
  budget_cents: number | null;
}

export interface Kpis {
  openCount: number;
  wonCount: number;
  lostCount: number;
  /** Won divided by decided (won + lost). Null while nothing is decided. */
  winRate: number | null;
  openVolumeCents: number;
  wonVolumeCents: number;
}

/**
 * Computes the dashboard figures from the inquiries the caller can see.
 * Because the input already passed RLS, a staff member gets their own
 * figures and an owner gets the whole business.
 */
export function computeKpis(inquiries: readonly KpiInput[]): Kpis {
  let openCount = 0;
  let wonCount = 0;
  let lostCount = 0;
  let openVolumeCents = 0;
  let wonVolumeCents = 0;

  for (const inquiry of inquiries) {
    const budget = inquiry.budget_cents ?? 0;
    switch (inquiry.status) {
      case "new":
      case "quoted":
        openCount += 1;
        openVolumeCents += budget;
        break;
      case "won":
        wonCount += 1;
        wonVolumeCents += budget;
        break;
      case "lost":
        lostCount += 1;
        break;
    }
  }

  const decided = wonCount + lostCount;
  return {
    openCount,
    wonCount,
    lostCount,
    winRate: decided === 0 ? null : wonCount / decided,
    openVolumeCents,
    wonVolumeCents,
  };
}

export function formatPercent(rate: number | null): string {
  if (rate === null) return "noch keine";
  return new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0 }).format(rate);
}
