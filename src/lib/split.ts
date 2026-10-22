/**
 * Split calculations. Pure functions only — no UI or storage concerns.
 *
 * ROUNDING RULE (documented in the README as well)
 * -------------------------------------------------
 * Every split uses the *largest remainder* (Hamilton) method on integer paise:
 *   1. Each member's exact share is computed as a fraction of the total.
 *   2. Every share is rounded *down* to a whole paisa.
 *   3. The leftover paise (always fewer than the number of members) are handed out one
 *      at a time to the members with the largest discarded fractions.
 *   4. Ties are broken by member order: whoever appears first in the group's member list
 *      (or the participant list passed in) receives the extra paisa first.
 * This guarantees the shares add up to the bill total exactly, to the paisa.
 * Example: ₹100 between three people -> ₹33.34, ₹33.33, ₹33.33.
 */
import type { Paise } from './money';
import type { Adjustment, AdjustmentKind, Expense, MemberId, ReceiptItem, SplitSpec } from './types';

/**
 * Split `total` paise in proportion to non-negative `weights`, so that the parts sum to `total`.
 * Uses BigInt internally so huge totals × weights never lose precision.
 * Negative totals are supported (used for discounts): the magnitude is split, then negated.
 */
export function allocate(total: Paise, weights: readonly number[]): Paise[] {
  if (!Number.isInteger(total)) throw new Error('allocate: total must be an integer number of paise');
  if (weights.length === 0) {
    if (total === 0) return [];
    throw new Error('allocate: cannot split a non-zero amount between nobody');
  }
  if (weights.some((w) => w < 0 || !Number.isFinite(w))) throw new Error('allocate: weights must be non-negative');
  if (total < 0) return allocate(-total, weights).map((v) => (v === 0 ? 0 : -v));

  // Normalise weights to integers so the maths is exact (supports decimal shares like 1.5).
  const scale = weightScale(weights);
  const w = weights.map((x) => BigInt(Math.round(x * scale)));
  const wSum = w.reduce((a, b) => a + b, 0n);
  if (wSum === 0n) {
    if (total === 0) return weights.map(() => 0);
    throw new Error('allocate: all weights are zero');
  }

  const T = BigInt(total);
  const floors = w.map((wi) => (T * wi) / wSum);
  const remainders = w.map((wi, i) => ({ i, r: (T * wi) % wSum }));
  let leftover = Number(T - floors.reduce((a, b) => a + b, 0n));

  // Largest remainder first; stable on index so earlier members win ties.
  remainders.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  const result = floors.map(Number);
  for (let k = 0; leftover > 0; k++, leftover--) result[remainders[k % remainders.length].i] += 1;
  return result;
}

/** Smallest power of ten that turns every weight into an integer (max 1e6). */
function weightScale(weights: readonly number[]): number {
  let scale = 1;
  for (const x of weights) {
    while (scale < 1e6 && Math.abs(x * scale - Math.round(x * scale)) > 1e-9) scale *= 10;
  }
  return scale;
}

export type SplitResult =
  | { ok: true; shares: Record<MemberId, Paise> }
  | { ok: false; error: string; shares: Record<MemberId, Paise> };

/** Validate a split spec against a total without computing shares. Returns an error message or null. */
export function validateSplit(total: Paise, spec: SplitSpec): string | null {
  const { participants, values, mode } = spec;
  if (participants.length === 0) return 'Pick at least one person to split with.';
  if (total <= 0) return 'Amount must be greater than zero.';
  const vals = participants.map((id) => values[id] ?? 0);
  if (vals.some((v) => !Number.isFinite(v) || v < 0)) return 'Values cannot be negative.';
  switch (mode) {
    case 'equal':
      return null;
    case 'exact': {
      const s = vals.reduce((a, b) => a + b, 0);
      if (s !== total) {
        const diff = total - s;
        return `Exact amounts must add up to the bill — ${diff > 0 ? 'short' : 'over'} by ₹${(Math.abs(diff) / 100).toFixed(2)}.`;
      }
      return null;
    }
    case 'percent': {
      const s = vals.reduce((a, b) => a + b, 0);
      if (Math.abs(s - 100) > 1e-6) return `Percentages must total 100% (currently ${round2(s)}%).`;
      return null;
    }
    case 'shares': {
      const s = vals.reduce((a, b) => a + b, 0);
      if (s <= 0) return 'Give at least one person a share greater than zero.';
      return null;
    }
  }
}

/** Compute each participant's share of a manual expense. */
export function computeSplit(total: Paise, spec: SplitSpec): SplitResult {
  const error = validateSplit(total, spec);
  const empty: Record<MemberId, Paise> = {};
  if (error) return { ok: false, error, shares: empty };

  const { participants, values, mode } = spec;
  let parts: Paise[];
  switch (mode) {
    case 'equal':
      parts = allocate(total, participants.map(() => 1));
      break;
    case 'exact':
      parts = participants.map((id) => values[id] ?? 0);
      break;
    case 'percent':
    case 'shares':
      parts = allocate(total, participants.map((id) => values[id] ?? 0));
      break;
  }
  const shares: Record<MemberId, Paise> = {};
  participants.forEach((id, i) => (shares[id] = parts[i]));
  return { ok: true, shares };
}

