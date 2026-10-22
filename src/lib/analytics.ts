/**
 * Spending analytics: totals by category, by member and over time.
 * Itemized receipts are broken down per item category, with tax/charges/discounts
 * spread proportionally (same rule as the split), so category totals reconcile exactly.
 */
import type { Paise } from './money';
import { computeMemberStats } from './settle';
import { allocate, expenseTotal, signedAdjustment } from './split';
import { CATEGORIES, type Category, type Group } from './types';

export function spendByCategory(group: Group): Record<Category, Paise> {
  const out = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, Paise>;
  for (const e of group.expenses) {
    if (e.kind === 'manual' || e.items.length === 0) {
      out[e.category] += expenseTotal(e);
      continue;
    }
    const byCat = new Map<Category, Paise>();
    for (const it of e.items) byCat.set(it.category, (byCat.get(it.category) ?? 0) + it.totalPaise);
    const cats = [...byCat.keys()];
    const weights = cats.map((c) => Math.max(0, byCat.get(c)!));
    const adj = e.adjustments.reduce((s, a) => s + signedAdjustment(a), 0);
    const extra = adj && weights.some((w) => w > 0) ? allocate(adj, weights) : cats.map(() => 0);
    cats.forEach((c, i) => (out[c] += byCat.get(c)! + extra[i]));
    if (adj && !weights.some((w) => w > 0)) out[e.category] += adj;
  }
  return out;
}

export interface MemberSpend {
  memberId: string;
  paid: Paise;
  consumed: Paise;
}

export function spendByMember(group: Group): MemberSpend[] {
  const stats = computeMemberStats(group);
  return group.members.map((m) => ({ memberId: m.id, paid: stats[m.id]?.paid ?? 0, consumed: stats[m.id]?.consumed ?? 0 }));
}

/** Spending per bucket. Uses days for short ranges (≤ 45 days) and months otherwise. */
export function spendOverTime(group: Group): { label: string; key: string; total: Paise }[] {
  if (group.expenses.length === 0) return [];
  const dates = group.expenses.map((e) => e.date).sort();
  const first = new Date(dates[0]);
  const last = new Date(dates[dates.length - 1]);
  const days = (last.getTime() - first.getTime()) / 86_400_000;
  const byMonth = days > 45;
  const buckets = new Map<string, Paise>();
  for (const e of group.expenses) {
    const key = byMonth ? e.date.slice(0, 7) : e.date;
    buckets.set(key, (buckets.get(key) ?? 0) + expenseTotal(e));
  }
  // Fill gaps so the chart reads as a timeline.
  const out: { label: string; key: string; total: Paise }[] = [];
  const cursor = new Date(byMonth ? `${dates[0].slice(0, 7)}-01T00:00:00Z` : `${dates[0]}T00:00:00Z`);
  const endKey = byMonth ? dates[dates.length - 1].slice(0, 7) : dates[dates.length - 1];
  for (let guard = 0; guard < 400; guard++) {
    const iso = cursor.toISOString().slice(0, 10);
    const key = byMonth ? iso.slice(0, 7) : iso;
    const label = byMonth
      ? cursor.toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' })
      : cursor.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    out.push({ key, label, total: buckets.get(key) ?? 0 });
    if (key >= endKey) break;
    if (byMonth) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
