/**
 * Balances and debt simplification.
 *
 * APPROACH (documented in the README as well)
 * -------------------------------------------
 * 1. Every expense and settlement is reduced to one integer *net balance* per member:
 *    net = (what they paid) − (what they consumed) + (settlements sent) − (settlements received).
 *    Positive = the group owes them; negative = they owe the group. Nets always sum to zero.
 *    Who-owes-whom on individual bills no longer matters — only nets do.
 * 2. Minimum number of payments: if the non-zero members can be partitioned into k groups
 *    that each sum to zero, each group can settle internally with (size − 1) payments, so
 *    n non-zero members need n − k payments. Maximising k gives the true minimum.
 *    We find the maximum k with an exact bitmask dynamic programme (O(2^n · n)), which is
 *    instant for groups of up to 18 people with non-zero balances.
 * 3. Inside each zero-sum group we use the classic greedy: the biggest debtor pays the
 *    biggest creditor as much as possible, repeat. Each step clears at least one person,
 *    so a group of size s needs at most s − 1 payments — which is optimal.
 * For very large groups (> 18 people with non-zero balances) we fall back to the greedy on
 * the whole group, which is never more than n − 1 payments.
 */
import type { Paise } from './money';
import { expenseShares, expenseTotal } from './split';
import type { Group, MemberId } from './types';

export interface Transfer {
  fromId: MemberId;
  toId: MemberId;
  amountPaise: Paise;
}

export interface MemberStats {
  /** Total this member paid for expenses. */
  paid: Paise;
  /** Total this member consumed (their shares). */
  consumed: Paise;
  /** Net balance including settlements. > 0 is owed money, < 0 owes money. */
  net: Paise;
}

/** Per-member paid / consumed / net, accounting for every expense and settlement. */
export function computeMemberStats(group: Group): Record<MemberId, MemberStats> {
  const order = group.members.map((m) => m.id);
  const stats: Record<MemberId, MemberStats> = {};
  const get = (id: MemberId) => (stats[id] ??= { paid: 0, consumed: 0, net: 0 });
  order.forEach(get);

  for (const expense of group.expenses) {
    const shares = expenseShares(expense, order);
    const shareIds = Object.keys(shares);
    if (shareIds.length === 0) continue; // invalid expense: ignore rather than corrupt balances
    const total = expenseTotal(expense);
    const payer = get(expense.payerId);
    payer.paid += total;
    payer.net += total;
    for (const id of shareIds) {
      const s = get(id);
      s.consumed += shares[id];
      s.net -= shares[id];
    }
  }
  for (const st of group.settlements) {
    get(st.fromId).net += st.amountPaise;
    get(st.toId).net -= st.amountPaise;
  }
  return stats;
}

/** Net balance per member. */
export function computeNetBalances(group: Group): Record<MemberId, Paise> {
  const stats = computeMemberStats(group);
  const out: Record<MemberId, Paise> = {};
  for (const id of Object.keys(stats)) out[id] = stats[id].net;
  return out;
}

const EXACT_LIMIT = 18;

/**
 * Minimum set of transfers that brings every balance to zero.
 * `balances` must sum to zero (it does whenever it comes from computeNetBalances).
 * Output is deterministic for a given input order.
 */
export function simplifyDebts(balances: Record<MemberId, Paise>, order?: readonly MemberId[]): Transfer[] {
  const ordered = [...new Set([...(order ?? []), ...Object.keys(balances)])];
  const ids = ordered.filter((id) => (balances[id] ?? 0) !== 0);
  const total = ids.reduce((s, id) => s + balances[id], 0);
  if (total !== 0) throw new Error(`simplifyDebts: balances must sum to zero (got ${total})`);
  if (ids.length === 0) return [];

  const groups = ids.length <= EXACT_LIMIT ? zeroSumPartition(ids.map((id) => balances[id])) : [ids.map((_, i) => i)];
  const transfers: Transfer[] = [];
  for (const g of groups) transfers.push(...greedySettle(g.map((i) => ids[i]), balances));
  return transfers;
}

/**
 * Partition indices of `values` (which sum to zero) into the maximum number of
 * zero-sum subsets. dp[mask] = max number of complete zero-sum groups that can be
 * peeled off while building `mask` one element at a time.
 */
