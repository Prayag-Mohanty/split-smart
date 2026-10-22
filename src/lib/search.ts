/**
 * Expense search: matches a free-text query against the description, item names,
 * category, payer, people involved, amount and date. Every word must match somewhere.
 */
import { toDecimalString } from './money';
import { expenseTotal } from './split';
import type { Expense, Group } from './types';

/** Searchable text for one expense (lower case). */
function haystack(expense: Expense, group: Group): string {
  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? '';
  const people = expense.kind === 'manual' ? expense.split.participants : [...new Set(expense.items.flatMap((i) => i.assignees))];
  const parts = [
    expense.description,
    expense.category,
    name(expense.payerId),
    expense.payerId === group.meId ? 'you me' : '',
    ...people.map(name),
    expense.kind === 'itemized' ? expense.items.map((i) => i.name).join(' ') : '',
    toDecimalString(expenseTotal(expense)),
    expense.date,
    new Date(expense.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
  ];
  return parts.join(' ').toLowerCase();
}

export function matchesQuery(expense: Expense, group: Group, query: string): boolean {
  const words = query
    .toLowerCase()
    .replace(/[₹,]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return true;
  const text = haystack(expense, group);
  return words.every((w) => text.includes(w));
}
