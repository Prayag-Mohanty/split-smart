import { describe, expect, it } from 'vitest';
import { computeNetBalances, rawDebts, simplifyDebts, suggestSettlements } from '../src/lib/settle';
import type { Expense, Group } from '../src/lib/types';

const apply = (balances: Record<string, number>, transfers: ReturnType<typeof simplifyDebts>) => {
  const b = { ...balances };
  for (const t of transfers) {
    b[t.fromId] += t.amountPaise;
    b[t.toId] -= t.amountPaise;
  }
  return b;
};

/** Brute-force minimum number of transfers (n − max zero-sum partition), for cross-checking. */
function bruteMin(values: number[]): number {
  const nz = values.filter((v) => v !== 0);
  const best = (vals: number[]): number => {
    if (vals.length === 0) return 0;
    // max number of zero-sum groups
    let res = 0;
    const n = vals.length;
    for (let mask = 1; mask < 1 << n; mask++) {
      if (!(mask & 1)) continue; // subset containing the first element
      let s = 0;
      const rest: number[] = [];
      for (let i = 0; i < n; i++) {
        if ((mask >> i) & 1) s += vals[i];
        else rest.push(vals[i]);
      }
      if (s === 0) res = Math.max(res, 1 + best(rest));
    }
    return res;
  };
  return nz.length - best(nz);
}

describe('simplifyDebts', () => {
  it('A owes B 200 and B owes C 200 -> A pays C 200', () => {
    // nets: A −200, B 0, C +200
    const t = simplifyDebts({ A: -20000, B: 0, C: 20000 });
    expect(t).toEqual([{ fromId: 'A', toId: 'C', amountPaise: 20000 }]);
  });

  it('finds zero-sum sub-groups that greedy would miss', () => {
    // Greedy (biggest debtor pays biggest creditor) needs 4 payments here;
    // the optimum splits into {a,c,e} {b,d} for 3.
    const balances = { a: 500, b: 400, c: -300, d: -400, e: -200 };
    const t = simplifyDebts(balances);
    expect(t.length).toBe(3);
    expect(Object.values(apply(balances, t)).every((v) => v === 0)).toBe(true);
  });

  it('matches brute force on random cases and always settles everyone', () => {
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let trial = 0; trial < 150; trial++) {
      const n = 2 + Math.floor(rand() * 7);
      const vals = Array.from({ length: n - 1 }, () => Math.floor(rand() * 9 - 4) * 100);
      vals.push(-vals.reduce((a, b) => a + b, 0));
      const balances = Object.fromEntries(vals.map((v, i) => [`m${i}`, v]));
      const t = simplifyDebts(balances);
      expect(Object.values(apply(balances, t)).every((v) => v === 0)).toBe(true);
      expect(t.every((x) => x.amountPaise > 0)).toBe(true);
      expect(t.length).toBe(bruteMin(vals));
    }
  });

  it('throws when balances do not sum to zero', () => {
    expect(() => simplifyDebts({ a: 1, b: 0 })).toThrow();
  });
});

describe('group balances', () => {
  const members = ['A', 'B', 'C', 'D', 'E'].map((id, i) => ({ id, name: id, color: `#00000${i}` }));
  const manual = (id: string, payerId: string, totalPaise: number, participants = members.map((m) => m.id)): Expense => ({
    id,
    kind: 'manual',
    description: id,
    date: '2026-10-20',
    payerId,
    category: 'Food',
    createdAt: 0,
    totalPaise,
    split: { mode: 'equal', participants, values: {} },
  });

  it('five members, ten expenses with mixed payers: balances sum to zero and settle minimally', () => {
    const expenses = [
      manual('e1', 'A', 50000),
      manual('e2', 'B', 12000, ['A', 'B']),
      manual('e3', 'C', 99900, ['B', 'C', 'D']),
      manual('e4', 'D', 25000),
      manual('e5', 'E', 3300, ['E', 'A', 'C']),
      manual('e6', 'A', 10000, ['B']),
      manual('e7', 'B', 77700),
      manual('e8', 'C', 4500, ['C', 'D']),
      manual('e9', 'E', 60000, ['A', 'B', 'C', 'D']),
      manual('e10', 'D', 12345, ['E']),
    ];
    const group: Group = { id: 'g', name: 'g', createdAt: 0, members, expenses, settlements: [], recurring: [] };
    const nets = computeNetBalances(group);
    expect(Object.values(nets).reduce((a, b) => a + b, 0)).toBe(0);
    const t = suggestSettlements(group);
    expect(t.length).toBe(bruteMin(Object.values(nets)));
    expect(Object.values(apply(nets, t)).every((v) => v === 0)).toBe(true);

    // The unsimplified IOUs describe the same balances, with at least as many payments.
    const raw = rawDebts(group);
    const zero = Object.fromEntries(members.map((m) => [m.id, 0]));
    expect(apply(zero, raw)).toEqual(Object.fromEntries(Object.entries(nets).map(([k, v]) => [k, -v])));
    expect(raw.length).toBeGreaterThanOrEqual(t.length);

    // Recording the suggested payments as settlements clears every balance.
    const settled: Group = {
      ...group,
      settlements: t.map((x, i) => ({ id: `s${i}`, ...x, date: '2026-10-21' })),
    };
    expect(Object.values(computeNetBalances(settled)).every((v) => v === 0)).toBe(true);
    expect(suggestSettlements(settled)).toEqual([]);
    expect(Object.values(apply(zero, rawDebts(settled))).every((v) => v === 0)).toBe(true);
  });
});
