/**
 * Receipt parser: turns noisy OCR lines into structured line items, charges and totals.
 *
 * Strategy (heuristic, tuned on Indian restaurant / canteen / grocery bills):
 *  - Prices sit at the end of a line, so we peel numeric tokens off the right-hand side.
 *  - Each line is classified by keywords, in priority order:
 *      noise (GSTIN, phone, invoice no, cash/tender…) → subtotal → total → round-off →
 *      discount → service charge → tax (CGST/SGST/IGST/VAT/cess) → other charge → item.
 *  - Items are only accepted *before* the summary block (subtotal / tax / total) starts,
 *    so tendered cash, change and footer text after the total are ignored.
 *  - Quantity and unit price are recovered from "qty rate amount", "qty amount",
 *    "2 x Item" and "Item x2" layouts; otherwise qty = 1.
 *  - Each field carries the OCR confidence of the words it came from, so the UI can
 *    highlight anything the user should double-check.
 */
import type { Paise } from './money';
import { parseMoney } from './money';
import type { AdjustmentKind } from './types';

export interface OcrWord {
  text: string;
  /** 0–100 as reported by Tesseract. */
  confidence: number;
  /** Pixel box in the processed image (used to outline low-confidence words). */
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrLine {
  text: string;
  confidence: number;
  words: OcrWord[];
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

export interface FieldConfidence {
  name: number;
  qty: number;
  price: number;
}

export interface ParsedItem {
  name: string;
  qty: number;
  unitPaise: Paise;
  totalPaise: Paise;
  confidence: FieldConfidence;
  raw: string;
  /** Index of the OCR line this came from (lets the UI point at it on the image). */
  line: number;
}

export interface ParsedAdjustment {
  label: string;
  kind: AdjustmentKind;
  amountPaise: Paise;
  confidence: number;
  raw: string;
  line: number;
  /** Set when only the rate was readable, so the amount was calculated from it. */
  ratePercent?: number;
}

export interface ParsedReceipt {
  merchant?: string;
  date?: string;
  items: ParsedItem[];
  adjustments: ParsedAdjustment[];
  subtotalPaise?: Paise;
  totalPaise?: Paise;
  totalConfidence?: number;
  /** Lines that were recognised as noise and dropped. */
  ignored: string[];
}

/** Words below this confidence are highlighted for review. */
export const LOW_CONFIDENCE = 70;

const MAX_LINE_AMOUNT = 10_00_000_00; // ₹10 lakh — anything above on a single line is almost certainly noise

const NOISE =
  /gstin|gst\s*(no|number|reg|in\b|#)|fssai|\bhsn\b|\bsac\b|\bcin\b|\bpan\b|phone|\bph\b|\bmob|\btel\b|contact|whats?app|invoice|bill\s*(no|#|num)|receipt\s*(no|#)|\bkot\b|token|order\s*(no|id|#|type)|table|\bpax\b|guests?|date|time|cashier|server|steward|waiter|captain|operator|thank|visit|again|www|http|\.com|e-?mail|[\w.]+@[\w-]+\.\w|address|road|\bst\.|street|nagar|pin\s*code|\bpin\b|near\b|opp\b|\btxn|\bref\b|\bcard|\bcash\b|\bupi\b|paytm|gpay|phonepe|change\b|tender|received|balance|total\s*(items?|qty|quantity)|no\.?\s*of\s*items|\bitems?\W*\d+\W*qty|\bitems?\s*:|e\.?\s*&\s*o\.?\s*e|subject\s*to|jurisdiction|powered\s*by|customer|\bname\s*:|\bmode\b|counter/i;
const SUBTOTAL = /sub\s*-?\s*tot|item\s*tot|food\s*tot|gross\s*(amount|amt|total)|total\s*before|taxable\s*(amount|amt|value)|basic\s*amount/i;
const TOTAL_STRONG =
  /grand\s*-?\s*tot|net\s*(amt|amount|payable|total|bill|pay)|amount\s*(payable|due)|total\s*(payable|due)|to\s*pay|payable|bill\s*(amount|amt|total)/i;
const TOTAL_WEAK = /\btot(al)?\b|\btotal|amount\s*$/i;
const ROUND = /round|r\s*\/\s*off|\brnd\b|\bro\b/i;
const DISCOUNT = /disc|discount|\bless\b|offer|coupon|promo|saving|cashback|deduction/i;
const SERVICE = /service\s*(charge|chg|chrg|ch)|\bsvc\b|\bs\.?\s*c(hg)?\.?\b|serv\.?\s*ch|service$/i;
const TAX = /c\.?\s*g\.?\s*s\.?\s*t|s\.?\s*g\.?\s*s\.?\s*t|i\.?\s*g\.?\s*s\.?\s*t|ut\s*gst|\bgst\b|\bvat\b|\btax(es)?\b|\bcess\b|service\s*tax/i;
const OTHER_CHARGE = /packing|packaging|parcel|delivery|container|convenience|platform\s*fee|handling|\btip\b|surcharge|\bcharges?\b/i;
const HEADER = /^(s\.?\s*no|sl\.?\s*no|sr\.?\s*no|item|items|description|particulars|product|qty|quantity|rate|price|amount|amt|mrp|value|\W)+$/i;

const NUMERIC_LIKE = /^[(\-−]?(?:rs\.?|₹|inr)?[\dOoSlIB.,]*\d[\dOoSlIB.,]*\)?(?:\/-)?$/i;
const PERCENT = /^@?\(?\d+(?:[.,]\d+)?\s*%\)?$/;

interface Token {
  text: string;
  confidence: number;
}

/** Turn plain text into OcrLines (used for tests and for re-parsing edited raw text). */
export function linesFromText(text: string, confidence = 95): OcrLine[] {
  return text
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({
      text: t,
      confidence,
      words: t.split(/\s+/).map((w) => ({ text: w, confidence })),
    }));
}

/** Fix common OCR confusions inside a token that is clearly meant to be a number. */
export function normaliseNumberToken(raw: string): string {
  let t = raw.replace(/^(rs\.?|₹|inr)/i, '').replace(/\/-$/, '');
  t = t.replace(/[Oo]/g, '0').replace(/[lI]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
  // "80,00" (decimal comma) -> "80.00"; "1,250.00" keeps grouping commas.
  if (/^\(?-?\d+,\d{2}\)?$/.test(t)) t = t.replace(',', '.');
  // Thermal printers sometimes print "80.0O" or "80 .00" — collapse stray dots.
  t = t.replace(/\.(?=.*\.)/g, '');
  return t;
}

function parseAmountToken(tok: string): Paise | null {
  if (!NUMERIC_LIKE.test(tok)) return null;
  // Only letters that OCR commonly confuses with digits (O, l, I, S, B) may appear.
  const letters = tok.replace(/^\(?-?(rs\.?|inr)/i, '').replace(/[^A-Za-z]/g, '');
  if (/[^OoSlIB]/.test(letters)) return null;
  const value = parseMoney(normaliseNumberToken(tok));
  if (value === null) return null;
  return value;
}

function tokensOf(line: OcrLine): Token[] {
  // Prefer Tesseract's own word split (with confidences); fall back to whitespace split.
  const words = line.words.length ? line.words : line.text.split(/\s+/).map((w) => ({ text: w, confidence: line.confidence }));
  const out: Token[] = [];
  for (const w of words) {
    for (const part of w.text.split(/\s+/)) {
      const text = part.replace(/^[|:*_~'"`]+|[|:*_~'"`]+$/g, '');
      if (text) out.push({ text, confidence: w.confidence });
    }
  }
  return out;
}

interface SplitLine {
  labelTokens: Token[];
  amounts: { value: Paise; isInteger: boolean; token: Token }[];
  percentTokens: Token[];
}

/** Peel numeric tokens off the right of a line (up to three: qty, rate, amount). */
function splitLine(tokens: Token[]): SplitLine {
  const amounts: SplitLine['amounts'] = [];
  const percentTokens: Token[] = [];
  let end = tokens.length;
  while (end > 0) {
    const tok = tokens[end - 1];
    const t = tok.text;
    // Currency marks, separators and OCR specks ("©", "|", "\\") between or after the numbers.
    if (/^(₹|rs\.?|inr|x|\/-)$/i.test(t) || /^[^A-Za-z0-9₹]+$/.test(t)) {
      end--;
      continue;
    }
    if (PERCENT.test(t)) {
      percentTokens.unshift(tok);
      end--;
      continue;
    }
    if (amounts.length >= 3) break;
    const v = parseAmountToken(t);
    if (v === null) break;
    amounts.unshift({ value: v, isInteger: !/[.,]\d{1,2}\)?$/.test(normaliseNumberToken(t)), token: tok });
    end--;
  }
  return { labelTokens: tokens.slice(0, end), amounts, percentTokens };
}

function cleanName(tokens: Token[]): string {
  return tokens
    .map((t) => t.text)
    .join(' ')
    .replace(/^\s*(\d{1,3}[.)\]]|#\d+)\s*/, '') // leading serial number "1." / "2)"
    .replace(/[|_*~]+/g, ' ')
    .replace(/\s*[-:.,@]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const minConf = (tokens: Token[], fallback = 100) => (tokens.length ? Math.round(Math.min(...tokens.map((t) => t.confidence))) : fallback);

const DATE_RE = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/;

function detectDate(text: string): string | undefined {
  const m = DATE_RE.exec(text);
  if (!m) return undefined;
  const [, d, mo, yy] = m;
  const y = yy.length === 2 ? `20${yy}` : yy;
  const dd = Number(d);
  const mm = Number(mo);
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return undefined;
  return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

type Kind = 'noise' | 'subtotal' | 'total' | 'taxSummary' | AdjustmentKind | 'item' | 'header';

/**
 * Undo common OCR letter/digit swaps inside words so keywords still match:
 * "6ST" → "gst", "C6ST" → "cgst", "SG5T" → "sgst", "T0TAL" → "total".
 */
export function normaliseLabel(label: string): string {
  return label
    .toLowerCase()
    .split(/\s+/)
    .map((w) =>
      /[a-z]/.test(w) && /[0-9]/.test(w) && !/^\d+[.,]?\d*%?$/.test(w) ? w.replace(/6/g, 'g').replace(/5/g, 's').replace(/0/g, 'o').replace(/1/g, 'l') : w,
    )
    .join(' ');
}

function classify(label: string): { kind: Kind; strength?: number } {
  const l = normaliseLabel(label);
  if (HEADER.test(l.replace(/\s+/g, ' ').trim()) && /[a-z]/.test(l)) return { kind: 'header' };
  if (SUBTOTAL.test(l)) return { kind: 'subtotal' };
  if (/tot(al)?\s*(gst|tax|taxes)\b/i.test(l)) return { kind: 'taxSummary' };
  if (TOTAL_STRONG.test(l)) return { kind: 'total', strength: 3 };
  if (NOISE.test(l)) return { kind: 'noise' };
  if (ROUND.test(l)) return { kind: 'other' };
  if (DISCOUNT.test(l)) return { kind: 'discount' };
  if (SERVICE.test(l) && !/service\s*tax/i.test(l)) return { kind: 'service' };
  if (TAX.test(l)) return { kind: 'tax' };
  if (TOTAL_WEAK.test(l)) return { kind: 'total', strength: 2 };
  if (OTHER_CHARGE.test(l)) return { kind: 'other' };
  return { kind: 'item' };
}

/** A stray whole number next to a name (e.g. "Chicken 65") — not a zero or a price with paise. */
const isNameNumber = (a: { value: number; isInteger: boolean }) => a.isInteger && a.value > 0;

/** Recover qty / unit / total from the trailing numbers and the label. */
function itemFromLine(label: Token[], amounts: SplitLine['amounts']): (Omit<ParsedItem, 'raw' | 'name' | 'line'> & { nameTokens: Token[] }) | null {
  let nameTokens = [...label];
  const hasQtyColumn = amounts.length >= 2;
  const last = amounts[amounts.length - 1];
  const totalPaise = last.value;
  let qty = 1;
  let qtyConf = 100;
  let unitPaise = totalPaise;
  let priceConf = last.token.confidence;

  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(100, Math.abs(b) * 0.01);
  const isQty = (a: { value: number; isInteger: boolean }) => a.isInteger && a.value > 0 && a.value <= 100 * 100 && a.value % 100 === 0;

  if (amounts.length >= 3) {
    const [q, r] = amounts.slice(-3);
    if (isQty(q) && near((q.value / 100) * r.value, totalPaise)) {
      qty = q.value / 100;
      unitPaise = r.value;
      qtyConf = q.token.confidence;
      priceConf = Math.min(priceConf, r.token.confidence);
    } else {
      // Unknown leading numbers: whole numbers may be part of the name ("Chicken 65"),
      // stray prices or zeros are OCR debris and are dropped.
      nameTokens = [
        ...nameTokens,
        ...amounts
          .slice(0, -2)
          .filter(isNameNumber)
          .map((a) => a.token),
      ];
      amounts = amounts.slice(-2);
    }
  }
  if (amounts.length === 2 && qty === 1) {
    const [a] = amounts;
    const ratio = totalPaise / a.value;
    if (!a.isInteger && a.value > 0 && Number.isInteger(Math.round(ratio * 1000) / 1000) && ratio >= 1 && ratio <= 100) {
      // "rate amount" with the quantity omitted.
      qty = Math.round(ratio);
      unitPaise = a.value;
      priceConf = Math.min(priceConf, a.token.confidence);
    } else if (isQty(a) && a.value / 100 <= 50) {
      qty = a.value / 100;
      unitPaise = Math.round(totalPaise / qty);
      qtyConf = a.token.confidence;
    } else if (isNameNumber(a)) {
      nameTokens = [...nameTokens, a.token];
    }
  }

  // Leading or trailing quantity in the name: "2 x Maggi", "2x Maggi", "Maggi x2", "Maggi (2)".
  if (qty === 1 && nameTokens.length > 1) {
    const first = nameTokens[0].text;
    const second = nameTokens[1]?.text ?? '';
    const lastTok = nameTokens[nameTokens.length - 1].text;
    let m: RegExpExecArray | null;
    if ((m = /^(\d{1,2})\s*[xX×*]$/.exec(first))) {
      qty = Number(m[1]);
      qtyConf = nameTokens[0].confidence;
      nameTokens = nameTokens.slice(1);
    } else if (/^\d{1,2}$/.test(first) && /^[xX×*]$/.test(second)) {
      qty = Number(first);
      qtyConf = nameTokens[0].confidence;
      nameTokens = nameTokens.slice(2);
    } else if ((m = /^[xX×*](\d{1,2})$/.exec(lastTok)) || (m = /^\((\d{1,2})\)$/.exec(lastTok))) {
      qty = Number(m[1]);
      qtyConf = nameTokens[nameTokens.length - 1].confidence;
      nameTokens = nameTokens.slice(0, -1);
    } else if (!hasQtyColumn && /^\d{1,2}$/.test(first) && /^[A-Za-z]/.test(second) && Number(first) > 0 && Number(first) <= 20) {
      // "2 Maggi 80" — a small leading integer before words is a quantity.
      qty = Number(first);
      qtyConf = nameTokens[0].confidence;
      nameTokens = nameTokens.slice(1);
    }
    if (qty !== 1) unitPaise = Math.round(totalPaise / qty);
  }
  // With a qty column present, a bare leading integer is a serial number ("3 Cold Coffee 1 120").
  if (hasQtyColumn && nameTokens.length > 1 && /^\d{1,3}$/.test(nameTokens[0].text)) nameTokens = nameTokens.slice(1);
  if (qty <= 0) return null;
  return {
    nameTokens,
    qty,
    unitPaise,
    totalPaise,
    confidence: { name: minConf(nameTokens), qty: Math.round(qtyConf), price: Math.round(priceConf) },
  };
}

/** Parse OCR output into a structured receipt. Never throws; worst case returns no items. */
export function parseReceipt(lines: readonly OcrLine[]): ParsedReceipt {
  const result: ParsedReceipt = { items: [], adjustments: [], ignored: [] };
  type Candidate = { index: number; amount: Paise; strength: number; confidence: number };
  const totals: Candidate[] = [];
  const subtotals: Candidate[] = [];
  const adjustments: (Omit<ParsedAdjustment, 'line'> & { index: number })[] = [];
  const items: (Omit<ParsedItem, 'line'> & { index: number })[] = [];
  const taxSummaries: (Omit<ParsedAdjustment, 'line'> & { index: number })[] = [];
  let summaryStarted = -1;
  /** Seen the column header or a priced line yet? The shop name only comes before that. */
  let bodyStarted = false;
  /**
   * A name-only line waiting for its numbers. Many printers wrap long items as
   *   BUTTER GARLIC PRAWN
   *        1   450.00   450.00
   */
  let pendingName: { tokens: Token[]; index: number; text: string } | null = null;
  const rateOnlyTaxes: { label: string; rate: number; index: number; raw: string }[] = [];

  lines.forEach((line, index) => {
    const text = line.text.trim();
    if (!text) return;
    result.date ??= detectDate(text);
    const tokens = tokensOf(line);
    const { labelTokens, amounts, percentTokens } = splitLine(tokens);
    const label = labelTokens.map((t) => t.text).join(' ');
    const letters = label.replace(/[^A-Za-z]/g, '').length;

    const pending = pendingName;
    pendingName = null;
    if (pending) result.ignored.push(pending.text);

    if (amounts.length === 0) {
      // "SGST @ 2.50%" whose amount was not read: remember the rate, compute it later.
      if (percentTokens.length > 0 && classify(label).kind === 'tax') {
        const rate = parseFloat(percentTokens[percentTokens.length - 1].text.replace(/[^\d.,]/g, '').replace(',', '.'));
        if (rate > 0 && rate <= 28) {
          rateOnlyTaxes.push({ label: cleanName([...labelTokens, ...percentTokens]), rate, index, raw: text });
          if (summaryStarted < 0) summaryStarted = index;
          return;
        }
      }
      const isHeader = HEADER.test(label) && letters > 0;
      if (isHeader) bodyStarted = true;
      const plausible = letters >= 3 && !NOISE.test(label) && !isHeader && classify(label).kind === 'item';
      if (!bodyStarted) {
        // Before the item table: maybe the shop name (only if it was read clearly).
        if (!result.merchant && plausible && line.confidence >= 60) result.merchant = cleanName(labelTokens).slice(0, 60);
        else result.ignored.push(text);
      } else if (plausible && summaryStarted < 0) {
        pendingName = { tokens: labelTokens, index, text };
      } else {
        result.ignored.push(text);
      }
      return;
    }
    bodyStarted = true;

    // Numbers-only line right after a name-only line: join them into one item.
    if (pending && letters < 2 && summaryStarted < 0) {
      result.ignored.pop();
      const digitTokens = labelTokens.filter((t) => /^\d{1,2}$/.test(t.text));
      const parsed = itemFromLine([...pending.tokens, ...digitTokens.map((t) => ({ ...t, text: `x${t.text}` }))], amounts);
      const name = parsed ? cleanName(parsed.nameTokens) : '';
      if (parsed && parsed.totalPaise > 0 && /[aeiouy]/i.test(name)) {
        const { nameTokens: _unused, ...rest } = parsed;
        void _unused;
        items.push({ ...rest, name, raw: `${pending.text} / ${text}`, index: pending.index });
      } else {
        result.ignored.push(pending.text, text);
      }
      return;
    }

    const { kind, strength = 0 } = classify(label);
    const last = amounts[amounts.length - 1];
    const amountConf = Math.round(last.token.confidence);
    const tooBig = Math.abs(last.value) > MAX_LINE_AMOUNT || (last.isInteger && last.token.text.replace(/\D/g, '').length > 6);

    if (kind === 'noise' || kind === 'header' || tooBig) {
      result.ignored.push(text);
      return;
    }
    if (kind === 'subtotal') {
      subtotals.push({ index, amount: last.value, strength: 1, confidence: amountConf });
      if (summaryStarted < 0) summaryStarted = index;
      return;
    }
    if (kind === 'total') {
      totals.push({ index, amount: last.value, strength, confidence: amountConf });
      if (summaryStarted < 0) summaryStarted = index;
      return;
    }
    if (kind === 'item') {
      if (summaryStarted >= 0 || letters < 2) {
        result.ignored.push(text);
        return;
      }
      const parsed = itemFromLine(labelTokens, amounts);
      if (!parsed || parsed.totalPaise <= 0) {
        result.ignored.push(text);
        return;
      }
      const name = cleanName(parsed.nameTokens);
      const avgConf = (parsed.confidence.name + parsed.confidence.price) / 2;
      // Reject gibberish (no vowels, e.g. OCR of a photo that is not a receipt) and near-zero confidence.
      if (name.replace(/[^A-Za-z]/g, '').length < 2 || !/[aeiouy]/i.test(name) || avgConf < 30) {
        result.ignored.push(text);
        return;
      }
      const { nameTokens: _unused, ...rest } = parsed;
      void _unused;
      items.push({ ...rest, name, raw: text, index });
      return;
    }
    // Adjustment lines (tax / service / discount / other charges / round-off).
    if (summaryStarted < 0 && kind !== 'discount' && kind !== 'other') summaryStarted = index;
    if (kind === 'taxSummary') {
      taxSummaries.push({ label: cleanName(labelTokens), kind: 'tax', amountPaise: last.value, confidence: amountConf, raw: text, index });
      return;
    }
    const labelText = cleanName([...labelTokens, ...percentTokens]) || kind;
    let amount = last.value;
    if (kind === 'discount') amount = -Math.abs(amount);
    adjustments.push({ label: labelText, kind, amountPaise: amount, confidence: amountConf, raw: text, index });
  });

  // Tax lines whose rate was read but whose amount wasn't: compute them on the subtotal
  // (or the items) and flag them as low confidence so the user checks them.
  if (rateOnlyTaxes.length > 0 && taxSummaries.length === 0 && !adjustments.some((a) => a.kind === 'tax')) {
    const base = subtotals.length ? subtotals[subtotals.length - 1].amount : items.reduce((s, i) => s + i.totalPaise, 0);
    for (const t of rateOnlyTaxes) {
      adjustments.push({
        label: `${t.label} (calculated)`,
        kind: 'tax',
        amountPaise: Math.round((base * t.rate) / 100),
        confidence: 0,
        raw: t.raw,
        index: t.index,
        ratePercent: t.rate,
      });
    }
  }

  // A "Total GST" line only counts when the individual CGST/SGST lines were not printed.
  if (!adjustments.some((a) => a.kind === 'tax')) adjustments.push(...taxSummaries);
  else result.ignored.push(...taxSummaries.map((t) => t.raw));

  // Pick the grand total: strongest keyword wins, later lines win ties (summary blocks end with it).
  const best = [...totals].sort((a, b) => b.strength - a.strength || b.index - a.index)[0];
  const itemsSum = items.reduce((s, i) => s + i.totalPaise, 0);
  let totalIndex = best ? best.index : Number.POSITIVE_INFINITY;

  if (best) {
    // Weaker "Total" lines before the grand total are really subtotals.
    for (const t of totals) if (t !== best && t.index < best.index) subtotals.push(t);
    result.totalPaise = best.amount;
    result.totalConfidence = best.confidence;
  }
  // Charges printed after the chosen total belong to the bill only if that "total" was really a subtotal.
  const after = adjustments.filter((a) => a.index > totalIndex);
  if (best && after.length > 0) {
    const nearItems = Math.abs(best.amount - itemsSum) <= 100;
    if (nearItems && best.strength < 3) {
      subtotals.push(best);
      result.totalPaise = undefined;
      result.totalConfidence = undefined;
      totalIndex = Number.POSITIVE_INFINITY;
    }
  }

  result.items = items.filter((i) => i.index < totalIndex).map(({ index, ...rest }) => ({ ...rest, line: index }));
  result.adjustments = adjustments
    .filter((a) => a.index < totalIndex)
    .sort((a, b) => a.index - b.index)
    .map(({ index, ...rest }) => ({ ...rest, line: index }));
  const sub = subtotals.sort((a, b) => b.index - a.index)[0];
  if (sub) result.subtotalPaise = sub.amount;
  return result;
}

export interface TotalCheck {
  itemsPaise: Paise;
  adjustmentsPaise: Paise;
  computedPaise: Paise;
  printedPaise?: Paise;
  /** printed − computed; positive means the parsed lines are short of the printed total. */
  differencePaise: Paise;
  matches: boolean;
}

/** Compare parsed lines with the printed total. */
export function checkTotals(itemTotals: readonly Paise[], adjustmentAmounts: readonly Paise[], printed?: Paise): TotalCheck {
  const itemsPaise = itemTotals.reduce((a, b) => a + b, 0);
  const adjustmentsPaise = adjustmentAmounts.reduce((a, b) => a + b, 0);
  const computedPaise = itemsPaise + adjustmentsPaise;
  const differencePaise = printed === undefined ? 0 : printed - computedPaise;
  return { itemsPaise, adjustmentsPaise, computedPaise, printedPaise: printed, differencePaise, matches: differencePaise === 0 };
}
