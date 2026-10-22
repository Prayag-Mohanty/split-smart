import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { toast } from '../../components/Toast';
import { groupToCsv } from '../../lib/exporters';
import { encodeGroup, groupToJson } from '../../lib/share';
import type { Group } from '../../lib/types';

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const safeName = (g: Group) => g.name.replace(/[^\w-]+/g, '_');

/** Export (CSV / PDF / JSON) and share-link actions for a group. */
export function ExportActions({ group }: { group: Group }) {
  const [busy, setBusy] = useState(false);

  const shareLink = async () => {
    const encoded = await encodeGroup(group);
    const url = `${location.origin}${location.pathname}#/import/${encoded}`;
    if (url.length > 60000) {
      toast('This group is too large for a link — export it as a file instead.', 'error');
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: `SplitSmart: ${group.name}`, text: `Open “${group.name}” in SplitSmart`, url });
        return;
      } catch {
        /* user cancelled or share failed — fall back to copy */
      }
    }
    await navigator.clipboard?.writeText(url);
    toast('Share link copied to clipboard');
  };

  return (
    <section aria-labelledby="export-heading">
      <h2 id="export-heading" className="section-title">
        Export & share
      </h2>
      <div className="card export-grid">
        <button type="button" className="btn" onClick={() => download(`${safeName(group)}-summary.csv`, groupToCsv(group), 'text/csv')}>
          <Icon name="download" size={18} /> CSV
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const { downloadGroupPdf } = await import('../../services/pdf');
              await downloadGroupPdf(group);
            } catch {
              toast('Could not create the PDF', 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="download" size={18} /> {busy ? 'Preparing…' : 'PDF'}
        </button>
        <button type="button" className="btn" onClick={() => download(`${safeName(group)}.splitsmart.json`, groupToJson(group), 'application/json')}>
          <Icon name="download" size={18} /> JSON backup
        </button>
        <button type="button" className="btn" onClick={() => shareLink().catch(() => toast('Could not create a share link', 'error'))}>
          <Icon name="share" size={18} /> Share link
        </button>
      </div>
      <p className="small muted">Share links carry the whole group inside the URL — nothing is uploaded anywhere.</p>
    </section>
  );
}
