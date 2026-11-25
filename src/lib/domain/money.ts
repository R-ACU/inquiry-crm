const euro = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const euroExact = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

/** Formats integer cents as euros. Whole amounts drop the cents. */
export function formatEuro(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "offen";
  return cents % 100 === 0 ? euro.format(cents / 100) : euroExact.format(cents / 100);
}

/** Converts a euro amount with at most two decimals to integer cents without float drift. */
export function euroToCents(euros: number): number {
  return Math.round(euros * 100);
}
