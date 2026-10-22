import { describe, expect, it } from 'vitest';
import { allocate, computeItemizedSplit, computeSplit } from '../src/lib/split';
import type { Adjustment, ReceiptItem } from '../src/lib/types';

const item = (name: string, totalPaise: number, assignees: string[]): ReceiptItem => ({
  id: name,
  name,
  qty: 1,
  unitPaise: totalPaise,
  totalPaise,
  category: 'Food',
  assignees,
});
const adj = (kind: Adjustment["kind"], amountPaise: number, label: string = kind): Adjustment => ({ id: label, label, kind, amountPaise });

describe('allocate (largest remainder)', () => {
  it('₹100 three ways reconciles exactly: 33.34 / 33.33 / 33.33', () => {
    expect(allocate(10000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
  });
  it('always sums to the total', () => {
    for (let total = 0; total < 2000; total += 37) {
      const parts = allocate(total, [3, 1, 7, 2]);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
  it('gives leftover paise to the largest remainders, ties to earlier members', () => {
    // 101 paise at 1:1:1:1 -> 25.25 each -> one extra paisa to the first member
    expect(allocate(101, [1, 1, 1, 1])).toEqual([26, 25, 25, 25]);
    // 100 at 2:1 -> 66.67 / 33.33 -> remainder goes to the larger fraction (first)
    expect(allocate(100, [2, 1])).toEqual([67, 33]);
    expect(allocate(100, [1, 2])).toEqual([33, 67]);
  });
  it('supports decimal weights and negative totals', () => {
    expect(allocate(300, [1.5, 1.5])).toEqual([150, 150]);
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
  });
  it('rejects splitting money between nobody', () => {
    expect(() => allocate(100, [])).toThrow();
    expect(() => allocate(100, [0, 0])).toThrow();
  });
  it('handles huge totals without precision loss', () => {
    const parts = allocate(9_000_000_000_00, [123456789, 987654321, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(9_000_000_000_00);
  });
});

describe('computeSplit modes', () => {
  const people = ['a', 'b', 'c'];
  it('equal', () => {
    const r = computeSplit(10000, { mode: 'equal', participants: people, values: {} });
    expect(r.shares).toEqual({ a: 3334, b: 3333, c: 3333 });
  });
  it('exact must total the bill', () => {
    const bad = computeSplit(10000, { mode: 'exact', participants: people, values: { a: 5000, b: 3000, c: 1000 } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/short by ₹10.00/);
    const good = computeSplit(10000, { mode: 'exact', participants: people, values: { a: 5000, b: 3000, c: 2000 } });
    expect(good.shares).toEqual({ a: 5000, b: 3000, c: 2000 });
  });
  it('percent must total 100%', () => {
    expect(computeSplit(10000, { mode: 'percent', participants: people, values: { a: 50, b: 30, c: 10 } }).ok).toBe(false);
    const r = computeSplit(10000, { mode: 'percent', participants: people, values: { a: 33.33, b: 33.33, c: 33.34 } });
    expect(r.shares).toEqual({ a: 3333, b: 3333, c: 3334 });
  });
  it('shares 2:1:1', () => {
    const r = computeSplit(1000, { mode: 'shares', participants: people, values: { a: 2, b: 1, c: 1 } });
    expect(r.shares).toEqual({ a: 500, b: 250, c: 250 });
  });
  it('rejects empty participants and non-positive totals', () => {
    expect(computeSplit(100, { mode: 'equal', participants: [], values: {} }).ok).toBe(false);
    expect(computeSplit(0, { mode: 'equal', participants: people, values: {} }).ok).toBe(false);
  });
});

describe('computeItemizedSplit', () => {
  it('distributes tax proportionally to item subtotals (₹600 of ₹1000 pays ₹60 of ₹100 tax)', () => {
    const r = computeItemizedSplit([item('x', 60000, ['a']), item('y', 40000, ['b'])], [adj('tax', 10000)], ['a', 'b']);
    expect(r.ok).toBe(true);
    expect(r.shares).toEqual({ a: 66000, b: 44000 });
    expect(r.breakdown.find((b) => b.memberId === 'a')!.byKind.tax).toBe(6000);
  });

  it('night canteen scenario: items + 5% GST = ₹840, shares reconcile', () => {
    const members = ['riya', 'arjun', 'meera', 'kabir'];
    const items = [
      item('Large pizza', 40000, members),
      item('Maggi', 6000, ['arjun']),
      item('Maggi', 6000, ['kabir']),
      item('Maggi', 6000, ['riya']),
      item('Cold coffee', 22000, ['meera']),
    ];
    const r = computeItemizedSplit(items, [adj('tax', 2000, 'CGST 2.5%'), adj('tax', 2000, 'SGST 2.5%')], members);
    expect(r.billTotal).toBe(84000);
    const sum = Object.values(r.shares).reduce((a, b) => a + b, 0);
    expect(sum).toBe(84000);
    expect(r.shares.meera).toBe(Math.round(32000 * 1.05)); // 10000 pizza + 22000 coffee
  });

  it('applies discounts proportionally and still reconciles', () => {
    const r = computeItemizedSplit(
      [item('x', 33333, ['a', 'b', 'c']), item('y', 10001, ['c'])],
      [adj('discount', 1000), adj('service', 2167), adj('tax', 1234)],
      ['a', 'b', 'c'],
    );
    const sum = Object.values(r.shares).reduce((a, b) => a + b, 0);
    expect(sum).toBe(33333 + 10001 - 1000 + 2167 + 1234);
    expect(r.billTotal).toBe(sum);
  });

  it('flags unassigned items', () => {
    const r = computeItemizedSplit([item('x', 100, []), item('y', 100, ['a'])], [], ['a']);
    expect(r.ok).toBe(false);
    expect(r.unassigned.map((i) => i.name)).toEqual(['x']);
  });
});
