/**
 * Settlement summary as a PDF. jsPDF is imported lazily so it costs nothing until used.
 */
import { formatINR } from '../lib/money';
import { computeMemberStats, groupSpend, suggestSettlements } from '../lib/settle';
import { expenseTotal } from '../lib/split';
import type { Group } from '../lib/types';

// jsPDF's built-in fonts have no ₹ glyph, so PDFs use "Rs." instead.
const money = (p: number) => formatINR(p).replace('₹', 'Rs. ').replace('−', '-');

export async function downloadGroupPdf(group: Group): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? 'Unknown';
  const left = 48;
  const pageH = doc.internal.pageSize.getHeight();
  let y = 56;
  const line = (text: string, opts: { size?: number; bold?: boolean; x?: number; gap?: number } = {}) => {
    if (y > pageH - 56) {
      doc.addPage();
      y = 56;
    }
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size ?? 11);
    doc.text(text, opts.x ?? left, y);
    y += opts.gap ?? (opts.size ?? 11) + 7;
  };
  /** One table row; `right` lists the column indexes that are right-aligned at their x. */
  const row = (cells: string[], xs: number[], bold = false, right: number[] = [cells.length - 1]) => {
    if (y > pageH - 56) {
      doc.addPage();
      y = 56;
    }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(10);
    cells.forEach((c, i) => doc.text(c, xs[i], y, right.includes(i) ? { align: 'right' } : undefined));
    y += 16;
  };

  line('SplitSmart - settlement summary', { size: 18, bold: true, gap: 26 });
  line(group.name, { size: 14, bold: true });
  line(`Generated ${new Date().toLocaleString('en-IN')}  |  ${group.members.length} members  |  ${group.expenses.length} expenses`, { size: 9, gap: 22 });
  line(`Total spent: ${money(groupSpend(group))}`, { bold: true, gap: 26 });

  line('Who pays whom', { size: 13, bold: true });
  const transfers = suggestSettlements(group);
  if (transfers.length === 0) line('Everyone is settled up.', { gap: 22 });
  for (const t of transfers) row([`${name(t.fromId)}  ->  ${name(t.toId)}`, money(t.amountPaise)], [left, 540]);
  y += 12;

  line('Balances', { size: 13, bold: true });
  row(['Member', 'Paid', 'Share', 'Net'], [left, 360, 450, 540], true, [1, 2, 3]);
  const stats = computeMemberStats(group);
  for (const m of group.members) {
    const s = stats[m.id];
    row([m.name, money(s.paid), money(s.consumed), money(s.net)], [left, 360, 450, 540], false, [1, 2, 3]);
  }
  y += 12;

  line('Expenses', { size: 13, bold: true });
  row(['Date', 'Description', 'Paid by', 'Amount'], [left, 120, 330, 540], true);
  for (const e of [...group.expenses].sort((a, b) => a.date.localeCompare(b.date))) {
    row([e.date, e.description.slice(0, 36), name(e.payerId), money(expenseTotal(e))], [left, 120, 330, 540]);
  }

  doc.save(`${group.name.replace(/[^\w-]+/g, '_')}-settlement.pdf`);
}
