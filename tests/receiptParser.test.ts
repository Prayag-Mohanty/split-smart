import { describe, expect, it } from 'vitest';
import { checkTotals, linesFromText, parseReceipt } from '../src/lib/receiptParser';
import type { OcrLine } from '../src/lib/receiptParser';

const parse = (text: string) => parseReceipt(linesFromText(text));

describe('parseReceipt', () => {
  it('parses a clear restaurant bill with CGST/SGST and ignores noise', () => {
    const r = parse(`
      NIGHT CANTEEN - BH4
      Near Library, BITS Goa
      GSTIN: 30ABCDE1234F1Z5
      Ph: 9876543210
      Bill No: 1042   Date: 21/10/2026 23:45
      Item            Qty   Rate   Amount
      Large Pizza      1   400.00  400.00
      Maggi            3    60.00  180.00
      Cold Coffee      1   220.00  220.00
      Sub Total                    800.00
      CGST @ 2.5%                   20.00
      SGST @ 2.5%                   20.00
      Grand Total                  840.00
      Cash                        1000.00
      Change                       160.00
      Thank you! Visit again
    `);
    expect(r.merchant).toBe('NIGHT CANTEEN - BH4');
    expect(r.date).toBe('2026-10-21');
    expect(r.items.map((i) => [i.name, i.qty, i.unitPaise, i.totalPaise])).toEqual([
      ['Large Pizza', 1, 40000, 40000],
      ['Maggi', 3, 6000, 18000],
      ['Cold Coffee', 1, 22000, 22000],
    ]);
    expect(r.subtotalPaise).toBe(80000);
    expect(r.adjustments.map((a) => [a.kind, a.amountPaise])).toEqual([
      ['tax', 2000],
      ['tax', 2000],
    ]);
    expect(r.totalPaise).toBe(84000);
    const check = checkTotals(r.items.map((i) => i.totalPaise), r.adjustments.map((a) => a.amountPaise), r.totalPaise);
    expect(check.matches).toBe(true);
  });

  it('handles qty-amount, leading "2 x" quantities, service charge, discount and round-off', () => {
    const r = parse(`
      Chai Point
      2 x Masala Chai      40
      Samosa x3            45.00
      Paneer Roll   2    180.00
      Chicken 65           240
      Service Charge 5%    25.25
      Discount 10%        -50.00
      Round Off            -0.25
      Net Payable          480.00
    `);
    expect(r.items.map((i) => [i.name, i.qty, i.totalPaise])).toEqual([
      ['Masala Chai', 2, 4000],
      ['Samosa', 3, 4500],
      ['Paneer Roll', 2, 18000],
      ['Chicken 65', 1, 24000],
    ]);
    expect(r.adjustments.map((a) => [a.kind, a.amountPaise])).toEqual([
      ['service', 2525],
      ['discount', -5000],
      ['other', -25],
    ]);
    expect(r.totalPaise).toBe(48000);
    const check = checkTotals(r.items.map((i) => i.totalPaise), r.adjustments.map((a) => a.amountPaise), r.totalPaise);
    expect(check.differencePaise).toBe(48000 - (50500 + 2525 - 5000 - 25));
  });

  it('fixes common OCR digit confusions', () => {
    const r = parse(`Veg Thali   1   l2O.OO   12O.OO\nTotal 120.00`);
    expect(r.items[0].totalPaise).toBe(12000);
    expect(r.totalPaise).toBe(12000);
  });

  it('treats a lone "Total" followed by taxes as a subtotal and asks for the total', () => {
    const r = parse(`Dosa 60\nIdli 40\nTotal 100\nCGST 2.50\nSGST 2.50`);
    expect(r.items).toHaveLength(2);
    expect(r.subtotalPaise).toBe(10000);
    expect(r.totalPaise).toBeUndefined();
    expect(r.adjustments).toHaveLength(2);
  });

  it('does not double count a "Total GST" summary line', () => {
    const r = parse(`Dosa 100\nCGST 2.50\nSGST 2.50\nTotal GST 5.00\nGrand Total 105.00`);
    expect(r.adjustments.map((a) => a.amountPaise)).toEqual([250, 250]);
  });

  it('returns no items for a non-receipt (selfie) image', () => {
    const r = parse(`@#$ ~~ \n fghj 7\n ..`);
    expect(r.items).toHaveLength(0);
    expect(r.totalPaise).toBeUndefined();
  });

  it('receipt with no printed total', () => {
    const r = parse(`Bread 45\nMilk 2 60\nEggs 12 84.00`);
    expect(r.items.map((i) => i.totalPaise)).toEqual([4500, 6000, 8400]);
    expect(r.totalPaise).toBeUndefined();
  });

  it('carries per-word OCR confidence into fields', () => {
    const lines: OcrLine[] = [
      {
        text: 'Maggi 60.00',
        confidence: 60,
        words: [
          { text: 'Maggi', confidence: 92 },
          { text: '60.00', confidence: 41 },
        ],
      },
    ];
    const r = parseReceipt(lines);
    expect(r.items[0].confidence.name).toBe(92);
    expect(r.items[0].confidence.price).toBe(41);
  });

  it('joins item names with the qty/price/amount printed on the next line', () => {
    const r = parse(`
      SEAROCK RESTAURANT
      ITEM   QTY   PRICE   AMOUNT
      WATER    1   20.00   20.00
      BUTTER GARLIC PRAWN
        1    450.00   450.00
      TAWA CALAMARI
      \\   450.00 © 450.00
      LEMON SODA/LEMON JUICE
        2    100.00   200.00
      ITEM: 8 QTY: 9
      AMOUNT : 2370.00
    `);
    expect(r.items.map((i) => [i.name, i.qty, i.totalPaise])).toEqual([
      ['WATER', 1, 2000],
      ['BUTTER GARLIC PRAWN', 1, 45000],
      ['TAWA CALAMARI', 1, 45000],
      ['LEMON SODA/LEMON JUICE', 2, 20000],
    ]);
  });

  it('drops stray zeros instead of gluing them onto names', () => {
    const r = parse(`WAIER 0.00 20.0\nCHILLI PANEER 0 350.00`);
    expect(r.items.map((i) => [i.name, i.totalPaise])).toEqual([
      ['WAIER', 2000],
      ['CHILLI PANEER', 35000],
    ]);
  });
});
