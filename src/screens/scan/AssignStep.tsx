import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AnimatedAmount } from '../../components/AnimatedAmount';
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

interface DragState {
  itemId: string;
  label: string;
  x: number;
  y: number;
  overMember?: string;
}

/**
 * Tap faces to assign each item, or drag an item card onto a face in the dock.
 * Shared items are split equally between assignees.
 */
export function AssignStep({ group, draft, update, onBack, onNext }: AssignStepProps) {
  const order = useMemo(() => group.members.map((m) => m.id), [group.members]);
  const split = useMemo(() => computeItemizedSplit(draft.items, draft.adjustments, order), [draft.items, draft.adjustments, order]);
  const unassignedIds = new Set(split.unassigned.map((i) => i.id));
  const [drag, setDrag] = useState<DragState | null>(null);
  const [absorbed, setAbsorbed] = useState<string | null>(null);
  const pending = useRef<{ itemId: string; label: string; x: number; y: number; pointerId: number } | null>(null);

  const toggle = (itemId: string, memberId: string) =>
    update((d) => ({
      ...d,
      items: d.items.map((it) =>
        it.id !== itemId
          ? it
          : {
              ...it,
              assignees: it.assignees.includes(memberId)
                ? it.assignees.filter((a) => a !== memberId)
                : order.filter((m) => m === memberId || it.assignees.includes(m)),
            },
      ),
    }));
  const addAssignee = (itemId: string, memberId: string) =>
    update((d) => ({
      ...d,
      items: d.items.map((it) =>
        it.id !== itemId || it.assignees.includes(memberId) ? it : { ...it, assignees: order.filter((m) => m === memberId || it.assignees.includes(m)) },
      ),
    }));
  const setAll = (itemId: string, all: boolean) =>
    update((d) => ({ ...d, items: d.items.map((it) => (it.id === itemId ? { ...it, assignees: all ? [...order] : [] } : it)) }));
  const assignRemaining = () => update((d) => ({ ...d, items: d.items.map((it) => (it.assignees.length ? it : { ...it, assignees: [...order] })) }));

  // --- Drag an item onto a face (pointer events: works for touch, pen and mouse) ---
  const memberAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-member]') as HTMLElement | null)?.dataset.member;
  const onHandleDown = (e: ReactPointerEvent, itemId: string, label: string) => {
    pending.current = { itemId, label, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: ReactPointerEvent) => {
    const p = pending.current;
    if (!p) return;
    if (!drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
    setDrag({ itemId: p.itemId, label: p.label, x: e.clientX, y: e.clientY, overMember: memberAt(e.clientX, e.clientY) });
  };
  const onHandleUp = (e: ReactPointerEvent) => {
    const p = pending.current;
    pending.current = null;
    if (!p || !drag) {
      setDrag(null);
      return;
    }
    const target = memberAt(e.clientX, e.clientY);
    if (target) {
      addAssignee(p.itemId, target);
      setAbsorbed(target);
      navigator.vibrate?.(15);
      setTimeout(() => setAbsorbed(null), 450);
    }
    setDrag(null);
  };

  return (
    <div className="stack-lg assign-step">
      <div className="card stack">
        <h2 className="card-title">Who paid the bill?</h2>
        <div className="payer-picker" role="radiogroup" aria-label="Paid by">
          {group.members.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={draft.payerId === m.id}
              className={`payer${draft.payerId === m.id ? ' selected' : ''}`}
              onClick={() => update((d) => ({ ...d, payerId: m.id }))}
            >
              <Avatar member={m} size="sm" />
              {m.id === group.meId ? `${m.name} (you)` : m.name}
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
      <p className="small muted">
        Tap faces to assign each item. Shared items are split equally between the people you pick.{' '}
        <span className="desktop-hint">Or drag an item by its handle onto a face below.</span>
      </p>

      {split.unassigned.length > 0 && (
        <Banner tone="warn">
          {split.unassigned.length} item{split.unassigned.length > 1 ? 's are' : ' is'} not assigned to anyone yet.
        </Banner>
      )}

      <ul className="assign-list">
        {draft.items.map((it) => {
          const everyone = it.assignees.length === order.length;
          const each = it.assignees.length ? Math.floor(it.totalPaise / it.assignees.length) : 0;
          const label = it.name || 'Unnamed item';
          return (
            <li key={it.id} className={`card assign-item${unassignedIds.has(it.id) ? ' unassigned' : ''}${drag?.itemId === it.id ? ' dragging' : ''}`}>
              <div className="assign-top">
                <button
                  type="button"
                  className="drag-handle"
                  aria-label={`Drag ${label} onto a person`}
                  onPointerDown={(e) => onHandleDown(e, it.id, label)}
                  onPointerMove={onHandleMove}
                  onPointerUp={onHandleUp}
                  onPointerCancel={() => {
                    pending.current = null;
                    setDrag(null);
                  }}
                >
                  <span aria-hidden="true">⠿</span>
                </button>
                <div className="grow min0">
                  <strong className="assign-name">
                    {it.qty !== 1 && <span className="muted">{it.qty}× </span>}
                    {label}
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
                    <button
                      key={m.id}
                      type="button"
                      className={`avatar-toggle${on ? ' on' : ''}`}
                      aria-pressed={on}
                      aria-label={`${m.name} had ${it.name}`}
                      onClick={() => toggle(it.id, m.id)}
                    >
                      <Avatar member={m} dim={!on} />
                      <span className="avatar-toggle-name">{m.id === group.meId ? 'You' : m.name}</span>
                      {on && <Icon name="check" size={12} className="avatar-check" />}
                    </button>
                  );
                })}
              </div>
              <div className="assign-quick">
                <button type="button" className={`chip-btn${everyone ? ' active' : ''}`} aria-pressed={everyone} onClick={() => setAll(it.id, true)}>
                  {everyone ? <Icon name="check" size={14} /> : <Icon name="users" size={14} />} Everyone
                </button>
                {it.assignees.length > 0 && (
                  <button type="button" className="chip-btn chip-clear" onClick={() => setAll(it.id, false)} aria-label={`Clear who had ${label}`}>
                    <Icon name="close" size={14} /> Clear
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Running shares double as drop targets for dragged items. */}
      <div className={`card live-shares assign-dock${drag ? ' is-dragging' : ''}`} aria-live="polite">
        <h3 className="small muted">{drag ? `Drop “${drag.label}” on a person` : 'Running shares (incl. tax & charges)'}</h3>
        <ul>
          {group.members.map((m) => (
            <li key={m.id} data-member={m.id} className={`${drag?.overMember === m.id ? 'drop-over' : ''}${absorbed === m.id ? ' absorb' : ''}`}>
              <Avatar member={m} size="sm" />
              <span>{m.id === group.meId ? 'You' : m.name}</span>
              <strong>
                <AnimatedAmount paise={split.shares[m.id] ?? 0} />
              </strong>
            </li>
          ))}
        </ul>
      </div>

      {drag && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          {drag.label}
        </div>
      )}

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
