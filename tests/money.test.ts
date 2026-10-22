import { describe, expect, it } from 'vitest';
import { formatINR, parseMoney, toDecimalString } from '../src/lib/money';

describe('parseMoney', () => {
  it.each([
    ['100', 10000],
    ['₹1,234.50', 123450],
    ['Rs. 12.5', 1250],
    ['-40', -4000],
    ['(40.00)', -4000],
    ['0.005', 1],
    ['33.334', 3333],
    ['', null],
    ['abc', null],
    ['.', null],
  ])('%s -> %s', (input, expected) => expect(parseMoney(input)).toBe(expected));

  it('accepts numbers', () => expect(parseMoney(12.34)).toBe(1234));
});

describe('formatting', () => {
  it('formats INR with Indian grouping', () => expect(formatINR(12345678)).toBe('₹1,23,456.78'));
  it('formats negatives', () => expect(formatINR(-3333)).toBe('−₹33.33'));
  it('decimal string', () => {
    expect(toDecimalString(3334)).toBe('33.34');
    expect(toDecimalString(5)).toBe('0.05');
  });
});
