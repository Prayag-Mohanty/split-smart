import { Icon } from '../../../components/Icon';
import { MoneyInput } from '../../../components/MoneyInput';
import { Banner } from '../../../components/ui';
import { formatINR } from '../../../lib/money';
import type { TotalCheck } from '../../../lib/receiptParser';
import type { Draft } from '../draft';

interface TotalsCardProps {
  draft: Draft;
  update: (fn: (d: Draft) => Draft) => void;
  check: TotalCheck;
  noItems: boolean;
  mismatch: boolean;
  needsConfirm: boolean;
  /** A GST slab that would explain the gap to the printed total, if any. */
  suggestedRate?: number;
  setGst: (rate: number) => void;
  confirmComputed: () => void;
  addDifference: () => void;
}

/** Calculated vs printed total, with one-tap fixes when they don't match. */
export function TotalsCard({ draft, update, check, noItems, mismatch, needsConfirm, suggestedRate, setGst, confirmComputed, addDifference }: TotalsCardProps) {
  return (
    <div className="card stack totals-card">
      <dl className="totals">
        <div>
          <dt>Items</dt>
          <dd>{formatINR(check.itemsPaise)}</dd>
        </div>
        <div>
          <dt>Tax, charges & discounts</dt>
          <dd>{formatINR(check.adjustmentsPaise, { sign: true })}</dd>
        </div>
        <div className="totals-strong">
          <dt>Calculated total</dt>
          <dd>{formatINR(check.computedPaise)}</dd>
        </div>
      </dl>
      <div className="field">
        <label htmlFor="printed-total">Total printed on receipt</label>
        <MoneyInput
          id="printed-total"
          value={draft.printedTotalPaise}
          lowConfidence={draft.totalLow}
          onChange={(p) => update((d) => ({ ...d, printedTotalPaise: p, totalSource: p === undefined ? 'none' : 'confirmed', totalLow: undefined }))}
          placeholder="Not detected"
        />
      </div>
      {!noItems && draft.printedTotalPaise !== undefined && check.matches && (
        <Banner tone="ok">
          Items {check.adjustmentsPaise ? '+ tax & charges ' : ''}match the {draft.totalSource === 'printed' ? 'printed' : 'confirmed'} total of {formatINR(draft.printedTotalPaise)}.
        </Banner>
      )}
      {mismatch && (
        <Banner tone="warn">
          <strong>
            Doesn't add up: {formatINR(Math.abs(check.differencePaise))} {check.differencePaise > 0 ? 'missing' : 'extra'}.
          </strong>{' '}
          The items and charges come to {formatINR(check.computedPaise)} but the receipt says {formatINR(draft.printedTotalPaise!)}. Check the highlighted fields, or:
          <div className="row-wrap banner-actions">
            {suggestedRate !== undefined && (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setGst(suggestedRate)}>
                Looks like {suggestedRate}% GST — add CGST + SGST
              </button>
            )}
            <button type="button" className="btn btn-sm" onClick={addDifference}>
              Add {formatINR(check.differencePaise, { sign: true })} as a line
            </button>
            <button type="button" className="btn btn-sm" onClick={confirmComputed}>
              Use {formatINR(check.computedPaise)} as the total
            </button>
          </div>
        </Banner>
      )}
      {needsConfirm && (
        <Banner tone="info">
          No total was found on the receipt. We calculated <strong>{formatINR(check.computedPaise)}</strong> from the items — please confirm it matches the bill.
          <div className="row-wrap banner-actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={confirmComputed}>
              <Icon name="check" size={16} /> Confirm {formatINR(check.computedPaise)}
            </button>
          </div>
        </Banner>
      )}
    </div>
  );
}
