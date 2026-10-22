import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { MoneyInput } from '../../components/MoneyInput';
import { Banner, CategorySelect } from '../../components/ui';
import { useClassifierStatus } from '../../hooks/useCategorizer';
import { GST_RATES, gstLines, guessGstRate } from '../../lib/gst';
import { formatINR } from '../../lib/money';
import { checkTotals, LOW_CONFIDENCE } from '../../lib/receiptParser';
import { signedAdjustment } from '../../lib/split';
import type { AdjustmentKind } from '../../lib/types';
import { newAdjustment, newItem, type Draft, type DraftAdjustment, type DraftItem } from './draft';
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

const KIND_LABEL: Record<AdjustmentKind, string> = { tax: 'Tax / GST', service: 'Service charge', discount: 'Discount', other: 'Other / round-off' };

export function ReviewStep({ draft, update, image, categorizing, canRescan, onRotate, onRetake, onManualFallback, onNext }: ReviewStepProps) {
  const [activeLine, setActiveLine] = useState<number | undefined>();
  const [showImage, setShowImage] = useState(true);
  const { status, progress } = useClassifierStatus();

  const check = useMemo(
    () => checkTotals(draft.items.map((i) => i.totalPaise), draft.adjustments.map(signedAdjustment), draft.printedTotalPaise),
    [draft.items, draft.adjustments, draft.printedTotalPaise],
  );
  const lowCount = draft.items.filter((i) => i.low).length + draft.adjustments.filter((a) => a.low !== undefined).length + (draft.totalLow ? 1 : 0);
  const poorScan = !!image && (image.meanConfidence < 55 || (draft.items.length > 0 && draft.items.length < 2 && image.meanConfidence < 70));
  const noItems = draft.items.length === 0;

  const setItem = (id: string, patch: Partial<DraftItem>, clear?: keyof NonNullable<DraftItem['low']>) =>
    update((d) => ({
      ...d,
      items: d.items.map((it) => {
        if (it.id !== id) return it;
        const next = { ...it, ...patch };
        if (clear && next.low) {
          const low = { ...next.low, [clear]: undefined };
          next.low = low.name || low.qty || low.price ? low : undefined;
        }
        return next;
      }),
    }));
  const setAdj = (id: string, patch: Partial<DraftAdjustment>) => update((d) => ({ ...d, adjustments: d.adjustments.map((a) => (a.id === id ? { ...a, ...patch, low: undefined } : a)) }));

  const confirmComputed = () => update((d) => ({ ...d, printedTotalPaise: check.computedPaise, totalSource: 'confirmed', totalLow: undefined }));
  const addDifference = () =>
    update((d) => ({
      ...d,
      adjustments: [
        ...d.adjustments,
        newAdjustment('other', Math.abs(check.differencePaise) < 100 ? 'Round off' : check.differencePaise > 0 ? 'Unmatched charges' : 'Unmatched reduction', check.differencePaise),
      ],
    }));

  // GST is charged on the items after any discount.
  const gstBase = check.itemsPaise + draft.adjustments.filter((a) => a.kind === 'discount').reduce((s, a) => s + signedAdjustment(a), 0);
  const hasTax = draft.adjustments.some((a) => a.kind === 'tax');
  /** Replace any tax lines with CGST + SGST at a standard GST rate. */
  const setGst = (rate: number) =>
    update((d) => ({
      ...d,
      adjustments: [...d.adjustments.filter((a) => a.kind !== 'tax'), ...gstLines(gstBase, rate).map((l) => newAdjustment('tax', l.label, l.amountPaise))],
    }));
  // If the printed total minus everything except tax looks like a GST slab, offer it.
  const taxPaise = draft.adjustments.filter((a) => a.kind === 'tax').reduce((sum, a) => sum + a.amountPaise, 0);
  const suggestedRate =
    draft.printedTotalPaise !== undefined && !check.matches ? guessGstRate(draft.printedTotalPaise - (check.computedPaise - taxPaise), gstBase) : undefined;

  const needsConfirm = !noItems && draft.totalSource === 'none';
  const mismatch = !noItems && draft.printedTotalPaise !== undefined && !check.matches;

  return (
    <div className="review-layout">
      <aside className="review-image" aria-label="Original receipt">
        {image ? (
          <div className="card">
            <div className="review-image-head">
              <strong>Original</strong>
              <button type="button" className="btn btn-sm btn-ghost hide-desktop" onClick={() => setShowImage((s) => !s)} aria-expanded={showImage}>
                {showImage ? 'Hide' : 'Show'}
              </button>
            </div>
            {showImage && (
              <>
                <div className="image-stage">
                  <img src={image.url} alt="Scanned receipt" />
                  <svg viewBox={`0 0 ${image.width} ${image.height}`} className="ocr-overlay" aria-hidden="true">
                    {image.lines.flatMap((l, li) =>
                      l.words
                        .filter((w) => w.bbox && w.confidence < LOW_CONFIDENCE)
                        .map((w, wi) => <rect key={`${li}-${wi}`} className="ocr-low" x={w.bbox!.x0} y={w.bbox!.y0} width={w.bbox!.x1 - w.bbox!.x0} height={w.bbox!.y1 - w.bbox!.y0} rx={4} />),
                    )}
                    {activeLine !== undefined && image.lines[activeLine]?.bbox && (
                      <rect
                        className="ocr-active"
                        x={image.lines[activeLine].bbox!.x0 - 6}
                        y={image.lines[activeLine].bbox!.y0 - 4}
                        width={image.lines[activeLine].bbox!.x1 - image.lines[activeLine].bbox!.x0 + 12}
                        height={image.lines[activeLine].bbox!.y1 - image.lines[activeLine].bbox!.y0 + 8}
                        rx={6}
                      />
                    )}
                  </svg>
                </div>
                <div className="preview-tools" role="toolbar" aria-label="Image tools">
                  <button type="button" className="btn btn-sm" onClick={() => onRotate(-90)} disabled={!canRescan} aria-label="Rotate left and re-scan">
                    <Icon name="rotateL" size={16} />
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => onRotate(90)} disabled={!canRescan} aria-label="Rotate right and re-scan">
                    <Icon name="rotateR" size={16} />
                  </button>
                  <button type="button" className="btn btn-sm" onClick={onRetake}>
                    <Icon name="camera" size={16} /> Retake
                  </button>
                </div>
                <p className="small muted legend-inline">
                  <span className="legend-swatch low" /> low-confidence words · tap a row to locate it
                </p>
                <details className="small raw-text">
                  <summary>Raw OCR text</summary>
                  <pre>{image.lines.map((l) => l.text).join('\n') || '(no text found)'}</pre>
                </details>
              </>
            )}
          </div>
        ) : (
          draft.fromScan === false && (
            <div className="card muted small">
              <Icon name="image" /> Receipt photos are never stored — only the items you saved.
            </div>
          )
        )}
      </aside>

      <section className="review-data stack" aria-label="Parsed receipt">
        {image && noItems && (
          <Banner tone="warn">
            <strong>No items found on this image.</strong> It may not be a receipt, or the photo is blurry or sideways. Try rotating or retaking it, or add the items by hand below.
          </Banner>
        )}
        {poorScan && !noItems && (
          <Banner tone="warn">
            This scan looks rough (average confidence {Math.round(image!.meanConfidence)}%). If the receipt is sideways, rotate it to re-scan — or just fix the highlighted fields.
          </Banner>
        )}
        {lowCount > 0 && (
          <Banner tone="info">
            {lowCount} field{lowCount > 1 ? 's' : ''} highlighted in yellow {lowCount > 1 ? 'were' : 'was'} hard to read. Please double-check {lowCount > 1 ? 'them' : 'it'}.
          </Banner>
        )}

        <div className="card stack">
          <div className="grid-2">
            <label className="field">
              <span>Description</span>
              <input className="input" value={draft.description} onChange={(e) => update((d) => ({ ...d, description: e.target.value }))} placeholder="e.g. Night canteen" maxLength={80} />
            </label>
            <label className="field">
              <span>Date</span>
              <input type="date" className="input" value={draft.date} onChange={(e) => e.target.value && update((d) => ({ ...d, date: e.target.value }))} />
            </label>
          </div>
        </div>

        <div className="card stack">
          <div className="section-head tight">
            <h2 className="card-title">Items ({draft.items.length})</h2>
            {(categorizing || status === 'loading') && (
              <span className="pill pill-info" aria-live="polite">
                <Icon name="sparkle" size={14} /> {status === 'loading' ? `Loading AI categoriser ${Math.round(progress * 100)}%` : 'Categorising…'}
              </span>
            )}
          </div>
          <div className="items-head" aria-hidden="true">
            <span>Item</span>
            <span>Qty</span>
            <span>Unit price</span>
            <span>Total</span>
            <span>Category</span>
            <span />
          </div>
          <ul className="item-rows">
            {draft.items.map((it, idx) => (
              <li key={it.id} className={`item-row${activeLine !== undefined && it.line === activeLine ? ' active' : ''}`} onFocusCapture={() => setActiveLine(it.line)} onClick={() => setActiveLine(it.line)}>
                <input
                  className={`input item-name${it.low?.name !== undefined ? ' low-conf' : ''}`}
                  value={it.name}
                  aria-label={`Item ${idx + 1} name`}
                  title={it.low?.name !== undefined ? `Low OCR confidence (${it.low.name}%)` : undefined}
                  placeholder="Item name"
                  onChange={(e) => setItem(it.id, { name: e.target.value }, 'name')}
                />
                <input
                  className={`input item-qty${it.low?.qty !== undefined ? ' low-conf' : ''}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={it.qty}
                  aria-label={`Item ${idx + 1} quantity`}
                  onChange={(e) => {
                    const qty = Math.max(0, Number(e.target.value) || 0);
                    setItem(it.id, { qty, totalPaise: Math.round(qty * it.unitPaise) }, 'qty');
                  }}
                />
                <MoneyInput
                  className="item-unit"
                  value={it.unitPaise}
                  label={`Item ${idx + 1} unit price`}
                  lowConfidence={it.low?.price}
                  onChange={(p) => setItem(it.id, { unitPaise: p ?? 0, totalPaise: Math.round((p ?? 0) * it.qty) }, 'price')}
                />
                <MoneyInput
                  className="item-total"
                  value={it.totalPaise}
                  label={`Item ${idx + 1} line total`}
                  lowConfidence={it.low?.price}
                  onChange={(p) => setItem(it.id, { totalPaise: p ?? 0, unitPaise: it.qty ? Math.round((p ?? 0) / it.qty) : p ?? 0 }, 'price')}
                />
                <CategorySelect compact label={`Item ${idx + 1} category`} value={it.category} onChange={(c) => setItem(it.id, { category: c, categoryLocked: true })} />
                <button type="button" className="icon-btn" aria-label={`Delete ${it.name || `item ${idx + 1}`}`} onClick={() => update((d) => ({ ...d, items: d.items.filter((x) => x.id !== it.id) }))}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-ghost" onClick={() => update((d) => ({ ...d, items: [...d.items, newItem()] }))}>
            <Icon name="plus" size={18} /> Add item
          </button>
        </div>

        <div className="card stack">
          <h2 className="card-title">Tax, charges & discounts</h2>
          {draft.adjustments.length === 0 && <p className="small muted">None detected. Add GST, service charge or a discount if the bill has them.</p>}
          <ul className="adj-rows">
            {draft.adjustments.map((a) => (
              <li key={a.id} className="adj-row" onFocusCapture={() => setActiveLine(a.line)}>
                <select className="select select-compact" value={a.kind} aria-label="Type" onChange={(e) => {
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
                  onChange={(p) => setAdj(a.id, { amountPaise: a.kind === 'discount' ? -Math.abs(p ?? 0) : p ?? 0 })}
                />
                <button type="button" className="icon-btn" aria-label={`Delete ${a.label}`} onClick={() => update((d) => ({ ...d, adjustments: d.adjustments.filter((x) => x.id !== a.id) }))}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
          <div className="row-wrap">
            <button type="button" className="btn btn-sm" onClick={() => update((d) => ({ ...d, adjustments: [...d.adjustments, newAdjustment('tax', 'GST')] }))}>
              <Icon name="plus" size={16} /> Tax
            </button>
            <button type="button" className="btn btn-sm" onClick={() => update((d) => ({ ...d, adjustments: [...d.adjustments, newAdjustment('service', 'Service charge')] }))}>
              <Icon name="plus" size={16} /> Service charge
            </button>
            <button type="button" className="btn btn-sm" onClick={() => update((d) => ({ ...d, adjustments: [...d.adjustments, newAdjustment('discount', 'Discount')] }))}>
              <Icon name="plus" size={16} /> Discount
            </button>
          </div>
          <div className="row-wrap gst-quick" role="group" aria-label="Set GST">
            <span className="small muted">{hasTax ? 'Replace tax with GST:' : 'Bill had GST? Add CGST + SGST:'}</span>
            {GST_RATES.slice(0, 3).map((r) => (
              <button key={r} type="button" className="chip-btn" onClick={() => setGst(r)} disabled={gstBase <= 0} title={`CGST ${r / 2}% + SGST ${r / 2}% on ${formatINR(gstBase)}`}>
                {r}%
              </button>
            ))}
          </div>
        </div>

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
