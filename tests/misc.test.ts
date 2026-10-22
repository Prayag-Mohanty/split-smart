import { describe, expect, it } from 'vitest';
import { buildUpiLink, isValidVpa } from '../src/lib/upi';
import { materialiseRecurring, nextOccurrence } from '../src/lib/recurring';
import { decodeGroup, encodeGroup, groupFromJson, groupToJson } from '../src/lib/share';
import { groupToCsv } from '../src/lib/exporters';
import type { Group, RecurringExpense } from '../src/lib/types';

const group: Group = {
  id: 'g1',
  name: 'Wing B, "Goa" Trip',
  createdAt: 1,
  members: [
    { id: 'a', name: 'Riya', color: '#f00', upiId: 'riya@okaxis' },
    { id: 'b', name: 'Arjun', color: '#0f0' },
  ],
  expenses: [
    {
      id: 'e1',
      kind: 'manual',
      description: 'Wi-Fi',
      date: '2026-10-01',
      payerId: 'a',
      category: 'Utilities',
      createdAt: 1,
      totalPaise: 10001,
      split: { mode: 'equal', participants: ['a', 'b'], values: {} },
    },
  ],
  settlements: [],
  recurring: [],
};

describe('UPI', () => {
  it('builds a pre-filled upi://pay link', () => {
    expect(buildUpiLink({ payeeVpa: 'riya@okaxis', payeeName: 'Riya S', amountPaise: 3334, note: 'Night Canteen' })).toBe(
      'upi://pay?pa=riya%40okaxis&pn=Riya%20S&am=33.34&cu=INR&tn=Night%20Canteen',
    );
  });
  it('validates VPAs', () => {
    expect(isValidVpa('riya@okaxis')).toBe(true);
    expect(isValidVpa('riya')).toBe(false);
  });
});

describe('recurring', () => {
  it('clamps monthly dates to month end and keeps the anchor day', () => {
    expect(nextOccurrence('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(nextOccurrence('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
    expect(nextOccurrence('2026-12-30', 'weekly')).toBe('2027-01-06');
  });
  it('creates every due occurrence once', () => {
    let n = 0;
    const tpl: RecurringExpense = {
      id: 'r',
      description: 'Wi-Fi',
      totalPaise: 59900,
      payerId: 'a',
      category: 'Utilities',
      split: { mode: 'equal', participants: ['a', 'b'], values: {} },
      frequency: 'monthly',
      nextDate: '2026-08-15',
      active: true,
    };
    const { expenses, template } = materialiseRecurring(tpl, '2026-10-22', () => `x${n++}`);
    expect(expenses.map((e) => e.date)).toEqual(['2026-08-15', '2026-09-15', '2026-10-15']);
    expect(template.nextDate).toBe('2026-11-15');
    expect(materialiseRecurring(template, '2026-10-22', () => 'y').expenses).toHaveLength(0);
  });
});

describe('sharing', () => {
  it('round-trips through JSON', () => {
    expect(groupFromJson(groupToJson(group))).toEqual(group);
  });
  it('round-trips through a share URL', async () => {
    const encoded = await encodeGroup(group);
    expect(encoded).toMatch(/^[zj][A-Za-z0-9_-]+$/);
    expect(await decodeGroup(encoded)).toEqual(group);
  });
  it('rejects junk', () => {
    expect(() => groupFromJson('{"hello":1}')).toThrow(/does not look like/);
    expect(() => groupFromJson('nope')).toThrow(/not valid JSON/);
  });
});

describe('CSV export', () => {
  it('escapes cells and includes balances and suggestions', () => {
    const csv = groupToCsv(group);
    expect(csv).toContain('"Wing B, ""Goa"" Trip"');
    expect(csv).toContain('Arjun,Riya,50.00');
  });
});

import { spendByCategory, spendOverTime } from '../src/lib/analytics';

describe('analytics', () => {
  it('splits itemized receipts by item category and reconciles with totals', () => {
    const g: Group = {
      ...group,
      expenses: [
        ...group.expenses,
        {
          id: 'e2',
          kind: 'itemized',
          description: 'DMart',
          date: '2026-10-03',
          payerId: 'b',
          category: 'Groceries',
          createdAt: 1,
          items: [
            { id: 'i1', name: 'Rice', qty: 1, unitPaise: 60000, totalPaise: 60000, category: 'Groceries', assignees: ['a'] },
            { id: 'i2', name: 'Chips', qty: 1, unitPaise: 40000, totalPaise: 40000, category: 'Food', assignees: ['b'] },
          ],
          adjustments: [{ id: 't', label: 'GST', kind: 'tax', amountPaise: 10000 }],
        },
      ],
    };
    const c = spendByCategory(g);
    expect(c.Groceries).toBe(66000);
    expect(c.Food).toBe(44000);
    expect(c.Utilities).toBe(10001);
    const t = spendOverTime(g);
    expect(t.map((x) => x.total)).toEqual([10001, 0, 110000]);
  });
});
