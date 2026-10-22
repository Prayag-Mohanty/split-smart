import { EmptyState } from '../components/ui';

export function NotFound({ message = 'This page does not exist.' }: { message?: string }) {
  return (
    <main id="main" className="page">
      <EmptyState
        icon="info"
        title="Not found"
        action={
          <a className="btn btn-primary" href="#/">
            Go to dashboard
          </a>
        }
      >
        {message}
      </EmptyState>
    </main>
  );
}
