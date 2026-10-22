/**
 * Recurring expenses: materialise every occurrence that has come due.
 */
import type { ManualExpense, RecurringExpense } from './types';

/** Add one cycle to an ISO date, clamping to the end of shorter months (31 Jan -> 28/29 Feb). */
export function nextOccurrence(isoDate: string, frequency: RecurringExpense['frequency'], anchorDay?: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (frequency === 'weekly') {
    const date = new Date(Date.UTC(y, m - 1, d + 7));
    return date.toISOString().slice(0, 10);
  }
  const day = anchorDay ?? d;
  const targetMonth = new Date(Date.UTC(y, m, 1)); // first day of next month
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
  targetMonth.setUTCDate(Math.min(day, lastDay));
  return targetMonth.toISOString().slice(0, 10);
}

/**
 * Create every expense due on or before `today` for a template.
 * Returns the new expenses and the updated template (with its nextDate advanced).
 * At most `limit` occurrences are created to protect against very old templates.
 */
export function materialiseRecurring(
  template: RecurringExpense,
  today: string,
  makeId: () => string,
  limit = 60,
): { expenses: ManualExpense[]; template: RecurringExpense } {
  const expenses: ManualExpense[] = [];
  if (!template.active) return { expenses, template };
  const anchorDay = Number(template.nextDate.slice(8, 10));
  let next = template.nextDate;
  while (next <= today && expenses.length < limit) {
    expenses.push({
      id: makeId(),
      kind: 'manual',
      description: template.description,
      date: next,
      payerId: template.payerId,
      category: template.category,
      createdAt: Date.now(),
      totalPaise: template.totalPaise,
      split: structuredClone(template.split),
      recurringId: template.id,
    });
    next = nextOccurrence(next, template.frequency, anchorDay);
  }
  return { expenses, template: { ...template, nextDate: next } };
}
