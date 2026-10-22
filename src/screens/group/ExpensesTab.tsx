import { useMemo, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { CATEGORY_META, EmptyState } from '../../components/ui';
import { formatINR } from '../../lib/money';
import { paidPhrase } from '../../lib/people';
import { expenseShares, expenseTotal } from '../../lib/split';
import { CATEGORIES, type Category, type Group } from '../../lib/types';

export function ExpensesTab({ group }: { group: Group }) {
  const [filter, setFilter] = useState<Category | 'All'>('All');
  const order = useMemo(() => group.members.map((m) => m.id), [group.members]);
  const byId = useMemo(() => new Map(group.members.map((m) => [m.id, m])), [group.members]);

  if (group.members.length === 0) {
    return (
      <EmptyState
        icon="users"
        title="Add people first"
        action={
          <a className="btn btn-primary" href={`#/g/${group.id}/settings`}>
            Add members
          </a>
        }
      >
        A group needs members before you can split anything.
      </EmptyState>
    );
  }

  const items = [...group.expenses]
    .filter((e) => filter === 'All' || e.category === filter)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  if (group.expenses.length === 0) {
    return (
      <EmptyState icon="receipt" title="No expenses yet">
        Scan a receipt to split it item by item, or add an expense manually.
      </EmptyState>
    );
  }

  // Group the list under date headings.
  const sections: { date: string; list: typeof items }[] = [];
  for (const e of items) {
    const last = sections[sections.length - 1];
    if (last && last.date === e.date) last.list.push(e);
    else sections.push({ date: e.date, list: [e] });
  }

  return (
    <>
      <div className="filter-row" role="radiogroup" aria-label="Filter by category">
        {(['All', ...CATEGORIES] as const).map((c) => (
          <button key={c} type="button" role="radio" aria-checked={filter === c} className={`chip-btn${filter === c ? ' active' : ''}`} onClick={() => setFilter(c)}>
            {c !== 'All' && <span aria-hidden="true">{CATEGORY_META[c].emoji} </span>}
            {c}
          </button>
        ))}
      </div>
      {sections.length === 0 && <p className="muted center">No {filter.toLowerCase()} expenses.</p>}
      {sections.map((s) => (
        <section key={s.date} className="expense-section">
          <h3 className="date-heading">{new Date(s.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</h3>
          <ul className="card list">
            {s.list.map((e) => {
              const payer = byId.get(e.payerId);
              const total = expenseTotal(e);
              const shares = expenseShares(e, order);
              const n = Object.keys(shares).length;
              const href = e.kind === 'itemized' ? `#/g/${group.id}/scan/${e.id}` : `#/g/${group.id}/expense/${e.id}`;
              return (
                <li key={e.id}>
                  <a className="list-row" href={href}>
                    <span className="cat-dot" style={{ background: CATEGORY_META[e.category].color }} aria-hidden="true">
                      {CATEGORY_META[e.category].emoji}
                    </span>
                    <span className="grow min0">
                      <span className="row-title">
                        {e.description}
                        {e.kind === 'itemized' && (
                          <span className="pill pill-neutral" title="Itemized receipt">
                            <Icon name="receipt" size={12} /> Itemised · {e.items.length}
                          </span>
                        )}
                        {e.recurringId && <Icon name="repeat" size={14} className="muted inline-icon" title="Recurring" />}
                      </span>
                      <span className="row-sub">
                        {payer && <Avatar member={payer} size="sm" />} {paidPhrase(group, e.payerId)} · split {n} way{n === 1 ? '' : 's'}
                        {n === 0 && <span className="error-text"> (needs fixing)</span>}
                      </span>
                    </span>
                    <span className="row-amount">{formatINR(total)}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
