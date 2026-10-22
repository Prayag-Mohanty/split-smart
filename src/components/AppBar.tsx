import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { ThemeToggle } from './ThemeToggle';

interface AppBarProps {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: string;
  actions?: ReactNode;
}

export function AppBar({ title, subtitle, back, actions }: AppBarProps) {
  return (
    <header className="appbar">
      <div className="appbar-inner">
        {back !== undefined ? (
          <a className="icon-btn" href={back} aria-label="Back">
            <Icon name="back" />
          </a>
        ) : (
          <a href="#/" className="brand" aria-label="SplitSmart home">
            <img src="icon.svg" alt="" width={30} height={30} />
          </a>
        )}
        <div className="appbar-title">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="appbar-actions">
          {actions}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
