import { useEffect, useState } from 'react';
import { AppBar } from '../components/AppBar';
import { AvatarStack } from '../components/Avatar';
import { toast } from '../components/Toast';
import { Banner } from '../components/ui';
import { navigate } from '../hooks/useHashRoute';
import { formatINR } from '../lib/money';
import { groupSpend } from '../lib/settle';
import { decodeGroup } from '../lib/share';
import type { Group } from '../lib/types';
import { useStore } from '../store/useStore';

/** Opens a group shared as a link (#/import/<encoded>). The data is in the URL fragment, never sent to a server. */
export default function ImportScreen({ data }: { data?: string }) {
  const importGroup = useStore((s) => s.importGroup);
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!data) {
      setError('This share link is empty.');
      return;
    }
    decodeGroup(data).then(setGroup, (e: Error) => setError(e.message || 'This share link is damaged.'));
  }, [data]);

  return (
    <>
      <AppBar title="Shared group" back="#/" />
      <main id="main" className="page narrow">
        {error && <Banner tone="error">{error}</Banner>}
        {!group && !error && <p className="muted">Opening link…</p>}
        {group && (
          <div className="card stack">
            <h2>
              {group.emoji} {group.name}
            </h2>
            <AvatarStack members={group.members} max={8} />
            <p className="muted">
              {group.members.length} members · {group.expenses.length} expenses · {formatINR(groupSpend(group))} spent
            </p>
            <p className="small muted">Importing creates a copy on this device. Changes are not synced back to the sender.</p>
            <div className="row-wrap">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const id = importGroup(group);
                  toast(`Imported “${group.name}”`);
                  navigate(`/g/${id}`, true);
                }}
              >
                Import group
              </button>
              <a className="btn" href="#/">
                Cancel
              </a>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
