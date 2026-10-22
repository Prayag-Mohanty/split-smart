import { useMemo, useState } from 'react';
import { AppBar } from '../components/AppBar';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { MoneyInput } from '../components/MoneyInput';
import { SplitEditor } from '../components/SplitEditor';
import { toast } from '../components/Toast';
import { Banner, CategorySelect } from '../components/ui';
import { useClassifierStatus } from '../hooks/useCategorizer';
import { navigate } from '../hooks/useHashRoute';
import { todayIso, uid } from '../lib/ids';
import { initialSplit } from '../lib/defaultSplit';
import { nextOccurrence } from '../lib/recurring';
import { validateSplit } from '../lib/split';
import type { Category, ManualExpense, RecurrenceFrequency, SplitSpec } from '../lib/types';
import { categorize } from '../services/classifier';
import { useGroup, useStore } from '../store/useStore';
import { NotFound } from './NotFound';

/** Add or edit an expense without a receipt. */
export default function ExpenseEditor({ groupId, expenseId }: { groupId: string; expenseId?: string }) {
  const group = useGroup(groupId);
  const existing = group?.expenses.find((e) => e.id === expenseId);
  if (!group) return <NotFound />;
  if (expenseId && (!existing || existing.kind !== 'manual')) return <NotFound message="This expense no longer exists." />;
  return <Editor key={expenseId ?? 'new'} groupId={groupId} existing={existing as ManualExpense | undefined} />;
}

