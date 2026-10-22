import { useEffect, useState } from 'react';
import { parseMoney, toDecimalString } from '../lib/money';

interface MoneyInputProps {
  value: number | undefined;
  onChange: (paise: number | undefined) => void;
  id?: string;
  label?: string;
  className?: string;
  placeholder?: string;
  allowNegative?: boolean;
  /** Highlight as low OCR confidence. */
  lowConfidence?: number;
  autoFocus?: boolean;
}

/**
 * Rupee input that stores paise. Keeps the user's raw text while typing and only
 * normalises on blur, so "12." doesn't jump around.
 */
export function MoneyInput({ value, onChange, id, label, className = '', placeholder = '0.00', allowNegative, lowConfidence, autoFocus }: MoneyInputProps) {
  const [text, setText] = useState(value === undefined ? '' : toDecimalString(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value === undefined ? '' : toDecimalString(value));
  }, [value, focused]);

  return (
    <span className={`money-input ${lowConfidence !== undefined ? 'low-conf' : ''} ${className}`} title={lowConfidence !== undefined ? `Low OCR confidence (${lowConfidence}%) — please check` : undefined}>
      <span className="money-prefix" aria-hidden="true">₹</span>
      <input
        id={id}
        aria-label={label}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        autoFocus={autoFocus}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          const p = parseMoney(text);
          setText(p === null ? '' : toDecimalString(p));
        }}
        onChange={(e) => {
          const t = e.target.value;
          if (!/^[-−]?[\d,]*\.?\d*$/.test(t)) return;
          if (!allowNegative && /^[-−]/.test(t)) return;
          setText(t);
          const p = parseMoney(t);
          onChange(p === null ? undefined : p);
        }}
      />
    </span>
  );
}
