import { useMemo } from 'react';
import { Avatar } from '../../components/Avatar';
import { CATEGORY_META, EmptyState } from '../../components/ui';
import { spendByCategory, spendByMember, spendOverTime } from '../../lib/analytics';
import { formatINR } from '../../lib/money';
import { CATEGORIES, type Group } from '../../lib/types';

/** Spending analytics drawn with plain SVG/CSS — no chart library on the critical path. */
export function InsightsTab({ group }: { group: Group }) {
  const byCat = useMemo(() => spendByCategory(group), [group]);
  const byMember = useMemo(() => spendByMember(group), [group]);
  const timeline = useMemo(() => spendOverTime(group), [group]);

  if (group.expenses.length === 0) {
    return (
      <EmptyState icon="chart" title="No insights yet">
        Add a few expenses to see where the money goes.
      </EmptyState>
    );
  }

  const total = CATEGORIES.reduce((s, c) => s + Math.max(0, byCat[c]), 0) || 1;
  const cats = CATEGORIES.filter((c) => byCat[c] > 0).sort((a, b) => byCat[b] - byCat[a]);
  const memberMax = Math.max(1, ...byMember.flatMap((m) => [m.paid, m.consumed]));
  const timeMax = Math.max(1, ...timeline.map((t) => t.total));

  // Donut segments
  const R = 60;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="insights">
      <section className="card" aria-labelledby="cat-h">
        <h2 id="cat-h" className="card-title">
          By category
        </h2>
        <div className="donut-wrap">
          <svg viewBox="0 0 160 160" className="donut" role="img" aria-label={cats.map((c) => `${c} ${formatINR(byCat[c])}`).join(', ')}>
            <circle cx="80" cy="80" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="22" />
            {cats.map((c) => {
              const len = (byCat[c] / total) * C;
              const seg = (
                <circle
                  key={c}
                  cx="80"
                  cy="80"
                  r={R}
                  fill="none"
                  stroke={CATEGORY_META[c].color}
                  strokeWidth="22"
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 80 80)"
                />
              );
              offset += len;
              return seg;
            })}
            <text x="80" y="76" textAnchor="middle" className="donut-label">
              Total
            </text>
            <text x="80" y="96" textAnchor="middle" className="donut-value">
              {formatINR(total).replace(/\.\d\d$/, '')}
            </text>
          </svg>
          <ul className="legend">
            {cats.map((c) => (
              <li key={c}>
                <span className="legend-swatch" style={{ background: CATEGORY_META[c].color }} />
                <span className="grow">
                  {CATEGORY_META[c].emoji} {c}
                </span>
                <span className="muted small">{Math.round((byCat[c] / total) * 100)}%</span>
                <strong>{formatINR(byCat[c])}</strong>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card" aria-labelledby="mem-h">
        <h2 id="mem-h" className="card-title">
          By member
        </h2>
        <div className="legend-inline small">
          <span>
            <span className="legend-swatch paid" /> Paid
          </span>
          <span>
            <span className="legend-swatch share" /> Their share
          </span>
        </div>
        <ul className="member-bars">
          {byMember.map((m) => {
            const member = group.members.find((x) => x.id === m.memberId)!;
            return (
              <li key={m.memberId}>
                <Avatar member={member} size="sm" />
                <div className="grow">
                  <div className="bar-label">
                    <span>{member.name}</span>
                    <span className="muted small">
                      {formatINR(m.paid)} / {formatINR(m.consumed)}
                    </span>
                  </div>
                  <div className="hbar">
                    <span className="hbar-fill paid" style={{ width: `${(m.paid / memberMax) * 100}%` }} />
                  </div>
                  <div className="hbar">
                    <span className="hbar-fill share" style={{ width: `${(m.consumed / memberMax) * 100}%` }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card" aria-labelledby="time-h">
        <h2 id="time-h" className="card-title">
          Over time
        </h2>
        <div className="columns" role="img" aria-label={timeline.filter((t) => t.total).map((t) => `${t.label}: ${formatINR(t.total)}`).join(', ')}>
          {timeline.map((t) => (
            <div key={t.key} className="column" title={`${t.label}: ${formatINR(t.total)}`}>
              <span className="column-fill" style={{ height: `${(t.total / timeMax) * 100}%` }} />
              <span className="column-label">{t.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
