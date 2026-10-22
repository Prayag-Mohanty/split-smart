/** Small presentational building blocks shared across screens. */
import type { ReactNode } from 'react';
import { formatINR } from '../lib/money';
import { CATEGORIES, type Category } from '../lib/types';
import { Icon, type IconName } from './Icon';

export const CATEGORY_META: Record<Category, { emoji: string; color: string }> = {
  Food: { emoji: '🍕', color: '#ea580c' },
  Groceries: { emoji: '🛒', color: '#16a34a' },
  Travel: { emoji: '🚕', color: '#2563eb' },
  Utilities: { emoji: '💡', color: '#ca8a04' },
  Entertainment: { emoji: '🎬', color: '#9333ea' },
  Other: { emoji: '📦', color: '#64748b' },
};

export function CategorySelect({ value, onChange, id, label = 'Category', compact }: { value: Category; onChange: (c: Category) => void; id?: string; label?: string; compact?: boolean }) {
  return (
    <select id={id} aria-label={label} className={`select${compact ? ' select-compact' : ''}`} value={value} onChange={(e) => onChange(e.target.value as Category)}>
      {CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {CATEGORY_META[c].emoji} {c}
        </option>
      ))}
    </select>
  );
}

export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className="cat-badge" style={{ ['--cat' as string]: CATEGORY_META[category].color }}>
      <span aria-hidden="true">{CATEGORY_META[category].emoji}</span> {category}
    </span>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={28} />
      </div>
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function Banner({ tone, children, icon }: { tone: 'warn' | 'error' | 'ok' | 'info'; children: ReactNode; icon?: IconName }) {
  return (
    <div className={`banner banner-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={icon ?? (tone === 'ok' ? 'check' : tone === 'info' ? 'info' : 'warn')} size={18} />
      <div>{children}</div>
    </div>
  );
}

export function Amount({ paise, tone, sign }: { paise: number; tone?: 'auto' | 'plain'; sign?: boolean }) {
  const cls = tone === 'auto' ? (paise > 0 ? 'pos' : paise < 0 ? 'neg' : 'zero') : '';
  return <span className={`amount ${cls}`}>{formatINR(paise, { sign })}</span>;
}
