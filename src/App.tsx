import { lazy, Suspense, useEffect } from 'react';
import { Toaster, toast } from './components/Toast';
import { useHashRoute } from './hooks/useHashRoute';
import { useStore } from './store/useStore';
import { Dashboard } from './screens/Dashboard';
import { GroupScreen } from './screens/GroupScreen';
import { NotFound } from './screens/NotFound';

// The scan flow pulls in the OCR wrapper and image tooling; split it out of the first screen.
const ScanFlow = lazy(() => import('./screens/scan/ScanFlow'));
const ExpenseEditor = lazy(() => import('./screens/ExpenseEditor'));
const ImportScreen = lazy(() => import('./screens/ImportScreen'));

export function App() {
  const route = useHashRoute();
  const runRecurring = useStore((s) => s.runRecurring);

  useEffect(() => {
    const added = runRecurring();
    if (added) toast(`Added ${added} recurring expense${added > 1 ? 's' : ''} that came due`, 'info');
  }, [runRecurring]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Suspense fallback={<div className="page-loading" aria-busy="true">Loading…</div>}>{renderRoute(route)}</Suspense>
      <Toaster />
    </>
  );
}

function renderRoute([first, id, sub, extra]: string[]) {
  if (!first) return <Dashboard />;
  if (first === 'import') return <ImportScreen data={id} />;
  if (first === 'g' && id) {
    if (sub === 'scan') return <ScanFlow groupId={id} expenseId={extra} />;
    if (sub === 'expense') return <ExpenseEditor groupId={id} expenseId={extra === 'new' ? undefined : extra} />;
    return <GroupScreen groupId={id} tab={sub} />;
  }
  return <NotFound />;
}
