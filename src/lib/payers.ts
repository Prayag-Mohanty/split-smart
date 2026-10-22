/**
 * Who paid an expense. Usually one person (`payerId`), but several people can each pay
 * part of a bill (`payers`: exact paise per person, summing to the total).
 */
import { formatINR, type Paise } from './money';
import { personName } from './people';
import { expenseTotal } from './split';
import type { Expense, Group, MemberId } from './types';

/** Paise paid per member for an expense, always summing to its total. */
export function expensePayers(expense: Expense): Record<MemberId, Paise> {
  const multi = expense.payers && Object.entries(expense.payers).filter(([, v]) => v > 0);
  if (multi && multi.length > 0) return Object.fromEntries(multi);
  return { [expense.payerId]: expenseTotal(expense) };
}

/** Error message if the amounts don't make a valid set of payers for `total`, else null. */
export function validatePayers(total: Paise, payers: Record<MemberId, Paise>): string | null {
  const amounts = Object.values(payers);
  if (amounts.some((v) => !Number.isInteger(v) || v < 0)) return 'Amounts paid cannot be negative.';
  if (amounts.filter((v) => v > 0).length === 0) return 'Enter how much at least one person paid.';
  const paid = amounts.reduce((a, b) => a + b, 0);
  if (paid !== total) {
    const diff = total - paid;
    return `Amounts paid must add up to the bill — ${diff > 0 ? 'short' : 'over'} by ${formatINR(Math.abs(diff))}.`;
  }
  return null;
}

/** The member who paid the most (first in `order` on a tie). */
export function mainPayer(payers: Record<MemberId, Paise>, order: readonly MemberId[] = Object.keys(payers)): MemberId {
  const ids = [...new Set([...order, ...Object.keys(payers)])].filter((id) => (payers[id] ?? 0) > 0);
  return ids.reduce((best, id) => (payers[id] > (payers[best] ?? -1) ? id : best), ids[0]);
}

/**
 * Normalise a payer choice for saving: one payer is stored as just `payerId`;
 * several are stored as `payers` plus the main payer.
 */
export function payerFields(payers: Record<MemberId, Paise>, order: readonly MemberId[]): { payerId: MemberId; payers?: Record<MemberId, Paise> } {
  const positive = Object.fromEntries(Object.entries(payers).filter(([, v]) => v > 0));
  const payerId = mainPayer(positive, order);
  return Object.keys(positive).length > 1 ? { payerId, payers: positive } : { payerId };
}

/** "You paid" / "Riya and Arjun paid" / "Riya, Arjun and 2 others paid". */
export function paidByPhrase(group: Pick<Group, 'meId' | 'members'>, expense: Expense): string {
  const order = group.members.map((m) => m.id);
  const ids = Object.keys(expensePayers(expense)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const names = ids.map((id) => personName(group, id));
  if (names.length === 1) return `${names[0]} paid`;
  if (names.length === 2) return `${names[0]} and ${names[1]} paid`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} other${names.length - 2 > 1 ? 's' : ''} paid`;
}

/** "Riya ₹500 + Arjun ₹340" for exports and summaries. */
export function payersDetail(group: Pick<Group, 'meId' | 'members'>, expense: Expense): string {
  const order = group.members.map((m) => m.id);
  return Object.entries(expensePayers(expense))
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([id, amt]) => `${group.members.find((m) => m.id === id)?.name ?? 'Unknown'} ${formatINR(amt)}`)
    .join(' + ');
}
