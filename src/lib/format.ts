const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Currency with cents, e.g. $1,123.61 */
export const money = (n: number): string => usd.format(n);

/** Currency, whole dollars, e.g. $1,124 */
export const money0 = (n: number): string => usd0.format(n);

/** Percentage from a 0..1 ratio, e.g. 0.7 -> "70.0%" */
export const percent = (n: number | null): string =>
  n == null ? "—" : `${(n * 100).toFixed(1)}%`;

/** Trim trailing zeros from unit counts, e.g. 31.25 -> "31.25", 8 -> "8" */
export const qty = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
