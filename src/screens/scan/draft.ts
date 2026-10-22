/**
 * Editable draft of an itemized receipt, plus conversions from the OCR parser output
 * and to/from saved expenses. Kept separate from the components so it is easy to test.
 */
import { uid } from '../../lib/ids';
import { LOW_CONFIDENCE, type ParsedReceipt } from '../../lib/receiptParser';
import type { Adjustment, Category, ItemizedExpense, ReceiptItem } from '../../lib/types';

export interface DraftItem extends ReceiptItem {
  /** Low-confidence fields (value = OCR confidence %). Cleared once the user edits the field. */
  low?: { name?: number; qty?: number; price?: number };
  /** OCR line index, for pointing at the source on the image. */
  line?: number;
}

export interface DraftAdjustment extends Adjustment {
  low?: number;
  line?: number;
}

export interface Draft {
  id: string;
  description: string;
  date: string;
  payerId: string;
  category: Category;
  categoryLocked: boolean;
  items: DraftItem[];
  adjustments: DraftAdjustment[];
  /** Printed total from the receipt, or the computed total once the user confirms it. */
  printedTotalPaise?: number;
  totalLow?: number;
  /** Whether the total came from the receipt or was confirmed by the user. */
  totalSource: 'printed' | 'confirmed' | 'none';
  /** Was this draft created from an OCR scan? (vs. manual items / editing a saved expense) */
  fromScan: boolean;
}

const lowOrUndefined = (c: number) => (c < LOW_CONFIDENCE ? c : undefined);

export function emptyDraft(payerId: string, date: string): Draft {
  return {
    id: uid('e_'),
    description: '',
    date,
    payerId,
    category: 'Food',
    categoryLocked: false,
    items: [],
    adjustments: [],
    totalSource: 'none',
    fromScan: false,
  };
}

export function newItem(): DraftItem {
  return { id: uid('i_'), name: '', qty: 1, unitPaise: 0, totalPaise: 0, category: 'Food', assignees: [] };
}

export function newAdjustment(kind: Adjustment['kind'] = 'tax', label = 'Tax', amountPaise = 0): DraftAdjustment {
  return { id: uid('a_'), label, kind, amountPaise };
}

export function draftFromParsed(parsed: ParsedReceipt, base: Draft): Draft {
  const items: DraftItem[] = parsed.items.map((p) => {
    const low = {
      name: lowOrUndefined(p.confidence.name),
      qty: lowOrUndefined(p.confidence.qty),
      price: lowOrUndefined(p.confidence.price),
    };
    return {
      id: uid('i_'),
      name: p.name,
      qty: p.qty,
      unitPaise: p.unitPaise,
      totalPaise: p.totalPaise,
      category: 'Food',
      assignees: [],
      line: p.line,
      low: low.name || low.qty || low.price ? low : undefined,
    };
  });
  const adjustments: DraftAdjustment[] = parsed.adjustments.map((a) => ({
    id: uid('a_'),
    label: a.label,
    kind: a.kind,
    amountPaise: a.amountPaise,
    low: lowOrUndefined(a.confidence),
    line: a.line,
  }));
  return {
    ...base,
    description: base.description || parsed.merchant || 'Receipt',
    date: parsed.date ?? base.date,
    items,
    adjustments,
    printedTotalPaise: parsed.totalPaise,
    totalLow: parsed.totalConfidence !== undefined ? lowOrUndefined(parsed.totalConfidence) : undefined,
    totalSource: parsed.totalPaise !== undefined ? 'printed' : 'none',
    fromScan: true,
  };
}

export function draftFromExpense(e: ItemizedExpense): Draft {
  return {
    id: e.id,
    description: e.description,
    date: e.date,
    payerId: e.payerId,
    category: e.category,
    categoryLocked: true,
    items: e.items.map((i) => ({ ...i })),
    adjustments: e.adjustments.map((a) => ({ ...a })),
    printedTotalPaise: e.printedTotalPaise,
    totalSource: e.printedTotalPaise !== undefined ? 'confirmed' : 'none',
    fromScan: false,
  };
}

/** The expense category is the item category with the most money. */
export function dominantCategory(items: readonly ReceiptItem[]): Category {
  const by = new Map<Category, number>();
  for (const i of items) by.set(i.category, (by.get(i.category) ?? 0) + i.totalPaise);
  let best: Category = 'Other';
  let max = -1;
  for (const [c, v] of by) if (v > max) [best, max] = [c, v];
  return best;
}

export function draftToExpense(d: Draft, createdAt = Date.now()): ItemizedExpense {
  return {
    id: d.id,
    kind: 'itemized',
    description: d.description.trim() || 'Receipt',
    date: d.date,
    payerId: d.payerId,
    category: d.categoryLocked ? d.category : dominantCategory(d.items),
    createdAt,
    items: d.items.map(({ low: _l, line: _ln, ...rest }) => (void _l, void _ln, { ...rest, name: rest.name.trim() || 'Item' })),
    adjustments: d.adjustments
      .filter((a) => a.amountPaise !== 0)
      .map(({ low: _l, line: _ln, ...rest }) => (void _l, void _ln, { ...rest, amountPaise: rest.kind === 'discount' ? -Math.abs(rest.amountPaise) : rest.amountPaise })),
    printedTotalPaise: d.printedTotalPaise,
  };
}
