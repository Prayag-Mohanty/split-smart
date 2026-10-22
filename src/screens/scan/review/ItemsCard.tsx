import { Icon } from '../../../components/Icon';
import { MoneyInput } from '../../../components/MoneyInput';
import { CATEGORY_META, CategorySelect } from '../../../components/ui';
import { useClassifierStatus } from '../../../hooks/useCategorizer';
import { newItem, type Draft, type DraftItem } from '../draft';

interface ItemsCardProps {
  draft: Draft;
  update: (fn: (d: Draft) => Draft) => void;
  activeLine?: number;
  setActiveLine: (line: number | undefined) => void;
  categorizing: boolean;
}

/** The editable line items. On phones each item is two rows: name, then qty / unit / total / category. */
export function ItemsCard({ draft, update, activeLine, setActiveLine, categorizing }: ItemsCardProps) {
  const { status, progress } = useClassifierStatus();

  /** Patch an item; `clear` drops that field's low-confidence flag because the user edited it. */
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

  return (
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
          <li
            key={it.id}
            className={`item-row${activeLine !== undefined && it.line === activeLine ? ' active' : ''}`}
            onFocusCapture={() => setActiveLine(it.line)}
            onClick={() => setActiveLine(it.line)}
          >
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
              onChange={(p) => setItem(it.id, { totalPaise: p ?? 0, unitPaise: it.qty ? Math.round((p ?? 0) / it.qty) : (p ?? 0) }, 'price')}
            />
            {/* On phones the select sits invisibly over its emoji, so the row stays compact but tapping still opens the full list. */}
            <span className="item-cat" title={it.category}>
              <span className="item-cat-emoji" aria-hidden="true">
                {CATEGORY_META[it.category].emoji}
              </span>
              <CategorySelect compact label={`Item ${idx + 1} category`} value={it.category} onChange={(c) => setItem(it.id, { category: c, categoryLocked: true })} />
            </span>
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
  );
}
