/** Short random IDs (crypto-backed when available). */
export function uid(prefix = ''): string {
  const bytes = new Uint8Array(8);
  (globalThis.crypto ?? { getRandomValues: (b: Uint8Array) => b.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(bytes);
  return prefix + Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
}

/** Today as yyyy-mm-dd in the user's local time zone. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Accessible avatar palette (white text passes WCAG AA on every colour). */
export const AVATAR_COLORS = ['#0f766e', '#7c3aed', '#c2410c', '#1d4ed8', '#be123c', '#4d7c0f', '#a21caf', '#0369a1', '#b45309', '#475569'];
