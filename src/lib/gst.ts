/**
 * GST helpers. Indian bills split GST equally into CGST and SGST (e.g. 5% = 2.5% + 2.5%),
 * each computed on the pre-tax subtotal and rounded to the paisa.
 */
import type { Paise } from './money';

/** Standard GST slabs that restaurant / retail bills use. */
export const GST_RATES = [5, 12, 18, 28] as const;

/** Percentage of an amount, rounded half-up to the paisa. */
export function percentOf(base: Paise, percent: number): Paise {
  return Math.round((base * percent) / 100);
}

/** CGST + SGST lines for a total GST rate on `base` (5 → two 2.5% lines). */
export function gstLines(base: Paise, totalRate: number): { label: string; amountPaise: Paise; ratePercent: number }[] {
  const half = totalRate / 2;
  const each = percentOf(base, half);
  const pct = `${Number.isInteger(half) ? half : half.toFixed(1)}%`;
  return [
    { label: `CGST ${pct}`, amountPaise: each, ratePercent: half },
    { label: `SGST ${pct}`, amountPaise: each, ratePercent: half },
  ];
}

/**
 * If a missing amount looks like GST on `base` at a standard rate, return that rate.
 * Allows up to ₹1 of slack for round-off lines.
 */
export function guessGstRate(missing: Paise, base: Paise): number | undefined {
  if (missing <= 0 || base <= 0) return undefined;
  return GST_RATES.find((r) => Math.abs(2 * percentOf(base, r / 2) - missing) <= 100);
}
