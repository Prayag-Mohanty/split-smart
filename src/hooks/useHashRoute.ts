import { useEffect, useState } from 'react';

/**
 * Minimal hash router. Hash routing keeps the app a pure static site that works on
 * GitHub Pages without server rewrites. Routes look like "#/g/<id>/balances".
 */
export function useHashRoute(): string[] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const onChange = () => {
      setParts(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return parts;
}

export function navigate(path: string, replace = false) {
  const hash = '#' + (path.startsWith('/') ? path : `/${path}`);
  if (replace) window.history.replaceState(null, '', hash);
  else window.location.hash = hash;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}