function zeroSumPartition(values: readonly number[]): number[][] {
  const n = values.length;
  const full = (1 << n) - 1;
  const sums = new Float64Array(1 << n);
  const dp = new Int8Array(1 << n);
  for (let mask = 1; mask <= full; mask++) {
    const low = mask & -mask;
    sums[mask] = sums[mask ^ low] + values[31 - Math.clz32(low)];
    let best = 0;
    for (let rest = mask; rest; rest &= rest - 1) {
      const bit = rest & -rest;
      const v = dp[mask ^ bit];
      if (v > best) best = v;
    }
    dp[mask] = best + (sums[mask] === 0 ? 1 : 0);
  }

  // Walk back from the full set, removing one element at a time along an optimal path.
  // The zero-sum masks met on the way are nested; consecutive differences are the groups.
  const groups: number[][] = [];
  let mask = full;
  let current: number[] = [];
  while (mask) {
    const target = dp[mask] - (sums[mask] === 0 ? 1 : 0);
    let chosen = -1;
    for (let i = 0; i < n; i++) {
      const bit = 1 << i;
      if (mask & bit && dp[mask ^ bit] === target) {
        chosen = i;
        break;
      }
    }
    current.push(chosen);
    mask ^= 1 << chosen;
    if (mask === 0 || sums[mask] === 0) {
      groups.push(current.sort((a, b) => a - b));
      current = [];
    }
  }
  return groups.reverse();
}

/** Greedy settle-up within a set of members whose balances sum to zero. */
function greedySettle(ids: readonly MemberId[], balances: Record<MemberId, Paise>): Transfer[] {
  const rank = new Map(ids.map((id, i) => [id, i]));
  const creditors = ids.filter((id) => balances[id] > 0).map((id) => ({ id, amt: balances[id] }));
  const debtors = ids.filter((id) => balances[id] < 0).map((id) => ({ id, amt: -balances[id] }));
  const byAmount = (a: { id: string; amt: number }, b: { id: string; amt: number }) =>
    b.amt - a.amt || rank.get(a.id)! - rank.get(b.id)!;
  const out: Transfer[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort(byAmount);
    debtors.sort(byAmount);
    const c = creditors[0];
    const d = debtors[0];
    const amt = Math.min(c.amt, d.amt);
    out.push({ fromId: d.id, toId: c.id, amountPaise: amt });
    c.amt -= amt;
    d.amt -= amt;
    if (c.amt === 0) creditors.shift();
    if (d.amt === 0) debtors.shift();
  }
  return out;
}

/** Suggested payments for a whole group. */
export function suggestSettlements(group: Group): Transfer[] {
  return simplifyDebts(computeNetBalances(group), group.members.map((m) => m.id));
}

/** Total spent in a group (sum of all expense totals). */
export function groupSpend(group: Group): Paise {
  return group.expenses.reduce((s, e) => s + expenseTotal(e), 0);
}

/**
 * The debts as they arise, before any simplification: for every expense, each participant
 * owes the payer their share. Opposite debts between the same two people are netted, and
 * recorded settlements are subtracted. Used to show "N IOUs → M payments".
 */
export function rawDebts(group: Group): Transfer[] {
  const order = group.members.map((m) => m.id);
  const pair = new Map<string, number>(); // key "from|to" with from < to in member order; value > 0 means from owes to
  const rank = new Map(order.map((id, i) => [id, i]));
  const add = (from: MemberId, to: MemberId, amount: Paise) => {
    if (from === to || amount === 0) return;
    const [a, b, sign] = (rank.get(from) ?? 1e9) < (rank.get(to) ?? 1e9) ? [from, to, 1] : [to, from, -1];
    const key = `${a}|${b}`;
    pair.set(key, (pair.get(key) ?? 0) + sign * amount);
  };
  for (const e of group.expenses) {
    const shares = expenseShares(e, order);
    for (const [id, share] of Object.entries(shares)) add(id, e.payerId, share);
  }
  for (const s of group.settlements) add(s.toId, s.fromId, s.amountPaise); // a payment cancels debt from→to
  const out: Transfer[] = [];
  for (const [key, v] of pair) {
    const [a, b] = key.split('|');
    if (v > 0) out.push({ fromId: a, toId: b, amountPaise: v });
    else if (v < 0) out.push({ fromId: b, toId: a, amountPaise: -v });
  }
  return out;
}
