import { useMemo } from 'react';
import { formatINR } from '../lib/money';
import { allocate, computeSplit } from '../lib/split';
import type { Member, SplitMode, SplitSpec } from '../lib/types';
import { Avatar } from './Avatar';
import { MoneyInput } from './MoneyInput';

const MODES: { id: SplitMode; label: string; hint: string }[] = [
  { id: 'equal', label: 'Equally', hint: 'Everyone ticked pays the same' },
  { id: 'exact', label: 'Exact ₹', hint: 'Type each amount — must add up to the bill' },
  { id: 'percent', label: '%', hint: 'Percentages must total 100%' },
  { id: 'shares', label: 'Shares', hint: 'Ratios such as 2 : 1 : 1' },
];

/** Sensible starting values when switching to a mode. */
export function defaultValues(mode: SplitMode, participants: string[], totalPaise: number): Record<string, number> {
  const n = participants.length;
  if (n === 0) return {};
  if (mode === 'exact') {
    const parts =
      totalPaise > 0
        ? allocate(
            totalPaise,
            participants.map(() => 1),
          )
        : participants.map(() => 0);
    return Object.fromEntries(participants.map((id, i) => [id, parts[i]]));
  }
  if (mode === 'percent') {
    const basis = allocate(
      10000,
      participants.map(() => 1),
    ); // hundredths of a percent
    return Object.fromEntries(participants.map((id, i) => [id, basis[i] / 100]));
  }
  if (mode === 'shares') return Object.fromEntries(participants.map((id) => [id, 1]));
  return {};
}

interface SplitEditorProps {
  members: Member[];
  totalPaise: number;
  value: SplitSpec;
  onChange: (spec: SplitSpec) => void;
  /** Restrict the available modes (e.g. no "exact" for a default split with no amount yet). */
  modes?: SplitMode[];
}

/** Choose a split mode and enter per-person values, with a live preview of every share. */
export function SplitEditor({ members, totalPaise, value, onChange, modes }: SplitEditorProps) {
  const result = useMemo(() => computeSplit(totalPaise, value), [totalPaise, value]);
  const { mode, participants, values } = value;

  const setMode = (m: SplitMode) => onChange({ mode: m, participants, values: defaultValues(m, participants, totalPaise) });
  const toggle = (id: string) => {
    const next = participants.includes(id)
      ? participants.filter((p) => p !== id)
      : members.map((m) => m.id).filter((m) => m === id || participants.includes(m));
    onChange({
      mode,
      participants: next,
      values: mode === 'equal' ? {} : { ...defaultValues(mode, next, totalPaise), ...(mode === 'shares' ? pick(values, next) : {}) },
    });
  };
  const setValue = (id: string, v: number) => onChange({ ...value, values: { ...values, [id]: v } });

  const sumExact = participants.reduce((s, id) => s + (values[id] ?? 0), 0);
  const sumPct = participants.reduce((s, id) => s + (values[id] ?? 0), 0);

  return (
    <div className="split-editor">
      <div className="segmented" role="radiogroup" aria-label="Split mode">
        {MODES.filter((m) => !modes || modes.includes(m.id)).map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={mode === m.id ? 'active' : ''} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="small muted">{MODES.find((m) => m.id === mode)!.hint}</p>

      <ul className="split-rows">
        {members.map((m) => {
          const on = participants.includes(m.id);
          const share = result.shares[m.id];
          return (
            <li key={m.id} className={`split-row${on ? '' : ' off'}`}>
              <label className="split-person">
                <input type="checkbox" checked={on} onChange={() => toggle(m.id)} />
                <Avatar member={m} size="sm" dim={!on} />
                <span>{m.name}</span>
              </label>
              {on && mode === 'exact' && (
                <MoneyInput value={values[m.id]} onChange={(p) => setValue(m.id, p ?? 0)} label={`${m.name}'s amount`} className="compact" />
              )}
              {on && (mode === 'percent' || mode === 'shares') && (
                <span className="num-input">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={mode === 'percent' ? 0.01 : 0.5}
                    value={values[m.id] ?? ''}
                    aria-label={`${m.name}'s ${mode === 'percent' ? 'percentage' : 'shares'}`}
                    onChange={(e) => setValue(m.id, e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
                  />
                  <span className="num-suffix">{mode === 'percent' ? '%' : '×'}</span>
                </span>
              )}
              <span className="split-share">{on && share !== undefined ? formatINR(share) : on ? '—' : ''}</span>
            </li>
          );
        })}
      </ul>

      {mode === 'exact' && totalPaise > 0 && (
        <p className={`small ${sumExact === totalPaise ? 'pos' : 'neg'}`}>
          {formatINR(sumExact)} of {formatINR(totalPaise)} assigned
          {sumExact !== totalPaise && ` · ${formatINR(Math.abs(totalPaise - sumExact))} ${sumExact < totalPaise ? 'left' : 'over'}`}
        </p>
      )}
      {mode === 'percent' && <p className={`small ${Math.abs(sumPct - 100) < 1e-6 ? 'pos' : 'neg'}`}>Total {Math.round(sumPct * 100) / 100}% of 100%</p>}
      {!result.ok && totalPaise > 0 && participants.length > 0 && mode !== 'exact' && mode !== 'percent' && <p className="small neg">{result.error}</p>}
    </div>
  );
}

function pick(values: Record<string, number>, ids: string[]) {
  return Object.fromEntries(ids.filter((id) => values[id] !== undefined).map((id) => [id, values[id]]));
}
