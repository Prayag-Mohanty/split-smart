/**
 * CSV export of a group's expenses, balances and suggested settlements.
 * (PDF export lives in src/services/pdf.ts because it lazy-loads jsPDF.)
 */
import { toDecimalString } from './money';
import { computeMemberStats, suggestSettlements } from './settle';
import { expenseShares, expenseTotal } from './split';
import type { Group } from './types';

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (cells: (string | number)[]) => cells.map(csvCell).join(',');

export function groupToCsv(group: Group): string {
  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? 'Unknown';
  const order = group.members.map((m) => m.id);
  const lines: string[] = [];

  lines.push(row(['SplitSmart summary', group.name]));
  lines.push(row(['Generated', new Date().toLocaleString('en-IN')]));
  lines.push('');
  lines.push(row(['Expenses']));
  lines.push(row(['Date', 'Description', 'Category', 'Paid by', 'Total (INR)', ...group.members.map((m) => `${m.name} share`)]));
  for (const e of [...group.expenses].sort((a, b) => a.date.localeCompare(b.date))) {
    const shares = expenseShares(e, order);
    lines.push(
      row([
        e.date,
        e.description,
        e.category,
        name(e.payerId),
        toDecimalString(expenseTotal(e)),
        ...group.members.map((m) => toDecimalString(shares[m.id] ?? 0)),
      ]),
    );
  }
  lines.push('');
  lines.push(row(['Balances']));
  lines.push(row(['Member', 'Paid', 'Share', 'Net (positive = is owed)']));
  const stats = computeMemberStats(group);
  for (const m of group.members) {
    const s = stats[m.id];
    lines.push(row([m.name, toDecimalString(s.paid), toDecimalString(s.consumed), toDecimalString(s.net)]));
  }
  lines.push('');
  lines.push(row(['Suggested payments']));
  lines.push(row(['From', 'To', 'Amount (INR)']));
  for (const t of suggestSettlements(group)) lines.push(row([name(t.fromId), name(t.toId), toDecimalString(t.amountPaise)]));
  if (group.settlements.length) {
    lines.push('');
    lines.push(row(['Recorded settlements']));
    lines.push(row(['Date', 'From', 'To', 'Amount (INR)']));
    for (const s of group.settlements) lines.push(row([s.date, name(s.fromId), name(s.toId), toDecimalString(s.amountPaise)]));
  }
  return lines.join('\n');
}