/** Signed effect of an adjustment on the bill (discounts are always negative). */
export function signedAdjustment(adj: Adjustment): Paise {
  return adj.kind === 'discount' ? -Math.abs(adj.amountPaise) : adj.amountPaise;
}

export interface MemberBreakdown {
  memberId: MemberId;
  itemsPaise: Paise;
  byKind: Record<AdjustmentKind, Paise>;
  totalPaise: Paise;
}

export interface ItemizedSplitResult {
  ok: boolean;
  /** Items that nobody has been assigned to (must be fixed before saving). */
  unassigned: ReceiptItem[];
  itemsTotal: Paise;
  adjustmentsTotal: Paise;
  billTotal: Paise;
  breakdown: MemberBreakdown[];
  shares: Record<MemberId, Paise>;
  error?: string;
}

/**
 * Split an itemized receipt.
 *  1. Each item's line total is split equally between its assignees (largest remainder).
 *  2. Every tax / service charge / discount line is distributed in proportion to each
 *     member's item subtotal — *not* equally. ₹100 tax on a ₹1,000 bill => the member whose
 *     items cost ₹600 pays ₹60.
 * `memberOrder` fixes the tie-break order for rounding (normally the group's member list).
 */
export function computeItemizedSplit(
  items: readonly ReceiptItem[],
  adjustments: readonly Adjustment[],
  memberOrder: readonly MemberId[],
): ItemizedSplitResult {
  const order = [...memberOrder];
  const rank = new Map(order.map((id, i) => [id, i]));
  // Members referenced by items but missing from the order go last, deterministically.
  for (const it of items) for (const a of it.assignees) if (!rank.has(a)) rank.set(a, order.push(a) - 1);

  const itemsBy = new Map<MemberId, Paise>(order.map((id) => [id, 0]));
  const unassigned: ReceiptItem[] = [];
  let itemsTotal = 0;
  for (const item of items) {
    itemsTotal += item.totalPaise;
    const assignees = [...new Set(item.assignees)].sort((a, b) => rank.get(a)! - rank.get(b)!);
    if (assignees.length === 0) {
      if (item.totalPaise !== 0) unassigned.push(item);
      continue;
    }
    allocate(item.totalPaise, assignees.map(() => 1)).forEach((p, i) =>
      itemsBy.set(assignees[i], (itemsBy.get(assignees[i]) ?? 0) + p),
    );
  }

  const involved = order.filter((id) => (itemsBy.get(id) ?? 0) !== 0);
  const byKind = new Map<MemberId, Record<AdjustmentKind, Paise>>(
    order.map((id) => [id, { tax: 0, service: 0, discount: 0, other: 0 }]),
  );
  let adjustmentsTotal = 0;
  let error: string | undefined;

  for (const adj of adjustments) {
    const amount = signedAdjustment(adj);
    adjustmentsTotal += amount;
    if (amount === 0) continue;
    if (involved.length === 0) {
      error = 'Assign at least one item before tax and charges can be split.';
      continue;
    }
    // Weights are item subtotals; clamp at zero in case of negative "items" such as returns.
    const weights = involved.map((id) => Math.max(0, itemsBy.get(id) ?? 0));
    const parts = weights.every((w) => w === 0) ? allocate(amount, involved.map(() => 1)) : allocate(amount, weights);
    parts.forEach((p, i) => (byKind.get(involved[i])![adj.kind] += p));
  }

  const breakdown: MemberBreakdown[] = order
    .map((memberId) => {
      const kinds = byKind.get(memberId)!;
      const itemsPaise = itemsBy.get(memberId) ?? 0;
      const totalPaise = itemsPaise + kinds.tax + kinds.service + kinds.discount + kinds.other;
      return { memberId, itemsPaise, byKind: kinds, totalPaise };
    })
    .filter((b) => b.itemsPaise !== 0 || b.totalPaise !== 0);

  const shares: Record<MemberId, Paise> = {};
  for (const b of breakdown) shares[b.memberId] = b.totalPaise;

  if (!error && unassigned.length > 0) {
    error = `${unassigned.length} item${unassigned.length > 1 ? 's are' : ' is'} not assigned to anyone.`;
  }
  if (!error && items.length === 0) error = 'Add at least one item.';
  const billTotal = itemsTotal + adjustmentsTotal;
  if (!error && billTotal <= 0) error = 'The bill total must be greater than zero.';

  return { ok: !error, unassigned, itemsTotal, adjustmentsTotal, billTotal, breakdown, shares, error };
}

/** Grand total of an expense in paise. */
export function expenseTotal(expense: Expense): Paise {
  if (expense.kind === 'manual') return expense.totalPaise;
  return (
    expense.items.reduce((s, i) => s + i.totalPaise, 0) +
    expense.adjustments.reduce((s, a) => s + signedAdjustment(a), 0)
  );
}

/** Per-member shares of any expense. Invalid expenses yield an empty record. */
export function expenseShares(expense: Expense, memberOrder: readonly MemberId[]): Record<MemberId, Paise> {
  if (expense.kind === 'manual') return computeSplit(expense.totalPaise, expense.split).shares;
  return computeItemizedSplit(expense.items, expense.adjustments, memberOrder).shares;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
