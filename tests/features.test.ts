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

import { applyRates, rateBase } from '../src/screens/scan/draft';
import type { Adjustment, ReceiptItem } from '../src/lib/types';

describe('percentage tax lines', () => {
  const item = (id: string, totalPaise: number): ReceiptItem => ({ id, name: id, qty: 1, unitPaise: totalPaise, totalPaise, category: 'Food', assignees: [] });
  const gst = (rate: number, amountPaise = 0): Adjustment => ({ id: `t${rate}`, label: `GST ${rate}%`, kind: 'tax', amountPaise, ratePercent: rate });

  it('recalculates CGST/SGST when items are added, edited or removed', () => {
    let d = applyRates({ items: [item('a', 237000)], adjustments: [gst(2.5), { ...gst(2.5), id: 's' }] });
    expect(d.adjustments.map((a) => a.amountPaise)).toEqual([5925, 5925]);
    d = applyRates({ ...d, items: [...d.items, item('b', 10000)] });
    expect(d.adjustments.map((a) => a.amountPaise)).toEqual([6175, 6175]);
    d = applyRates({ ...d, items: [item('b', 10000)] });
    expect(d.adjustments.map((a) => a.amountPaise)).toEqual([250, 250]);
  });

  it('charges the rate after discounts and leaves fixed lines alone', () => {
    const fixed: Adjustment = { id: 'f', label: 'Packing', kind: 'other', amountPaise: 2000 };
    const discount: Adjustment = { id: 'd', label: 'Discount', kind: 'discount', amountPaise: -10000 };
    const d = applyRates({ items: [item('a', 110000)], adjustments: [discount, gst(5), fixed] });
    expect(rateBase(d)).toBe(100000);
    expect(d.adjustments.map((a) => a.amountPaise)).toEqual([-10000, 5000, 2000]);
  });

  it('returns the same object when nothing changes', () => {
    const d = { items: [item('a', 10000)], adjustments: [gst(5, 500)] };
    expect(applyRates(d)).toBe(d);
  });
});

import { categoryHint } from '../src/lib/categoryHints';

describe('category keyword hints', () => {
  it.each([
    ['Lemon Soda/Lemon Juice', 'Food'],
    ['BUTTER GARLIC PRAWN', 'Food'],
    ['Water', 'Food'],
    ['Water bill', 'Utilities'],
    ['Surf Excel 1kg', 'Groceries'],
    ['Amul Milk 1L', 'Groceries'],
    ['Cab to Panjim', 'Travel'],
    ['Movie tickets', 'Entertainment'],
    ['Wi-Fi recharge', 'Utilities'],
    ['Paracetamol from pharmacy', 'Other'],
  ])('%s -> %s', (text, cat) => expect(categoryHint(text)).toBe(cat));

  it('leaves garbled or unknown names to the model', () => {
    expect(categoryHint('Leno SOE go')).toBeUndefined();
    expect(categoryHint('Xyz 123')).toBeUndefined();
  });
});

import { expensePayers, mainPayer, paidByPhrase, payerFields, validatePayers } from '../src/lib/payers';

describe('several people paying one bill', () => {
  // ₹900 dinner for Riya, Arjun and Meera (₹300 each); Riya paid ₹500 and Arjun ₹400.
  const shared: Group = {
    ...base,
    expenses: [{ ...manual('d', 'Dinner', 'r', 90000), payers: { r: 50000, a: 40000 } }],
  };

  it('credits each payer with what they paid', () => {
    expect(computeNetBalances(shared)).toEqual({ r: 20000, a: 10000, m: -30000 });
    expect(suggestSettlements(shared)).toEqual([
      { fromId: 'm', toId: 'r', amountPaise: 20000 },
      { fromId: 'm', toId: 'a', amountPaise: 10000 },
    ]);
  });

  it('splits each share between the payers in proportion for person-to-person debts', () => {
    const raw = rawDebts({ ...shared, simplifyDebts: false });
    const b = { r: 0, a: 0, m: 0 } as Record<string, number>;
    for (const t of raw) {
      b[t.fromId] += t.amountPaise;
      b[t.toId] -= t.amountPaise;
    }
    expect(b).toEqual({ r: -20000, a: -10000, m: 30000 });
  });

  it('validates that the amounts paid add up to the bill', () => {
    expect(validatePayers(90000, { r: 50000, a: 40000 })).toBeNull();
    expect(validatePayers(90000, { r: 50000, a: 30000 })).toMatch(/short by ₹100.00/);
    expect(validatePayers(90000, { r: 0 })).toMatch(/at least one/);
  });

  it('stores one payer as payerId only, several as payers plus the main payer', () => {
    expect(payerFields({ r: 90000, a: 0 }, ['r', 'a'])).toEqual({ payerId: 'r' });
    expect(payerFields({ r: 40000, a: 50000 }, ['r', 'a'])).toEqual({ payerId: 'a', payers: { r: 40000, a: 50000 } });
    expect(mainPayer({ r: 100, a: 100 }, ['a', 'r'])).toBe('a');
  });

  it('describes who paid', () => {
    expect(paidByPhrase(shared, shared.expenses[0])).toBe('You and Arjun paid');
    expect(expensePayers(base.expenses[0])).toEqual({ a: 30000 });
  });

  it('person-to-person debts match the balances exactly, to the paisa (random bills)', () => {
    let seed = 7;
    const rnd = (n: number) => Math.floor(((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * n);
    for (let trial = 0; trial < 200; trial++) {
      const ids = ['r', 'a', 'm'];
      const expenses: Expense[] = Array.from({ length: 1 + rnd(4) }, (_, k) => {
        const total = 1 + rnd(100000);
        const first = rnd(total + 1);
        const second = rnd(total - first + 1);
        const payers = { r: first, a: second, m: total - first - second };
        return { ...manual(`e${k}`, 'x', 'r', total, [...new Set(ids.filter(() => rnd(3) > 0).concat('m'))]), payers };
      });
      const g: Group = { ...base, expenses, simplifyDebts: false };
      const b: Record<string, number> = { r: 0, a: 0, m: 0 };
      for (const t of rawDebts(g)) {
        b[t.fromId] += t.amountPaise;
        b[t.toId] -= t.amountPaise;
      }
      const nets = computeNetBalances(g);
      expect(b).toEqual({ r: -nets.r, a: -nets.a, m: -nets.m });
    }
  });
});
