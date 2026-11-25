import { INTL_LOCALE, pick } from "@/lib/i18n";

const euro = new Intl.NumberFormat(INTL_LOCALE, {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const euroExact = new Intl.NumberFormat(INTL_LOCALE, {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

const OPEN = pick({ de: "offen", en: "open" });

/** Formats integer cents as euros. Whole amounts drop the cents. */
export function formatEuro(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return OPEN;
  return cents % 100 === 0 ? euro.format(cents / 100) : euroExact.format(cents / 100);
}

/** Converts a euro amount with at most two decimals to integer cents without float drift. */
export function euroToCents(euros: number): number {
  return Math.round(euros * 100);
}
