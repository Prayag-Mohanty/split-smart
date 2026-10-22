import { useEffect, useRef, useState } from 'react';
import { formatINR, type Paise } from '../lib/money';

/** A rupee amount that counts up/down to its new value (instant with reduced motion). */
export function AnimatedAmount({ paise, duration = 350 }: { paise: Paise; duration?: number }) {
  const [shown, setShown] = useState(paise);
  const from = useRef(paise);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = from.current;
    if (reduce || start === paise) {
      setShown(paise);
      from.current = paise;
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - k) ** 3;
      setShown(Math.round(start + (paise - start) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = paise;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = paise;
    };
  }, [paise, duration]);
  return <span className="amount">{formatINR(shown)}</span>;
}
