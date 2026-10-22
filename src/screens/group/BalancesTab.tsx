import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { toast } from '../../components/Toast';
import { Amount, Banner, EmptyState } from '../../components/ui';
import { todayIso } from '../../lib/ids';
import { formatINR } from '../../lib/money';
import { computeMemberStats, suggestSettlements, type Transfer } from '../../lib/settle';
import type { Group, Member } from '../../lib/types';
import { buildUpiLink, isValidVpa } from '../../lib/upi';
import { qrDataUrl } from '../../services/qr';
import { useStore } from '../../store/useStore';
import { ExportActions } from './ExportActions';

export function BalancesTab({ group }: { group: Group }) {
  const addSettlement = useStore((s) => s.addSettlement);
  const deleteSettlement = useStore((s) => s.deleteSettlement);
  const stats = useMemo(() => computeMemberStats(group), [group]);
  const transfers = useMemo(() => suggestSettlements(group), [group]);
  const byId = useMemo(() => new Map(group.members.map((m) => [m.id, m])), [group.members]);
  const [paying, setPaying] = useState<Transfer | null>(null);

  if (group.expenses.length === 0 && group.settlements.length === 0) {
    return (
      <EmptyState icon="scale" title="Nothing to settle yet">
        Balances appear here as soon as you add an expense.
      </EmptyState>
    );
  }

  const maxAbs = Math.max(1, ...group.members.map((m) => Math.abs(stats[m.id]?.net ?? 0)));
  const nonZero = group.members.filter((m) => (stats[m.id]?.net ?? 0) !== 0).length;

  const settle = (t: Transfer) => {
    addSettlement(group.id, { fromId: t.fromId, toId: t.toId, amountPaise: t.amountPaise, date: todayIso(), note: 'Settled up' });
    toast(`${byId.get(t.fromId)?.name} paid ${byId.get(t.toId)?.name} ${formatINR(t.amountPaise)}`, 'success', {
      label: 'Undo',
      onClick: () => {
        const latest = useStore.getState().groups.find((g) => g.id === group.id)?.settlements[0];
        if (latest) deleteSettlement(group.id, latest.id);
      },
    });
  };

  return (
    <div className="stack-lg">
      <section aria-labelledby="net-heading">
        <h2 id="net-heading" className="section-title">
          Net balances
        </h2>
        <ul className="card balance-list">
          {group.members.map((m) => {
            const s = stats[m.id] ?? { paid: 0, consumed: 0, net: 0 };
            const pct = (Math.abs(s.net) / maxAbs) * 50;
            return (
              <li key={m.id} className="balance-row">
                <Avatar member={m} />
                <div className="grow min0">
                  <div className="balance-top">
                    <strong>{m.name}</strong>
                    <span className={s.net > 0 ? 'pos' : s.net < 0 ? 'neg' : 'muted'}>
                      {s.net > 0 ? `gets back ${formatINR(s.net)}` : s.net < 0 ? `owes ${formatINR(-s.net)}` : 'settled up'}
                    </span>
                  </div>
                  <div className="diverge" aria-hidden="true">
                    <span className="diverge-axis" />
                    {s.net !== 0 && <span className={`diverge-bar ${s.net > 0 ? 'pos-bg' : 'neg-bg'}`} style={s.net > 0 ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }} />}
                  </div>
                  <div className="small muted">
                    Paid {formatINR(s.paid)} · Share {formatINR(s.consumed)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="settle-heading">
        <h2 id="settle-heading" className="section-title">
          Suggested payments
        </h2>
        {transfers.length === 0 ? (
          <Banner tone="ok">Everyone is settled up. 🎉</Banner>
        ) : (
          <>
            <p className="muted small">
              {transfers.length} payment{transfers.length > 1 ? 's' : ''} settle{transfers.length === 1 ? 's' : ''} everything — the minimum possible for {nonZero} people with open balances.
            </p>
            <ul className="stack">
              {transfers.map((t, i) => {
                const from = byId.get(t.fromId);
                const to = byId.get(t.toId);
                if (!from || !to) return null;
                return (
                  <li key={`${t.fromId}-${t.toId}-${i}`} className="card transfer">
                    <div className="transfer-people">
                      <span className="transfer-person">
                        <Avatar member={from} />
                        <span>{from.name}</span>
                      </span>
                      <span className="transfer-arrow">
                        <strong>{formatINR(t.amountPaise)}</strong>
                        <Icon name="arrowRight" />
                      </span>
                      <span className="transfer-person">
                        <Avatar member={to} />
                        <span>{to.name}</span>
                      </span>
                    </div>
                    <div className="transfer-actions">
                      <button type="button" className="btn btn-sm" onClick={() => setPaying(t)}>
                        <Icon name="qr" size={16} /> Pay via UPI
                      </button>
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => settle(t)}>
                        <Icon name="check" size={16} /> Mark settled
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {group.settlements.length > 0 && (
        <section aria-labelledby="history-heading">
          <h2 id="history-heading" className="section-title">
            Settlement history
          </h2>
          <ul className="card list">
            {group.settlements.map((s) => (
              <li key={s.id} className="list-row static">
                <Icon name="check" className="pos" />
                <span className="grow">
                  <span className="row-title">
                    {byId.get(s.fromId)?.name ?? '?'} paid {byId.get(s.toId)?.name ?? '?'}
                  </span>
                  <span className="row-sub">{new Date(s.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                </span>
                <Amount paise={s.amountPaise} />
                <button type="button" className="icon-btn" aria-label="Delete settlement" onClick={() => deleteSettlement(group.id, s.id)}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ExportActions group={group} />

      <UpiModal transfer={paying} group={group} onClose={() => setPaying(null)} onSettled={(t) => settle(t)} />
    </div>
  );
}

function UpiModal({ transfer, group, onClose, onSettled }: { transfer: Transfer | null; group: Group; onClose: () => void; onSettled: (t: Transfer) => void }) {
  const updateMember = useStore((s) => s.updateMember);
  const from = group.members.find((m) => m.id === transfer?.fromId);
  const to = group.members.find((m) => m.id === transfer?.toId);
  const [vpa, setVpa] = useState('');
  const [qr, setQr] = useState('');

  const link = transfer && to?.upiId ? buildUpiLink({ payeeVpa: to.upiId, payeeName: to.name, amountPaise: transfer.amountPaise, note: `SplitSmart: ${group.name}` }) : '';

  useEffect(() => {
    setQr('');
    if (link) qrDataUrl(link).then(setQr, () => setQr(''));
  }, [link]);
  useEffect(() => setVpa(''), [transfer]);

  return (
    <Modal open={!!transfer} title="Pay via UPI" onClose={onClose}>
      {transfer && from && to && (
        <div className="stack center-text">
          <p>
            <strong>{from.name}</strong> pays <strong>{to.name}</strong>
          </p>
          <p className="big-amount">{formatINR(transfer.amountPaise)}</p>
          {to.upiId ? (
            <>
              <div className="qr-box">{qr ? <img src={qr} alt={`UPI QR code to pay ${to.name} ${formatINR(transfer.amountPaise)}`} width={220} height={220} /> : <span className="muted">Generating QR…</span>}</div>
              <p className="small muted">Scan with any UPI app, or on a phone tap the button below. UPI ID: {to.upiId}</p>
              <div className="row-wrap center">
                <a className="btn btn-primary" href={link}>
                  Open UPI app
                </a>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    navigator.clipboard?.writeText(link).then(() => toast('UPI link copied'), () => toast('Could not copy', 'error'));
                  }}
                >
                  <Icon name="link" size={16} /> Copy link
                </button>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  onSettled(transfer);
                  onClose();
                }}
              >
                <Icon name="check" size={16} /> I've paid — mark settled
              </button>
            </>
          ) : (
            <MissingVpa member={to} vpa={vpa} setVpa={setVpa} onSave={() => updateMember(group.id, to.id, { upiId: vpa.trim() })} />
          )}
        </div>
      )}
    </Modal>
  );
}

function MissingVpa({ member, vpa, setVpa, onSave }: { member: Member; vpa: string; setVpa: (v: string) => void; onSave: () => void }) {
  const valid = isValidVpa(vpa);
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave();
      }}
    >
      <Banner tone="info">Add {member.name}'s UPI ID to generate a payment link and QR code.</Banner>
      <label className="field">
        <span>{member.name}'s UPI ID</span>
        <input className="input" value={vpa} onChange={(e) => setVpa(e.target.value)} placeholder="name@okaxis" autoCapitalize="none" autoCorrect="off" />
      </label>
      {vpa && !valid && <small className="error-text">That doesn't look like a UPI ID (e.g. name@bank).</small>}
      <button type="submit" className="btn btn-primary" disabled={!valid}>
        Save UPI ID
      </button>
    </form>
  );
}
