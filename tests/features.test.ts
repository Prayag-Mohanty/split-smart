import { describe, expect, it } from 'vitest';
import { describeDefault, initialSplit } from '../src/lib/defaultSplit';
import { matchesQuery } from '../src/lib/search';
import { computeNetBalances, rawDebts, suggestSettlements } from '../src/lib/settle';
import type { Expense, Group } from '../src/lib/types';

const members = [
  { id: 'r', name: 'Riya', color: '#000' },
  { id: 'a', name: 'Arjun', color: '#000' },
  { id: 'm', name: 'Meera', color: '#000' },
];
const manual = (id: string, description: string, payerId: string, totalPaise: number, participants = ['r', 'a', 'm']): Expense => ({
  id,
  kind: 'manual',
  description,
  date: '2026-10-20',
  payerId,
  category: 'Food',
  createdAt: 0,
  totalPaise,
  split: { mode: 'equal', participants, values: {} },
});
const base: Group = {
  id: 'g',
  name: 'G',
  createdAt: 0,
  meId: 'r',
  members,
  settlements: [],
  recurring: [],
  expenses: [
    manual('e1', 'Cab to Panjim', 'a', 30000),
    manual('e2', 'Movie tickets', 'm', 30000),
    {
      id: 'e3',
      kind: 'itemized',
      description: 'Night canteen',
      date: '2026-10-21',
      payerId: 'r',
      category: 'Food',
      createdAt: 0,
      items: [{ id: 'i', name: 'Paneer Tikka', qty: 1, unitPaise: 24000, totalPaise: 24000, category: 'Food', assignees: ['a'] }],
      adjustments: [],
    },
  ],
};

describe('simplify group debts switch', () => {
  it('on (default): minimum payments; off: every person-to-person debt', () => {
    // Arjun owes Riya ₹100 and Meera owes Arjun ₹100.
    const chain: Group = { ...base, expenses: [manual('c1', 'Chai', 'r', 10000, ['a']), manual('c2', 'Snacks', 'a', 10000, ['m'])] };
    expect(suggestSettlements(chain)).toEqual([{ fromId: 'm', toId: 'r', amountPaise: 10000 }]);
    expect(suggestSettlements({ ...chain, simplifyDebts: false })).toEqual([
      { fromId: 'a', toId: 'r', amountPaise: 10000 },
      { fromId: 'm', toId: 'a', amountPaise: 10000 },
    ]);
  });

  it('either way, the payments settle every balance', () => {
    const on = suggestSettlements(base);
    const off = suggestSettlements({ ...base, simplifyDebts: false });
    expect(off).toEqual(rawDebts(base));
    expect(off.length).toBeGreaterThanOrEqual(on.length);
    // Both settle the same balances.
    for (const transfers of [on, off]) {
      const b = { ...computeNetBalances(base) };
      for (const t of transfers) {
        b[t.fromId] += t.amountPaise;
        b[t.toId] -= t.amountPaise;
      }
      expect(Object.values(b).every((v) => v === 0)).toBe(true);
    }
  });
});

describe('expense search', () => {
  const find = (q: string) => base.expenses.filter((e) => matchesQuery(e, base, q)).map((e) => e.id);
  it('matches description, item names, payer, people and amount', () => {
    expect(find('cab')).toEqual(['e1']);
    expect(find('paneer')).toEqual(['e3']);
    expect(find('meera')).toEqual(['e1', 'e2']);
    expect(find('you')).toEqual(['e3']);
    expect(find('₹300')).toEqual(['e1', 'e2']);
    expect(find('movie meera')).toEqual(['e2']);
    expect(find('')).toEqual(['e1', 'e2', 'e3']);
    expect(find('pizza')).toEqual([]);
  });
});

describe('default split', () => {
  it('defaults to paid by you, split equally between everyone', () => {
    expect(initialSplit(base)).toEqual({ payerId: 'r', split: { mode: 'equal', participants: ['r', 'a', 'm'], values: {} } });
    expect(describeDefault(base)).toBe('Paid by you and split equally');
  });
  it('applies a saved default, dropping removed members', () => {
    const saved = { payerId: 'a', split: { mode: 'shares' as const, participants: ['r', 'a', 'x'], values: { r: 2, a: 1, x: 1 } } };
    expect(initialSplit(base, saved)).toEqual({ payerId: 'a', split: { mode: 'shares', participants: ['r', 'a'], values: { r: 2, a: 1 } } });
    expect(describeDefault(base, saved)).toBe('Paid by Arjun and split by shares (2 : 1) between 2 of 3 people');
  });
  it('falls back when nobody in the default is still in the group', () => {
    expect(initialSplit(base, { split: { mode: 'equal', participants: ['x'], values: {} } }).split.participants).toEqual(['r', 'a', 'm']);
  });
});
