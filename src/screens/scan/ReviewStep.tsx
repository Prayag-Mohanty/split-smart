import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Banner } from '../../components/ui';
import { gstLines, guessGstRate } from '../../lib/gst';
import { formatINR } from '../../lib/money';
import { checkTotals } from '../../lib/receiptParser';
import { signedAdjustment } from '../../lib/split';
import { newAdjustment, type Draft } from './draft';
import { AdjustmentsCard } from './review/AdjustmentsCard';
import { ItemsCard } from './review/ItemsCard';
import { ReceiptPanel } from './review/ReceiptPanel';
import { TotalsCard } from './review/TotalsCard';
import type { ScanImage } from './ScanFlow';

interface ReviewStepProps {
  draft: Draft;
  update: (fn: (d: Draft) => Draft) => void;
  image: ScanImage | null;
  categorizing: boolean;
  canRescan: boolean;
  onRotate: (delta: number) => void;
  onRetake: () => void;
  onManualFallback: () => void;
  onNext: () => void;
}

/**
 * Review the parsed receipt: fix fields against the photo, add or remove lines and make
 * the totals agree. This component owns the cross-card logic (totals check, GST, flags);
 * each card in ./review renders and edits one part of the draft.
 */
export function ReviewStep({ draft, update, image, categorizing, canRescan, onRotate, onRetake, onManualFallback, onNext }: ReviewStepProps) {
  const [activeLine, setActiveLine] = useState<number | undefined>();

  const check = useMemo(
    () =>
      checkTotals(
        draft.items.map((i) => i.totalPaise),
        draft.adjustments.map(signedAdjustment),
        draft.printedTotalPaise,
      ),
    [draft.items, draft.adjustments, draft.printedTotalPaise],
  );
  const lowCount = draft.items.filter((i) => i.low).length + draft.adjustments.filter((a) => a.low !== undefined).length + (draft.totalLow ? 1 : 0);
  const poorScan = !!image && (image.meanConfidence < 55 || (draft.items.length > 0 && draft.items.length < 2 && image.meanConfidence < 70));
  const noItems = draft.items.length === 0;

  /** The user has checked the highlighted fields: drop every low-confidence flag at once. */
  const clearFlags = () =>
    update((d) => ({
      ...d,
      items: d.items.map((i) => (i.low ? { ...i, low: undefined } : i)),
      adjustments: d.adjustments.map((a) => (a.low !== undefined ? { ...a, low: undefined } : a)),
      totalLow: undefined,
    }));
  const confirmComputed = () => update((d) => ({ ...d, printedTotalPaise: check.computedPaise, totalSource: 'confirmed', totalLow: undefined }));
  const addDifference = () =>
    update((d) => ({
      ...d,
      adjustments: [
        ...d.adjustments,
        newAdjustment(
          'other',
          Math.abs(check.differencePaise) < 100 ? 'Round off' : check.differencePaise > 0 ? 'Unmatched charges' : 'Unmatched reduction',
          check.differencePaise,
        ),
      ],
    }));

  // GST is charged on the items after any discount.
  const gstBase = check.itemsPaise + draft.adjustments.filter((a) => a.kind === 'discount').reduce((s, a) => s + signedAdjustment(a), 0);
  const setGst = (rate: number) =>
    update((d) => ({
      ...d,
      adjustments: [
        ...d.adjustments.filter((a) => a.kind !== 'tax'),
        ...gstLines(gstBase, rate).map((l) => newAdjustment('tax', l.label, l.amountPaise, l.ratePercent)),
      ],
    }));
  // If the printed total minus everything except tax looks like a GST slab, offer it.
  const taxPaise = draft.adjustments.filter((a) => a.kind === 'tax').reduce((sum, a) => sum + a.amountPaise, 0);
  const suggestedRate =
    draft.printedTotalPaise !== undefined && !check.matches ? guessGstRate(draft.printedTotalPaise - (check.computedPaise - taxPaise), gstBase) : undefined;

  const needsConfirm = !noItems && draft.totalSource === 'none';
  const mismatch = !noItems && draft.printedTotalPaise !== undefined && !check.matches;

  return (
    <div className="review-layout">
      <ReceiptPanel image={image} fromScan={draft.fromScan} activeLine={activeLine} canRescan={canRescan} onRotate={onRotate} onRetake={onRetake} />

      <section className="review-data stack" aria-label="Parsed receipt">
        {image && noItems && (
          <Banner tone="warn">
            <strong>No items found on this image.</strong> It may not be a receipt, or the photo is blurry or sideways. Try rotating or retaking it, or add the
            items by hand below.
          </Banner>
        )}
        {poorScan && !noItems && (
          <Banner tone="warn">
            This scan looks rough (average confidence {Math.round(image!.meanConfidence)}%). If the receipt is sideways, rotate it to re-scan — or just fix the
            highlighted fields.
          </Banner>
        )}
        {lowCount > 0 && (
          <Banner tone="info">
            {lowCount} field{lowCount > 1 ? 's' : ''} highlighted in yellow {lowCount > 1 ? 'were' : 'was'} hard to read. Please double-check{' '}
            {lowCount > 1 ? 'them' : 'it'}.
            <ul className="conf-help">
              <li>
                <strong>What the ? means:</strong> the scanner wasn't sure it read that field correctly. It's only a reminder — it never blocks you.
              </li>
              <li>
                <strong>Correct?</strong> Leave it as it is. Nothing else is needed.
              </li>
              <li>
                <strong>Wrong?</strong> Fix it by comparing with the photo — the ? disappears as soon as you edit the field.
              </li>
            </ul>
            <div className="banner-actions">
              <button type="button" className="btn btn-sm" onClick={clearFlags}>
                <Icon name="check" size={16} /> Everything looks right — clear all ?
              </button>
            </div>
          </Banner>
        )}

        <div className="card stack">
          <div className="grid-2">
            <label className="field">
              <span>Description</span>
              <input
                className="input"
                value={draft.description}
                onChange={(e) => update((d) => ({ ...d, description: e.target.value }))}
                placeholder="e.g. Night canteen"
                maxLength={80}
              />
            </label>
            <label className="field">
              <span>Date</span>
              <input type="date" className="input" value={draft.date} onChange={(e) => e.target.value && update((d) => ({ ...d, date: e.target.value }))} />
            </label>
          </div>
        </div>

        <ItemsCard draft={draft} update={update} activeLine={activeLine} setActiveLine={setActiveLine} categorizing={categorizing} />
        <AdjustmentsCard draft={draft} update={update} setActiveLine={setActiveLine} setGst={setGst} gstBase={gstBase} />
        <TotalsCard
          draft={draft}
          update={update}
          check={check}
          noItems={noItems}
          mismatch={mismatch}
          needsConfirm={needsConfirm}
          suggestedRate={suggestedRate}
          setGst={setGst}
          confirmComputed={confirmComputed}
          addDifference={addDifference}
        />

        {image && noItems && (
          <button type="button" className="btn" onClick={onManualFallback}>
            Start over with manual entry
          </button>
        )}
      </section>

      <div className="fab-bar">
        <button
          type="button"
          className={`btn btn-lg ${mismatch ? 'btn-warn' : 'btn-primary'}`}
          disabled={noItems || check.computedPaise <= 0}
          onClick={() => {
            if (needsConfirm) confirmComputed();
            onNext();
          }}
        >
          {needsConfirm ? `Confirm ${formatINR(check.computedPaise)} & assign` : mismatch ? 'Continue anyway' : 'Next: assign items'} <Icon name="arrowRight" />
        </button>
      </div>
    </div>
  );
}