function Editor({ groupId, existing }: { groupId: string; existing?: ManualExpense }) {
  const group = useGroup(groupId)!;
  const { saveExpense, deleteExpense, saveRecurring, settings } = useStore();
  // New expenses start from your saved default split for this group (paid by you, equal by default).
  const savedDefault = useStore((s) => s.settings.defaultSplits?.[groupId]);
  const start = useMemo(() => initialSplit(group, savedDefault), [group, savedDefault]);

  const [description, setDescription] = useState(existing?.description ?? '');
  const [total, setTotal] = useState<number | undefined>(existing?.totalPaise);
  const [payerId, setPayerId] = useState(existing?.payerId ?? start.payerId);
  const [date, setDate] = useState(existing?.date ?? todayIso());
  const [category, setCategory] = useState<Category>(existing?.category ?? 'Other');
  const [categoryTouched, setCategoryTouched] = useState(!!existing);
  const [suggesting, setSuggesting] = useState(false);
  const [split, setSplit] = useState<SplitSpec>(existing?.split ?? start.split);
  const [repeat, setRepeat] = useState<RecurrenceFrequency | ''>('');
  const [submitted, setSubmitted] = useState(false);
  const { status, progress } = useClassifierStatus();

  const splitError = validateSplit(total ?? 0, split);
  const errors = {
    description: !description.trim() ? 'Add a short description.' : '',
    total: !total || total <= 0 ? 'Enter an amount greater than zero.' : '',
    payer: !payerId ? 'Choose who paid.' : '',
    split: splitError ?? '',
  };
  const valid = !Object.values(errors).some(Boolean);

  const suggestCategory = async (text: string) => {
    if (!text.trim()) return;
    setSuggesting(true);
    try {
      const [c] = await categorize([text]);
      setCategory((cur) => (categoryTouched ? cur : c));
    } catch {
      /* model unavailable (offline?) — keep the manual choice */
    } finally {
      setSuggesting(false);
    }
  };

  const save = () => {
    setSubmitted(true);
    if (!valid || total === undefined) return;
    const id = existing?.id ?? uid('e_');
    let recurringId = existing?.recurringId;
    if (!existing && repeat) {
      recurringId = uid('r_');
    }
    const expense: ManualExpense = {
      id,
      kind: 'manual',
      description: description.trim(),
      totalPaise: total,
      payerId,
      date,
      category,
      split,
      createdAt: existing?.createdAt ?? Date.now(),
      recurringId,
    };
    saveExpense(group.id, expense);
    if (!existing && repeat && recurringId) {
      saveRecurring(group.id, {
        id: recurringId,
        description: expense.description,
        totalPaise: total,
        payerId,
        category,
        split,
        frequency: repeat,
        nextDate: nextOccurrence(date, repeat),
        active: true,
      });
    }
    toast(existing ? 'Expense updated' : 'Expense added');
    navigate(`/g/${group.id}`, true);
  };

  return (
    <>
      <AppBar back={`#/g/${group.id}`} title={existing ? 'Edit expense' : 'Add expense'} subtitle={group.name} />
      <main id="main" className="page narrow with-fab">
        <form
          className="form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="card stack">
            <label className="field">
              <span>Description</span>
              <input
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => settings.autoCategorize && !categoryTouched && suggestCategory(description)}
                placeholder="e.g. Wi-Fi recharge, Maggi run"
                maxLength={80}
                autoFocus={!existing}
              />
              {submitted && errors.description && <small className="error-text">{errors.description}</small>}
            </label>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="amount">Amount</label>
                <MoneyInput id="amount" value={total} onChange={setTotal} />
                {submitted && errors.total && <small className="error-text">{errors.total}</small>}
              </div>
              <label className="field">
                <span>Date</span>
                <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value || todayIso())} />
              </label>
            </div>
            <div className="field">
              <label htmlFor="category">
                Category{' '}
                {(suggesting || status === 'loading') && !categoryTouched && (
                  <span className="muted small">
                    <Icon name="sparkle" size={12} /> {status === 'loading' ? `loading AI model ${Math.round(progress * 100)}%` : 'suggesting…'}
                  </span>
                )}
              </label>
              <div className="row">
                <CategorySelect
                  id="category"
                  value={category}
                  onChange={(c) => {
                    setCategory(c);
                    setCategoryTouched(true);
                  }}
                />
                <button type="button" className="btn" onClick={() => suggestCategory(description)} disabled={!description.trim() || suggesting} title="Suggest a category with the on-device model">
                  <Icon name="sparkle" size={16} /> Suggest
                </button>
              </div>
            </div>
          </div>

          <div className="card stack">
            <fieldset className="field">
              <legend>Paid by</legend>
              <div className="payer-picker" role="radiogroup" aria-label="Paid by">
                {group.members.map((m) => (
                  <button key={m.id} type="button" role="radio" aria-checked={payerId === m.id} className={`payer${payerId === m.id ? ' selected' : ''}`} onClick={() => setPayerId(m.id)}>
                    <Avatar member={m} size="sm" />
                    {m.id === group.meId ? `${m.name} (you)` : m.name}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="card stack">
            <h2 className="card-title">Split</h2>
            <SplitEditor members={group.members} totalPaise={total ?? 0} value={split} onChange={setSplit} />
            {submitted && errors.split && <Banner tone="error">{errors.split}</Banner>}
          </div>

          {!existing && (
            <div className="card stack">
              <label className="list-row static">
                <Icon name="repeat" className="muted" />
                <span className="grow">
                  <span className="row-title">Repeat automatically</span>
                  <span className="row-sub">For bills like a monthly Wi-Fi recharge</span>
                </span>
                <select className="select select-compact" value={repeat} onChange={(e) => setRepeat(e.target.value as RecurrenceFrequency | '')} aria-label="Repeat">
                  <option value="">Never</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
            </div>
          )}

          {existing && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                deleteExpense(group.id, existing.id);
                toast('Expense deleted', 'success', { label: 'Undo', onClick: () => saveExpense(group.id, existing) });
                navigate(`/g/${group.id}`, true);
              }}
            >
              <Icon name="trash" size={18} /> Delete expense
            </button>
          )}

          <div className="fab-bar">
            <a className="btn btn-lg" href={`#/g/${group.id}`}>
              Cancel
            </a>
            <button type="submit" className="btn btn-primary btn-lg">
              <Icon name="check" /> {existing ? 'Save changes' : 'Add expense'}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
