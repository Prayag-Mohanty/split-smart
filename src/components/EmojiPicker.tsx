import { useState } from 'react';
import { firstEmoji, type EmojiSet } from '../lib/emojis';

interface EmojiPickerProps {
  sets: EmojiSet[];
  value: string;
  onChange: (emoji: string) => void;
  label: string;
  /** Shown first, e.g. icons that match the group name. */
  suggested?: string[];
  /** Label for an extra "no emoji" option (avatars fall back to initials). */
  noneLabel?: string;
}

/** Themed emoji tabs, optional suggestions, and a box to type or paste any emoji at all. */
export function EmojiPicker({ sets, value, onChange, label, suggested = [], noneLabel }: EmojiPickerProps) {
  // Open on the tab holding the current emoji, so editing shows what's selected.
  const [tab, setTab] = useState(() =>
    Math.max(
      0,
      sets.findIndex((s) => s.emojis.includes(value)),
    ),
  );
  const [custom, setCustom] = useState('');
  const inSets = !value || sets.some((s) => s.emojis.includes(value)) || suggested.includes(value);

  const option = (e: string, text = e, aria?: string) => (
    <button
      type="button"
      key={e || 'none'}
      role="radio"
      aria-checked={value === e}
      aria-label={aria}
      className={value === e ? 'selected' : ''}
      onClick={() => onChange(e)}
    >
      {text}
    </button>
  );

  return (
    <div className="stack emoji-field">
      {suggested.length > 0 && (
        <div className="emoji-suggested">
          <span className="small muted">Suggested</span>
          <div className="emoji-picker" role="radiogroup" aria-label={`${label}: suggested`}>
            {suggested.map((e) => option(e))}
          </div>
        </div>
      )}
      <div className="filter-row emoji-tabs" role="tablist" aria-label={`${label} themes`}>
        {sets.map((s, i) => (
          <button
            key={s.label}
            type="button"
            role="tab"
            aria-selected={tab === i}
            className={`chip-btn${tab === i ? ' active' : ''}`}
            onClick={() => setTab(i)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="emoji-picker" role="radiogroup" aria-label={label}>
        {noneLabel !== undefined && option('', noneLabel, 'No emoji')}
        {/* A typed emoji stays visible and selected even though it isn't in any set. */}
        {!inSets && option(value)}
        {sets[tab].emojis.map((e) => option(e))}
      </div>
      <label className="emoji-custom">
        <span className="small muted">Or type any emoji</span>
        <input
          className="input"
          value={custom}
          inputMode="text"
          placeholder="e.g. 🛺"
          aria-label={`${label}: type any emoji`}
          onChange={(ev) => {
            setCustom(ev.target.value);
            const e = firstEmoji(ev.target.value);
            if (e) {
              onChange(e);
              setCustom('');
            }
          }}
        />
      </label>
    </div>
  );
}
