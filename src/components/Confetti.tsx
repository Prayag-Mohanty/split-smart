import { useMemo } from 'react';

const COLORS = ['#0f766e', '#f59e0b', '#7c3aed', '#16a34a', '#e11d48', '#2563eb'];

/** A short, self-removing confetti burst (hidden entirely when reduced motion is preferred). */
export function Confetti({ pieces = 60 }: { pieces?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 1.4 + Math.random() * 1.2,
        rotate: Math.random() * 360,
        color: COLORS[i % COLORS.length],
        drift: (Math.random() - 0.5) * 120,
      })),
    [pieces],
  );
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <span
          key={i}
          style={{
            left: `${b.left}%`,
            background: b.color,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.duration}s`,
            ['--rot' as string]: `${b.rotate}deg`,
            ['--drift' as string]: `${b.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
