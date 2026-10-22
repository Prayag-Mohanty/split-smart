import { useEffect, useState } from 'react';
import { Icon } from './Icon';

type Theme = 'system' | 'light' | 'dark';
const KEY = 'splitsmart:theme';

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(t: Theme) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

applyTheme(readTheme());

/** Cycles system → light → dark. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* private mode */
    }
  }, [theme]);
  const next: Theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  return (
    <button type="button" className="icon-btn" onClick={() => setTheme(next)} aria-label={`Theme: ${theme}. Switch to ${next}`} title={`Theme: ${theme}`}>
      <Icon name="sun" />
    </button>
  );
}
