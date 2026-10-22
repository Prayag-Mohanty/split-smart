import { formatINR, type Paise } from '../lib/money';
import type { Member, MemberId } from '../lib/types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { MoneyInput } from './MoneyInput';

export interface PayerValue {
  payerId: MemberId;
  /** Set when several people paid: amount per person (may not add up yet while typing). */
  payers?: Record<MemberId, Paise>;
}

interface PayerPickerProps {
  members: Member[];
  meId?: MemberId;
  totalPaise: Paise;
  value: PayerValue;
  onChange: (value: PayerValue) => void;
}

/**
 * "Paid by": one person (tap a face) or several people with the amount each paid.
 * The parent validates that several amounts add up to the bill (see validatePayers).
 */
export function PayerPicker({ members, meId, totalPaise, value, onChange }: PayerPickerProps) {
  const label = (m: Member) => (m.id === meId ? `${m.name} (you)` : m.name);

  if (!value.payers) {
    return (
      <div className="stack">
        <div className="payer-picker" role="radiogroup" aria-label="Paid by">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={value.payerId === m.id}
              className={`payer${value.payerId === m.id ? ' selected' : ''}`}
              onClick={() => onChange({ payerId: m.id })}
            >
              <Avatar member={m} size="sm" />
              {label(m)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="link-btn"
          onClick={() => onChange({ payerId: value.payerId, payers: Object.fromEntries(members.map((m) => [m.id, m.id === value.payerId ? totalPaise : 0])) })}
        >
          <Icon name="users" size={14} /> Several people paid?
        </button>
      </div>
    );
  }

  const payers = value.payers;
  const entered = Object.values(payers).reduce((a, b) => a + b, 0);
  const left = totalPaise - entered;
  const setAmount = (id: MemberId, paise: Paise) => onChange({ payerId: value.payerId, payers: { ...payers, [id]: Math.max(0, paise) } });

  return (
    <div className="stack">
      <ul className="split-rows multi-payers">
        {members.map((m) => (
          <li key={m.id} className="split-row">
            <span className="split-person">
              <Avatar member={m} size="sm" dim={!payers[m.id]} />
              <span>{label(m)}</span>
            </span>
            <MoneyInput value={payers[m.id] || undefined} onChange={(p) => setAmount(m.id, p ?? 0)} label={`Amount ${m.name} paid`} className="compact" />
            {/* Fixed-width slot so the amount boxes line up whether or not "+ rest" is shown. */}
            <span className="payer-rest">
              {left > 0 && !payers[m.id] && (
                <button type="button" className="link-btn" onClick={() => setAmount(m.id, left)} title={`${m.name} paid the remaining ${formatINR(left)}`}>
                  + rest
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className={`small ${left === 0 ? 'pos' : 'neg'}`} aria-live="polite">
        {formatINR(entered)} of {formatINR(totalPaise)} entered
        {left !== 0 && ` · ${formatINR(Math.abs(left))} ${left > 0 ? 'left' : 'over'}`}
      </p>
      <button type="button" className="link-btn" onClick={() => onChange({ payerId: value.payerId })}>
        Only one person paid
      </button>
    </div>
  );
}
