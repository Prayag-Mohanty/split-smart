/**
 * Money utilities.
 *
 * All amounts in SplitSmart are stored as integer **paise** (1 ₹ = 100 paise) so that
 * arithmetic is exact and no floating-point drift can creep into balances.
 */

export type Paise = number;

const inrFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWholeFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/**
 * Format paise as a rupee string, e.g. 123456 -> "₹1,234.56".
 * `compact` drops ".00" for whole-rupee amounts (for headline numbers): 238000 -> "₹2,380".
 */
export function formatINR(paise: Paise, opts: { sign?: boolean; symbol?: boolean; compact?: boolean } = {}): string {
  const { sign = false, symbol = true, compact = false } = opts;
  const abs = Math.abs(paise);
  const body = compact && abs % 100 === 0 ? inrWholeFormatter.format(abs / 100) : inrFormatter.format(abs / 100);
  const prefix = paise < 0 ? '−' : sign && paise > 0 ? '+' : '';
  return `${prefix}${symbol ? '₹' : ''}${body}`;
}

/** Paise -> plain decimal string without grouping, e.g. 123456 -> "1234.56" (for inputs, UPI, CSV). */
export function toDecimalString(paise: Paise): string {
  const neg = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  return `${neg ? '-' : ''}${rupees}.${p.toString().padStart(2, '0')}`;
}

/**
 * Parse a user- or OCR-supplied money string into paise.
 * Accepts "₹1,234.5", "1234", "Rs. 12.50", "-40", "(40.00)". Returns null if not a number.
 */
export function parseMoney(input: string | number | null | undefined): Paise | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : null;
  let s = input.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/₹|rs\.?|inr/gi, '').replace(/[,\s]/g, '');
  if (s.startsWith('-') || s.startsWith('−')) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') return null;
  const [whole, frac = ''] = s.split('.');
  // Round half-up on the third decimal place, if present.
  const frac2 = (frac + '00').slice(0, 2);
  let value = Number(whole || '0') * 100 + Number(frac2);
  if (frac.length > 2 && Number(frac[2]) >= 5) value += 1;
  return negative ? -value : value;
}

/** Sum a list of paise values. */
export function sum(values: readonly Paise[]): Paise {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
