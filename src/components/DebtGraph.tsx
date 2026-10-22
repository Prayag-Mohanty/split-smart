import { useEffect, useMemo, useRef, useState } from 'react';
import { formatINR } from '../lib/money';
import type { Transfer } from '../lib/settle';
import type { Member } from '../lib/types';
import { initials } from './Avatar';
import { Icon } from './Icon';

interface DebtGraphProps {
  members: Member[];
  /** Every IOU as it arose (before simplification). */
  before: Transfer[];
  /** The minimum set of payments. */
  after: Transfer[];
  meId?: string;
}

const SIZE = 320;
const NODE_R = 22;

/**
 * "Watch the debts shrink": members sit on a circle; the tangle of original IOUs collapses
 * into the few payments that actually settle everything. Plays once when scrolled into
 * view, then can be toggled. Purely decorative for screen readers, which get the caption.
 */
export function DebtGraph({ members, before, after, meId }: DebtGraphProps) {
  const [simplified, setSimplified] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const played = useRef(false);

  const pos = useMemo(() => {
    const c = SIZE / 2;
    const r = SIZE / 2 - NODE_R - 26;
    return new Map(
      members.map((m, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, members.length);
        return [m.id, { x: c + r * Math.cos(a), y: c + r * Math.sin(a) }];
      }),
    );
  }, [members]);

  useEffect(() => {
    const el = ref.current;
    if (!el || played.current) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || played.current) return;
        played.current = true;
        io.disconnect();
        if (reduce) setSimplified(true);
        else setTimeout(() => setSimplified(true), 1400);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (before.length === 0 || members.length < 2) return null;

  const edge = (t: Transfer, i: number, kind: 'before' | 'after') => {
    const a = pos.get(t.fromId);
    const b = pos.get(t.toId);
    if (!a || !b) return null;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const sx = a.x + ux * (NODE_R + 2);
    const sy = a.y + uy * (NODE_R + 2);
    const ex = b.x - ux * (NODE_R + 8);
    const ey = b.y - uy * (NODE_R + 8);
    // Bend each curve slightly so parallel-ish edges don't overlap.
    const bend = kind === 'before' ? 18 : 10;
    const mx = (sx + ex) / 2 - uy * bend;
    const my = (sy + ey) / 2 + ux * bend;
    const d = `M${sx},${sy} Q${mx},${my} ${ex},${ey}`;
    return (
      <g key={`${kind}-${i}`} className={`debt-edge ${kind}`} style={{ ['--i' as string]: i }}>
        <path d={d} pathLength={1} markerEnd={`url(#arrow-${kind})`} />
        {kind === 'after' && (
          <text x={mx} y={my - 4} textAnchor="middle" className="debt-label">
            {formatINR(t.amountPaise, { compact: true })}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="card debt-graph" ref={ref}>
      <div className="section-head tight">
        <h2 className="card-title">Watch the debts shrink</h2>
        <button type="button" className="btn btn-sm" onClick={() => setSimplified((s) => !s)} aria-pressed={simplified}>
          <Icon name={simplified ? 'rotateL' : 'sparkle'} size={16} /> {simplified ? 'Show original IOUs' : 'Simplify'}
        </button>
      </div>
      <p className="debt-caption" aria-live="polite">
        <strong className={simplified ? 'muted strike' : ''}>
          {before.length} IOU{before.length === 1 ? '' : 's'}
        </strong>{' '}
        → <strong className={simplified ? 'pos' : 'muted'}>{after.length} payment{after.length === 1 ? '' : 's'}</strong>
        <span className="muted small"> — the fewest possible, found exactly.</span>
      </p>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={`debt-svg${simplified ? ' is-simplified' : ''}`} aria-hidden="true">
        <defs>
          {(['before', 'after'] as const).map((k) => (
            <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className={`debt-arrow ${k}`} />
            </marker>
          ))}
        </defs>
        {before.map((t, i) => edge(t, i, 'before'))}
        {after.map((t, i) => edge(t, i, 'after'))}
        {members.map((m) => {
          const p = pos.get(m.id)!;
          return (
            <g key={m.id} transform={`translate(${p.x},${p.y})`}>
              <circle r={NODE_R} fill={m.color} />
              <text textAnchor="middle" dy="0.35em" className="debt-node-text">
                {m.emoji || initials(m.name)}
              </text>
              <text textAnchor="middle" y={NODE_R + 14} className="debt-node-name">
                {m.id === meId ? 'You' : m.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
