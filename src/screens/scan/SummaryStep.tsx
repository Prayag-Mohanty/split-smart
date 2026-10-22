import { useMemo, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { toast } from '../../components/Toast';
import { Banner, CategorySelect } from '../../components/ui';
import { formatINR } from '../../lib/money';
import { personName } from '../../lib/people';
import { suggestSettlements } from '../../lib/settle';
import { computeItemizedSplit } from '../../lib/split';
import type { Group } from '../../lib/types';
import { dominantCategory, draftToExpense, type Draft } from './draft';

interface SummaryStepProps {
  group: Group;
  draft: Draft;
  update: (fn: (d: Draft) => Draft) => void;
  onBack: () => void;
  onSave: () => void;
  onDelete?: () => void;
}

/** Final per-person breakdown: items + proportional tax/charges/discounts, reconciled to the paisa. */
export function SummaryStep({ group, draft, update, onBack, onSave, onDelete }: SummaryStepProps) {
  const order = useMemo(() => group.members.map((m) => m.id), [group.members]);
  const split = useMemo(() => computeItemizedSplit(draft.items, draft.adjustments, order), [draft.items, draft.adjustments, order]);
  const payer = group.members.find((m) => m.id === draft.payerId);
  const has = (k: 'tax' | 'service' | 'discount' | 'other') => split.breakdown.some((b) => b.byKind[k] !== 0);
  const sum = split.breakdown.reduce((s, b) => s + b.totalPaise, 0);
  const category = draft.categoryLocked ? draft.category : dominantCategory(draft.items);
  const [sharing, setSharing] = useState(false);

  // What this bill means in money terms: who pays the payer, and the group's settle-up afterwards.
  const owes = split.breakdown.filter((b) => b.memberId !== draft.payerId && b.totalPaise > 0);
  const groupAfter = useMemo(() => {
    if (!split.ok) return [];
    const expense = draftToExpense(draft);
    return suggestSettlements({ ...group, expenses: [expense, ...group.expenses.filter((e) => e.id !== expense.id)] });
  }, [group, draft, split.ok]);

  const shareCard = async () => {
    if (!payer) return;
    setSharing(true);
    try {
      const { renderBillCard, shareOrDownload } = await import('../../services/billCard');
      const byId = new Map(group.members.map((m) => [m.id, m]));
      const blob = await renderBillCard({
        title: draft.description || 'Receipt',
        date: new Date(draft.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        groupName: group.name,
        total: split.billTotal,
        payer,
        shares: split.breakdown
          .filter((b) => byId.has(b.memberId))
          .map((b) => ({
            member: byId.get(b.memberId)!,
            amount: b.totalPaise,
            label: draft.items
              .filter((i) => i.assignees.includes(b.memberId))
              .map((i) => i.name)
              .join(', '),
          })),
      });
      const how = await shareOrDownload(blob, `${(draft.description || 'bill').replace(/[^\w-]+/g, '_')}.png`, draft.description || 'Bill split');
      if (how === 'downloaded') toast('Bill card saved — post it in your group chat');
    } catch {
      toast('Could not create the bill card', 'error');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="stack-lg">
      {!split.ok && <Banner tone="error">{split.error}</Banner>}
      <div className="card summary-hero">
        <span className="muted small">{draft.description || 'Receipt'}</span>
        <strong className="big-amount">{formatINR(split.billTotal)}</strong>
        <label className="payer-chip">
          {payer && <Avatar member={payer} size="sm" />}
          <span>Paid by</span>
          <select value={draft.payerId} onChange={(e) => update((d) => ({ ...d, payerId: e.target.value }))} aria-label="Paid by">
            {group.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === group.meId ? `${m.name} (you)` : m.name}
              </option>
            ))}
          </select>
          <span aria-hidden="true">▾</span>
        </label>
      </div>

      <div className="card">
        <h2 className="card-title">Each person's share</h2>
        <div className="table-scroll">
          <table className="breakdown">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Items</th>
                {has('tax') && <th scope="col">Tax</th>}
                {has('service') && <th scope="col">Service</th>}
                {has('discount') && <th scope="col">Discount</th>}
                {has('other') && <th scope="col">Other</th>}
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {split.breakdown.map((b) => {
                const m = group.members.find((x) => x.id === b.memberId);
                return (
                  <tr key={b.memberId}>
                    <th scope="row">
                      <span className="cell-person">
                        {m && <Avatar member={m} size="sm" />} {m?.name ?? 'Unknown'}
                      </span>
                    </th>
                    <td>{formatINR(b.itemsPaise)}</td>
                    {has('tax') && <td>{formatINR(b.byKind.tax)}</td>}
                    {has('service') && <td>{formatINR(b.byKind.service)}</td>}
                    {has('discount') && <td>{formatINR(b.byKind.discount)}</td>}
                    {has('other') && <td>{formatINR(b.byKind.other)}</td>}
                    <td>
                      <strong>{formatINR(b.totalPaise)}</strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td>{formatINR(split.itemsTotal)}</td>
                {has('tax') && <td>{formatINR(split.breakdown.reduce((s, b) => s + b.byKind.tax, 0))}</td>}
                {has('service') && <td>{formatINR(split.breakdown.reduce((s, b) => s + b.byKind.service, 0))}</td>}
                {has('discount') && <td>{formatINR(split.breakdown.reduce((s, b) => s + b.byKind.discount, 0))}</td>}
                {has('other') && <td>{formatINR(split.breakdown.reduce((s, b) => s + b.byKind.other, 0))}</td>}
                <td>
                  <strong>{formatINR(sum)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {split.ok && sum === split.billTotal && (
          <p className="small pos">
            <Icon name="check" size={14} /> Shares add up exactly to {formatINR(split.billTotal)}.
          </p>
        )}
        {split.ok && owes.length > 0 && (
          <div className="consequence">
            <strong>For this bill:</strong>{' '}
            {owes.map((b, i) => (
              <span key={b.memberId}>
                {i > 0 && ' · '}
                {personName(group, b.memberId)} → {personName(group, draft.payerId)} {formatINR(b.totalPaise)}
              </span>
            ))}
            <div className="small muted">
              After saving, the whole group settles up in {groupAfter.length} payment{groupAfter.length === 1 ? '' : 's'}.
            </div>
          </div>
        )}
        <details className="small muted">
          <summary>How is this calculated?</summary>
          <p>
            Each item is split equally between the people who had it. Tax, service charge and discounts are then shared in proportion to each person's item subtotal — so someone whose items are 60% of the bill pays 60% of the tax.
          </p>
          <p>
            Rounding: amounts are rounded down to the paisa, and the few leftover paise go to whoever lost the largest fraction (ties go to the person listed first in the group), so the shares always add up exactly.
          </p>
        </details>
      </div>

      <div className="card stack">
        <label className="field">
          <span>Category for this expense</span>
          <CategorySelect value={category} onChange={(c) => update((d) => ({ ...d, category: c, categoryLocked: true }))} />
        </label>
        <p className="small muted">Insights use each item's own category; this one labels the expense in lists.</p>
      </div>

      <button type="button" className="btn btn-share" onClick={shareCard} disabled={!split.ok || sharing}>
        <Icon name="share" size={18} /> {sharing ? 'Drawing card…' : 'Share bill card (WhatsApp-ready)'}
      </button>

      {onDelete && (
        <button type="button" className="btn btn-danger" onClick={onDelete}>
          <Icon name="trash" size={18} /> Delete receipt
        </button>
      )}

      <div className="fab-bar">
        <button type="button" className="btn btn-lg" onClick={onBack}>
          <Icon name="back" /> Assign
        </button>
        <button type="button" className="btn btn-primary btn-lg" disabled={!split.ok} onClick={onSave}>
          <Icon name="check" /> Save split
        </button>
      </div>
    </div>
  );
}
