import { Icon } from '../../../components/Icon';
import { MoneyInput } from '../../../components/MoneyInput';
import { GST_RATES } from '../../../lib/gst';
import { formatINR } from '../../../lib/money';
import type { AdjustmentKind } from '../../../lib/types';
import { newAdjustment, rateBase, type Draft, type DraftAdjustment } from '../draft';

const KIND_LABEL: Record<AdjustmentKind, string> = { tax: 'Tax / GST', service: 'Service charge', discount: 'Discount', other: 'Other / round-off' };
const PERCENT_IN_LABEL = /\d+(?:\.\d+)?\s*%/;

interface AdjustmentsCardProps {
  draft: Draft;
  update: (fn: (d: Draft) => Draft) => void;
  setActiveLine: (line: number | undefined) => void;
  /** Replace any tax lines with CGST + SGST at a standard GST rate. */
  setGst: (rate: number) => void;
  gstBase: number;
}

/** Tax, service charge, discount and round-off lines, plus one-tap GST. */
export function AdjustmentsCard({ draft, update, setActiveLine, setGst, gstBase }: AdjustmentsCardProps) {
  const setAdj = (id: string, patch: Partial<DraftAdjustment>) =>
    update((d) => ({ ...d, adjustments: d.adjustments.map((a) => (a.id === id ? { ...a, ...patch, low: undefined } : a)) }));
  const add = (kind: AdjustmentKind, label: string) => update((d) => ({ ...d, adjustments: [...d.adjustments, newAdjustment(kind, label)] }));
  const base = rateBase(draft);
  const hasTax = draft.adjustments.some((a) => a.kind === 'tax');

  return (
    <div className="card stack">
      <h2 className="card-title">Tax, charges & discounts</h2>
      {draft.adjustments.length === 0 && <p className="small muted">None detected. Add GST, service charge or a discount if the bill has them.</p>}
      <ul className="adj-rows">
        {draft.adjustments.map((a) => (
          <li key={a.id} className="adj-row" onFocusCapture={() => setActiveLine(a.line)}>
            <select
              className="select select-compact"
              value={a.kind}
              aria-label="Type"
              onChange={(e) => {
                const kind = e.target.value as AdjustmentKind;
                const amountPaise = kind === 'discount' ? -Math.abs(a.amountPaise) : kind === 'other' ? a.amountPaise : Math.abs(a.amountPaise);
                setAdj(a.id, { kind, amountPaise });
              }}
            >
              {(Object.keys(KIND_LABEL) as AdjustmentKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <input className="input" value={a.label} aria-label="Label" onChange={(e) => setAdj(a.id, { label: e.target.value })} />
            <MoneyInput
              value={a.kind === 'discount' ? Math.abs(a.amountPaise) : a.amountPaise}
              allowNegative={a.kind === 'other'}
              label={`${a.label} amount`}
              lowConfidence={a.low}
              // Typing an amount by hand makes it a fixed amount (no longer a % of the items).
              onChange={(p) => setAdj(a.id, { amountPaise: a.kind === 'discount' ? -Math.abs(p ?? 0) : (p ?? 0), ratePercent: undefined })}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={`Delete ${a.label}`}
              onClick={() => update((d) => ({ ...d, adjustments: d.adjustments.filter((x) => x.id !== a.id) }))}
            >
              <Icon name="trash" size={18} />
            </button>
            {a.kind !== 'discount' &&
              (a.ratePercent !== undefined ? (
                <div className="adj-rate small">
                  <span className="num-input">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={a.ratePercent}
                      aria-label={`${a.label} rate in percent`}
                      onChange={(e) => {
                        const rate = Math.max(0, Number(e.target.value) || 0);
                        // Keep a label like "CGST 2.5%" in step with the new rate.
                        const label = PERCENT_IN_LABEL.test(a.label) ? a.label.replace(PERCENT_IN_LABEL, `${rate}%`) : a.label;
                        setAdj(a.id, { ratePercent: rate, label });
                      }}
                    />
                    <span className="num-suffix">%</span>
                  </span>
                  <span className="muted">of {formatINR(base)} items — updates automatically when you add, remove or edit items.</span>
                </div>
              ) : (
                a.kind !== 'other' &&
                base > 0 && (
                  <button
                    type="button"
                    className="link-btn adj-rate"
                    onClick={() => setAdj(a.id, { ratePercent: Math.round((Math.abs(a.amountPaise) / base) * 10000) / 100 })}
                  >
                    Keep this as a % of the items instead
                  </button>
                )
              ))}
          </li>
        ))}
      </ul>
      <div className="row-wrap">
        <button type="button" className="btn btn-sm" onClick={() => add('tax', 'GST')}>
          <Icon name="plus" size={16} /> Tax
        </button>
        <button type="button" className="btn btn-sm" onClick={() => add('service', 'Service charge')}>
          <Icon name="plus" size={16} /> Service charge
        </button>
        <button type="button" className="btn btn-sm" onClick={() => add('discount', 'Discount')}>
          <Icon name="plus" size={16} /> Discount
        </button>
      </div>
      <div className="row-wrap gst-quick" role="group" aria-label="Set GST">
        <span className="small muted">{hasTax ? 'Replace tax with GST:' : 'Bill had GST? Add CGST + SGST:'}</span>
        {GST_RATES.slice(0, 3).map((r) => (
          <button
            key={r}
            type="button"
            className="chip-btn"
            onClick={() => setGst(r)}
            disabled={gstBase <= 0}
            title={`CGST ${r / 2}% + SGST ${r / 2}% on ${formatINR(gstBase)}`}
          >
            {r}%
          </button>
        ))}
      </div>
    </div>
  );
}
