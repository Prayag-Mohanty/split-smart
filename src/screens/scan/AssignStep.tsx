import { useMemo } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { Banner } from '../../components/ui';
import { formatINR } from '../../lib/money';
import { computeItemizedSplit } from '../../lib/split';
import type { Group } from '../../lib/types';
import type { Draft } from './draft';

interface AssignStepProps {
  group: Group;
  draft: Draft;
  update: (fn: (d: Draft) => Draft) => void;
  onBack: () => void;
  onNext: () => void;
}

/** Tap avatars to say who shared each item. Shared items are split equally between assignees. */
export function AssignStep({ group, draft, update, onBack, onNext }: AssignStepProps) {
  const order = useMemo(() => group.members.map((m) => m.id), [group.members]);
  const split = useMemo(() => computeItemizedSplit(draft.items, draft.adjustments, order), [draft.items, draft.adjustments, order]);
  const unassignedIds = new Set(split.unassigned.map((i) => i.id));

  const toggle = (itemId: string, memberId: string) =>
    update((d) => ({
      ...d,
      items: d.items.map((it) =>
        it.id !== itemId ? it : { ...it, assignees: it.assignees.includes(memberId) ? it.assignees.filter((a) => a !== memberId) : order.filter((m) => m === memberId || it.assignees.includes(m)) },
      ),
    }));
  const setAll = (itemId: string, all: boolean) => update((d) => ({ ...d, items: d.items.map((it) => (it.id === itemId ? { ...it, assignees: all ? [...order] : [] } : it)) }));
  const assignRemaining = () => update((d) => ({ ...d, items: d.items.map((it) => (it.assignees.length ? it : { ...it, assignees: [...order] })) }));

  return (
    <div className="stack-lg">
      <div className="card stack">
        <h2 className="card-title">Who paid the bill?</h2>
        <div className="payer-picker" role="radiogroup" aria-label="Paid by">
          {group.members.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={draft.payerId === m.id} className={`payer${draft.payerId === m.id ? ' selected' : ''}`} onClick={() => update((d) => ({ ...d, payerId: m.id }))}>
              <Avatar member={m} size="sm" />
              {m.name}
            </button>
          ))}
        </div>
      </div>

      <div className="section-head">
        <h2 className="section-title">Who had what?</h2>
        {split.unassigned.length > 0 && (
          <button type="button" className="btn btn-sm" onClick={assignRemaining}>
            <Icon name="users" size={16} /> Share the rest with everyone
          </button>
        )}
      </div>
      <p className="small muted">Tap faces to assign each item. Shared items are split equally between the people you pick.</p>

      {split.unassigned.length > 0 && (
        <Banner tone="warn">
          {split.unassigned.length} item{split.unassigned.length > 1 ? 's are' : ' is'} not assigned to anyone yet.
        </Banner>
      )}

      <ul className="assign-list">
        {draft.items.map((it) => {
          const everyone = it.assignees.length === order.length;
          const each = it.assignees.length ? Math.floor(it.totalPaise / it.assignees.length) : 0;
          return (
            <li key={it.id} className={`card assign-item${unassignedIds.has(it.id) ? ' unassigned' : ''}`}>
              <div className="assign-top">
                <div className="grow min0">
                  <strong className="assign-name">
                    {it.qty !== 1 && <span className="muted">{it.qty}× </span>}
                    {it.name || 'Unnamed item'}
                  </strong>
                  <span className="small muted">
                    {unassignedIds.has(it.id) ? (
                      <span className="neg">Not assigned</span>
                    ) : it.assignees.length > 1 ? (
                      `${it.assignees.length} people · ~${formatINR(each)} each`
                    ) : (
                      group.members.find((m) => m.id === it.assignees[0])?.name
                    )}
                  </span>
                </div>
                <strong>{formatINR(it.totalPaise)}</strong>
              </div>
              <div className="assign-avatars" role="group" aria-label={`Who shared ${it.name}`}>
                {group.members.map((m) => {
                  const on = it.assignees.includes(m.id);
                  return (
                    <button key={m.id} type="button" className={`avatar-toggle${on ? ' on' : ''}`} aria-pressed={on} aria-label={`${m.name} had ${it.name}`} onClick={() => toggle(it.id, m.id)}>
                      <Avatar member={m} dim={!on} />
                      <span className="avatar-toggle-name">{m.name}</span>
                      {on && <Icon name="check" size={12} className="avatar-check" />}
                    </button>
                  );
                })}
                <button type="button" className={`avatar-toggle all${everyone ? ' on' : ''}`} aria-pressed={everyone} onClick={() => setAll(it.id, !everyone)}>
                  <span className="avatar avatar-md avatar-all">
                    <Icon name="users" size={18} />
                  </span>
                  <span className="avatar-toggle-name">{everyone ? 'Clear' : 'Everyone'}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="card live-shares" aria-live="polite">
        <h3 className="small muted">Running shares (incl. tax & charges)</h3>
        <ul>
          {group.members.map((m) => (
            <li key={m.id}>
              <Avatar member={m} size="sm" />
              <span>{m.name}</span>
              <strong>{formatINR(split.shares[m.id] ?? 0)}</strong>
            </li>
          ))}
        </ul>
      </div>

      <div className="fab-bar">
        <button type="button" className="btn btn-lg" onClick={onBack}>
          <Icon name="back" /> Review
        </button>
        <button type="button" className="btn btn-primary btn-lg" disabled={split.unassigned.length > 0 || !split.ok} onClick={onNext}>
          See split <Icon name="arrowRight" />
        </button>
      </div>
    </div>
  );
}
