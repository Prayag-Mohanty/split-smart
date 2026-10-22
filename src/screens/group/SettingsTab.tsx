import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { toast } from '../../components/Toast';
import { Banner } from '../../components/ui';
import { navigate } from '../../hooks/useHashRoute';
import { AVATAR_COLORS } from '../../lib/ids';
import { formatINR } from '../../lib/money';
import type { Group, Member } from '../../lib/types';
import { isValidVpa } from '../../lib/upi';
import { memberInUse, useStore } from '../../store/useStore';
import { ExportActions } from './ExportActions';

const MEMBER_EMOJIS = ['', '😎', '🦁', '🐼', '🦊', '🐯', '🐸', '🐵', '🦄', '🐙', '🌟', '⚡'];

export function SettingsTab({ group }: { group: Group }) {
  const { renameGroup, deleteGroup, addMember, removeMember, saveRecurring, deleteRecurring, settings, updateSettings } = useStore();
  const [name, setName] = useState(group.name);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<Member | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="stack-lg">
      <section className="card stack" aria-labelledby="group-h">
        <h2 id="group-h" className="card-title">
          Group
        </h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && name !== group.name) {
              renameGroup(group.id, name, group.emoji);
              toast('Group renamed');
            }
          }}
        >
          <label className="sr-only" htmlFor="group-name">
            Group name
          </label>
          <input id="group-name" className="input grow" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <button type="submit" className="btn" disabled={!name.trim() || name === group.name}>
            Rename
          </button>
        </form>
      </section>

      <section className="card stack" aria-labelledby="members-h">
        <h2 id="members-h" className="card-title">
          Members ({group.members.length})
        </h2>
        <ul className="list">
          {group.members.map((m) => {
            const inUse = memberInUse(group, m.id);
            return (
              <li key={m.id} className="list-row static">
                <Avatar member={m} />
                <span className="grow min0">
                  <span className="row-title">{m.name}</span>
                  <span className="row-sub">{m.upiId ? `UPI: ${m.upiId}` : 'No UPI ID'}</span>
                </span>
                <button type="button" className="icon-btn" aria-label={`Edit ${m.name}`} onClick={() => setEditing(m)}>
                  <Icon name="edit" size={18} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${m.name}`}
                  disabled={inUse}
                  title={inUse ? 'Part of existing expenses or settlements — delete those first' : undefined}
                  onClick={() => {
                    removeMember(group.id, m.id);
                    toast(`Removed ${m.name}`);
                  }}
                >
                  <Icon name="trash" size={18} />
                </button>
              </li>
            );
          })}
        </ul>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            addMember(group.id, { name: newName });
            setNewName('');
          }}
        >
          <label className="sr-only" htmlFor="new-member">
            New member name
          </label>
          <input id="new-member" className="input grow" placeholder="Add a member" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} />
          <button type="submit" className="btn btn-primary" disabled={!newName.trim()}>
            <Icon name="plus" size={18} /> Add
          </button>
        </form>
        <p className="small muted">Members who appear in an expense can't be removed, so balances never break.</p>
      </section>

      <section className="card stack" aria-labelledby="rec-h">
        <h2 id="rec-h" className="card-title">
          Recurring expenses
        </h2>
        {group.recurring.length === 0 ? (
          <p className="muted small">
            Monthly bills like a Wi-Fi recharge can be added automatically. Turn on “Repeat” when adding an expense.
          </p>
        ) : (
          <ul className="list">
            {group.recurring.map((r) => (
              <li key={r.id} className="list-row static">
                <Icon name="repeat" className="muted" />
                <span className="grow min0">
                  <span className="row-title">{r.description}</span>
                  <span className="row-sub">
                    {formatINR(r.totalPaise)} {r.frequency} · next {new Date(r.nextDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </span>
                <label className="switch" title={r.active ? 'Pause' : 'Resume'}>
                  <input type="checkbox" checked={r.active} onChange={(e) => saveRecurring(group.id, { ...r, active: e.target.checked })} aria-label={`${r.description} active`} />
                  <span />
                </label>
                <button type="button" className="icon-btn" aria-label={`Delete recurring ${r.description}`} onClick={() => deleteRecurring(group.id, r.id)}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack" aria-labelledby="pref-h">
        <h2 id="pref-h" className="card-title">
          Preferences
        </h2>
        <label className="list-row static">
          <span className="grow">
            <span className="row-title">Auto-categorise items</span>
            <span className="row-sub">Uses an on-device AI model (~25 MB, downloaded once on first scan).</span>
          </span>
          <span className="switch">
            <input type="checkbox" checked={settings.autoCategorize} onChange={(e) => updateSettings({ autoCategorize: e.target.checked })} />
            <span />
          </span>
        </label>
      </section>

      <ExportActions group={group} />

      <section className="card stack danger-zone" aria-labelledby="danger-h">
        <h2 id="danger-h" className="card-title">
          Danger zone
        </h2>
        <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
          <Icon name="trash" size={18} /> Delete group
        </button>
      </section>

      <MemberModal group={group} member={editing} onClose={() => setEditing(null)} />
      <Modal
        open={confirmDelete}
        title="Delete this group?"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                deleteGroup(group.id);
                toast(`Deleted “${group.name}”`);
                navigate('/', true);
              }}
            >
              Delete forever
            </button>
          </>
        }
      >
        <Banner tone="warn">
          “{group.name}” and its {group.expenses.length} expenses will be removed from this device. Export a JSON backup first if you may need it.
        </Banner>
      </Modal>
    </div>
  );
}

function MemberModal({ group, member, onClose }: { group: Group; member: Member | null; onClose: () => void }) {
  const updateMember = useStore((s) => s.updateMember);
  const [draft, setDraft] = useState<Member | null>(member);
  if (member && draft?.id !== member.id) setDraft(member);
  const vpaOk = !draft?.upiId || isValidVpa(draft.upiId);

  return (
    <Modal
      open={!!member}
      title="Edit member"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!draft?.name.trim() || !vpaOk}
            onClick={() => {
              if (!draft) return;
              updateMember(group.id, draft.id, { name: draft.name.trim(), color: draft.color, emoji: draft.emoji || undefined, upiId: draft.upiId?.trim() || undefined });
              onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      {draft && (
        <div className="form">
          <div className="center">
            <Avatar member={draft} size="lg" />
          </div>
          <label className="field">
            <span>Name</span>
            <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={40} />
          </label>
          <fieldset className="field">
            <legend>Colour</legend>
            <div className="swatches" role="radiogroup" aria-label="Avatar colour">
              {AVATAR_COLORS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={draft.color === c} aria-label={c} className={draft.color === c ? 'selected' : ''} style={{ background: c }} onClick={() => setDraft({ ...draft, color: c })} />
              ))}
            </div>
          </fieldset>
          <fieldset className="field">
            <legend>Avatar</legend>
            <div className="emoji-picker" role="radiogroup" aria-label="Avatar emoji">
              {MEMBER_EMOJIS.map((e) => (
                <button key={e || 'none'} type="button" role="radio" aria-checked={(draft.emoji ?? '') === e} className={(draft.emoji ?? '') === e ? 'selected' : ''} onClick={() => setDraft({ ...draft, emoji: e })}>
                  {e || 'Aa'}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span>UPI ID (optional)</span>
            <input className="input" value={draft.upiId ?? ''} onChange={(e) => setDraft({ ...draft, upiId: e.target.value })} placeholder="name@okaxis" autoCapitalize="none" autoCorrect="off" />
            {!vpaOk && <small className="error-text">Enter a UPI ID like name@bank.</small>}
          </label>
        </div>
      )}
    </Modal>
  );
}
