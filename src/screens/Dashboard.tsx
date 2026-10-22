import { useMemo, useRef, useState } from 'react';
import { AppBar } from '../components/AppBar';
import { AvatarStack } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { toast } from '../components/Toast';
import { Avatar } from '../components/Avatar';
import { navigate } from '../hooks/useHashRoute';
import { demoGroup } from '../lib/demo';
import { formatINR } from '../lib/money';
import { computeNetBalances, groupSpend } from '../lib/settle';
import { groupFromJson } from '../lib/share';
import type { Group } from '../lib/types';
import { useStore } from '../store/useStore';

const GROUP_EMOJIS = ['🌙', '🏖️', '🍕', '🏠', '🚌', '🎉', '🛒', '📶', '☕', '🎬'];

function groupSummary(g: Group) {
  const nets = Object.values(computeNetBalances(g));
  const outstanding = nets.reduce((s, n) => s + (n > 0 ? n : 0), 0);
  const last = g.expenses.reduce((d, e) => (e.date > d ? e.date : d), '');
  return { spend: groupSpend(g), outstanding, last };
}

export function Dashboard() {
  const groups = useStore((s) => s.groups);
  const importGroup = useStore((s) => s.importGroup);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const summaries = useMemo(() => groups.map((g) => ({ g, ...groupSummary(g) })), [groups]);
  const totalSpend = summaries.reduce((s, x) => s + x.spend, 0);
  const totalOutstanding = summaries.reduce((s, x) => s + x.outstanding, 0);

  return (
    <>
      <AppBar
        title="SplitSmart"
        subtitle="Scan. Split. Settle."
        actions={
          <button type="button" className="icon-btn" onClick={() => setImporting(true)} aria-label="Import a group">
            <Icon name="upload" />
          </button>
        }
      />
      <main id="main" className="page">
        {groups.length > 0 && (
          <section className="hero" aria-label="Totals across all groups">
            <div>
              <span className="hero-label">Total spent</span>
              <strong className="hero-value">{formatINR(totalSpend, { compact: true })}</strong>
            </div>
            <div>
              <span className="hero-label">Waiting to be settled</span>
              <strong className="hero-value">{formatINR(totalOutstanding, { compact: true })}</strong>
            </div>
            <div>
              <span className="hero-label">Groups</span>
              <strong className="hero-value">{groups.length}</strong>
            </div>
          </section>
        )}

        {groups.length > 0 && (
          <div className="section-head">
            <h2>Your groups</h2>
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={18} /> New group
            </button>
          </div>
        )}

        {groups.length === 0 ? (
          <Welcome
            onDemo={() => {
              const id = importGroup(demoGroup(), { keepMe: true });
              navigate(`/g/${id}`);
            }}
            onCreate={() => setCreating(true)}
          />
        ) : (
          <ul className="group-grid">
            {summaries.map(({ g, spend, outstanding, last }) => (
              <li key={g.id}>
                <a className="card group-card" href={`#/g/${g.id}`}>
                  <div className="group-card-top">
                    <span className="group-emoji" aria-hidden="true">
                      {g.emoji || '👥'}
                    </span>
                    <div className="grow">
                      <h3>{g.name}</h3>
                      <p className="muted small">
                        {g.members.length} member{g.members.length === 1 ? '' : 's'} · {g.expenses.length} expense{g.expenses.length === 1 ? '' : 's'}
                        {last && ` · last ${new Date(last).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                      </p>
                    </div>
                    <Icon name="arrowRight" className="muted" />
                  </div>
                  <div className="group-card-bottom">
                    <AvatarStack members={g.members} />
                    <div className="group-card-stats">
                      <span>
                        <span className="muted small">Spent </span>
                        <strong className="amount">{formatINR(spend, { compact: true })}</strong>
                      </span>
                      <span className={outstanding ? 'pill pill-warn' : 'pill pill-ok'}>
                        {outstanding ? `${formatINR(outstanding)} to settle` : 'All settled'}
                      </span>
                    </div>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}

        <p className="privacy-note">
          <Icon name="info" size={16} /> Receipts are read on your device. Nothing is uploaded — your data lives in this browser.
        </p>
      </main>

      <CreateGroupModal open={creating} onClose={() => setCreating(false)} />
      <ImportModal open={importing} onClose={() => setImporting(false)} />
    </>
  );
}

/** First-run hero: says what the app does in five seconds and leads with the demo. */
function Welcome({ onDemo, onCreate }: { onDemo: () => void; onCreate: () => void }) {
  const people = [
    { name: 'Riya', color: '#0f766e' },
    { name: 'Arjun', color: '#7c3aed' },
    { name: 'Meera', color: '#c2410c' },
  ];
  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <div className="welcome-copy">
        <p className="eyebrow">Scan. Split. Settle.</p>
        <h2 id="welcome-title" className="welcome-title">
          Split the bill by what people actually ate.
        </h2>
        <p className="welcome-sub">GST shared fairly. Fewest payments. Nothing leaves your phone.</p>
        <div className="welcome-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={onDemo}>
            <Icon name="sparkle" /> Try a demo group
          </button>
          <button type="button" className="btn btn-lg" onClick={onCreate}>
            <Icon name="plus" /> Create a group
          </button>
        </div>
        <h3 className="welcome-first">Split your first bill</h3>
        <p className="muted small">Create a group for your wing, room or trip, add friends, then scan a receipt. Everything stays on this device.</p>
      </div>

      <ol className="welcome-steps" aria-label="How it works">
        <li className="wstep">
          <div className="wstep-visual mini-receipt" aria-hidden="true">
            <span>Large Pizza</span>
            <b>400</b>
            <span>Maggi ×3</span>
            <b>180</b>
            <span>Cold Coffee</span>
            <b>220</b>
            <span className="mini-gst">GST 5%</span>
            <b className="mini-gst">40</b>
          </div>
          <strong>1. Snap the bill</strong>
          <span className="muted small">Text is read on your phone.</span>
        </li>
        <li className="wstep">
          <div className="wstep-visual" aria-hidden="true">
            <div className="mini-assign">
              {people.map((p) => (
                <Avatar key={p.name} member={p} />
              ))}
            </div>
          </div>
          <strong>2. Tap who ate what</strong>
          <span className="muted small">Tax splits in proportion.</span>
        </li>
        <li className="wstep">
          <div className="wstep-visual" aria-hidden="true">
            <div className="mini-settle">
              <Icon name="check" size={28} />
              <span>₹336 → Riya</span>
            </div>
          </div>
          <strong>3. Settle up</strong>
          <span className="muted small">Fewest payments, UPI ready.</span>
        </li>
      </ol>
    </section>
  );
}

function CreateGroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createGroup = useStore((s) => s.createGroup);
  const rememberedName = useStore((s) => s.settings.myName ?? '');
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(GROUP_EMOJIS[0]);
  const [myName, setMyName] = useState(rememberedName);
  const [members, setMembers] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addDraft = () => {
    const names = draft
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length) setMembers((m) => [...m, ...names.filter((n) => !m.includes(n))]);
    setDraft('');
    inputRef.current?.focus();
  };

  const submit = () => {
    if (!name.trim()) return;
    const all = [
      ...members,
      ...draft
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean),
    ];
    const id = createGroup(name, all, emoji, myName);
    setName('');
    setMembers([]);
    setDraft('');
    onClose();
    navigate(`/g/${id}`);
  };

  return (
    <Modal
      open={open}
      title="New group"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="create-group" className="btn btn-primary" disabled={!name.trim()}>
            Create group
          </button>
        </>
      }
    >
      <form
        id="create-group"
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field">
          <span>Group name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Night Canteen Gang"
            autoFocus
            required
            maxLength={60}
          />
        </label>
        <fieldset className="field">
          <legend>Icon</legend>
          <div className="emoji-picker" role="radiogroup" aria-label="Group icon">
            {GROUP_EMOJIS.map((e) => (
              <button type="button" key={e} role="radio" aria-checked={emoji === e} className={emoji === e ? 'selected' : ''} onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span>Your name</span>
          <input
            className="input"
            value={myName}
            onChange={(e) => setMyName(e.target.value)}
            placeholder="e.g. Riya"
            maxLength={40}
            autoComplete="given-name"
          />
          <small className="muted">You'll show up as “You” in this group. Remembered for next time.</small>
        </label>
        <div className="field">
          <label htmlFor="member-draft">Who else? (Members)</label>
          <div className="row">
            <input
              id="member-draft"
              ref={inputRef}
              className="input grow"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addDraft();
                }
              }}
              placeholder="Arjun, Meera, Kabir"
              aria-describedby="member-hint"
            />
            <button type="button" className="btn" onClick={addDraft} disabled={!draft.trim()}>
              Add
            </button>
          </div>
          {members.length > 0 && (
            <ul className="chips" aria-label="Members to add">
              {myName.trim() && <li className="chip chip-me">{myName.trim()} (you)</li>}
              {members.map((m) => (
                <li key={m} className="chip">
                  {m}
                  <button type="button" aria-label={`Remove ${m}`} onClick={() => setMembers((ms) => ms.filter((x) => x !== m))}>
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <small id="member-hint" className="muted">
            Name, then Enter (or comma separated). {myName.trim() ? 'You are added automatically.' : 'Include yourself.'} You can add more people later.
          </small>
        </div>
      </form>
    </Modal>
  );
}

function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const importGroup = useStore((s) => s.importGroup);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');

  const finish = (g: Group) => {
    const id = importGroup(g);
    toast(`Imported “${g.name}”`);
    onClose();
    navigate(`/g/${id}`);
  };

  return (
    <Modal open={open} title="Import a group" onClose={onClose}>
      <div className="form">
        <label className="field">
          <span>From a JSON file</span>
          <input
            type="file"
            accept="application/json,.json"
            className="input"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                finish(groupFromJson(await file.text()));
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
        </label>
        <div className="divider">or</div>
        <label className="field">
          <span>Paste a share link</span>
          <input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…#/import/…" />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!link.includes('#/import/')}
          onClick={() => {
            onClose();
            window.location.hash = link.slice(link.indexOf('#'));
          }}
        >
          Open link
        </button>
        {error && <p className="error-text">{error}</p>}
      </div>
    </Modal>
  );
}
