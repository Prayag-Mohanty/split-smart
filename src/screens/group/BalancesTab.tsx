import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Confetti } from '../../components/Confetti';
import { DebtGraph } from '../../components/DebtGraph';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { toast } from '../../components/Toast';
import { Amount, Banner, EmptyState } from '../../components/ui';
import { todayIso } from '../../lib/ids';
import { formatINR } from '../../lib/money';
import { balanceVerb, isMe, personName } from '../../lib/people';
import { computeMemberStats, rawDebts, simplifyDebts, computeNetBalances, suggestSettlements, type Transfer } from '../../lib/settle';
import type { Group, Member } from '../../lib/types';
import { buildUpiLink, isValidVpa } from '../../lib/upi';
import { qrDataUrl } from '../../services/qr';
import { useStore } from '../../store/useStore';
import { ExportActions } from './ExportActions';

/** Record a suggested payment, with an undo toast. */
function useSettle(group: Group) {
  const addSettlement = useStore((s) => s.addSettlement);
  const deleteSettlement = useStore((s) => s.deleteSettlement);
  return (t: Transfer) => {
    addSettlement(group.id, { fromId: t.fromId, toId: t.toId, amountPaise: t.amountPaise, date: todayIso(), note: 'Settled up' });
    toast(`${personName(group, t.fromId)} paid ${personName(group, t.toId, { lower: true })} ${formatINR(t.amountPaise)}`, 'success', {
      label: 'Undo',
      onClick: () => {
        const latest = useStore.getState().groups.find((g) => g.id === group.id)?.settlements[0];
        if (latest) deleteSettlement(group.id, latest.id);
      },
    });
  };
}

export function BalancesTab({ group }: { group: Group }) {
  const deleteSettlement = useStore((s) => s.deleteSettlement);
  const stats = useMemo(() => computeMemberStats(group), [group]);
  const transfers = useMemo(() => suggestSettlements(group), [group]);
  const before = useMemo(() => rawDebts(group), [group]);
  const byId = useMemo(() => new Map(group.members.map((m) => [m.id, m])), [group.members]);
  const [paying, setPaying] = useState<Transfer | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const settle = useSettle(group);
  const simplifying = group.simplifyDebts !== false;
  const setSimplifyDebts = useStore((s) => s.setSimplifyDebts);
  // How many payments simplification would need, to show what turning it on saves.
  const minimum = useMemo(
    () =>
      simplifying
        ? transfers.length
        : simplifyDebts(
            computeNetBalances(group),
            group.members.map((m) => m.id),
          ).length,
    [group, simplifying, transfers.length],
  );

  // Celebrate the moment the last balance is cleared (not on every visit to a settled group).
  const prevCount = useRef(transfers.length);
  useEffect(() => {
    if (prevCount.current > 0 && transfers.length === 0) {
      setCelebrate(true);
      navigator.vibrate?.(30);
      const t = setTimeout(() => setCelebrate(false), 3000);
      prevCount.current = 0;
      return () => clearTimeout(t);
    }
    prevCount.current = transfers.length;
  }, [transfers.length]);

  if (group.expenses.length === 0 && group.settlements.length === 0) {
    return (
      <EmptyState icon="scale" title="Nothing to settle yet">
        Balances appear here as soon as you add an expense.
      </EmptyState>
    );
  }

  const maxAbs = Math.max(1, ...group.members.map((m) => Math.abs(stats[m.id]?.net ?? 0)));
  const nonZero = group.members.filter((m) => (stats[m.id]?.net ?? 0) !== 0).length;

  return (
    <div className="stack-lg">
      {celebrate && <Confetti />}

      {transfers.length === 0 ? (
        <div className="card all-settled" role="status">
          <span className="all-settled-icon" aria-hidden="true">
            🎉
          </span>
          <div>
            <h2>All settled</h2>
            <p className="muted">Everyone is settled up. 🎉 Nobody owes anybody anything.</p>
          </div>
        </div>
      ) : (
        <section aria-labelledby="settle-heading">
          <h2 id="settle-heading" className="section-title">
            Suggested payments
          </h2>
          <p className="muted small">
            {simplifying
              ? `${transfers.length} payment${transfers.length > 1 ? 's' : ''} settle${transfers.length === 1 ? 's' : ''} everything — the minimum possible for ${nonZero} people with open balances.`
              : `Simplify group debts is off, so each debt is repaid to the person who paid: ${transfers.length} payment${transfers.length > 1 ? 's' : ''}.`}
          </p>
          {!simplifying && minimum < transfers.length && (
            <Banner tone="info">
              Turning on <strong>Simplify group debts</strong> would settle everything in {minimum} payment{minimum === 1 ? '' : 's'} instead of{' '}
              {transfers.length}.
              <div className="banner-actions">
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setSimplifyDebts(group.id, true)}>
                  Simplify debts
                </button>
              </div>
            </Banner>
          )}
          <ul className="stack">
            {transfers.map((t, i) => {
              const from = byId.get(t.fromId);
              const to = byId.get(t.toId);
              if (!from || !to) return null;
              return (
                <li key={`${t.fromId}-${t.toId}-${i}`} className={`card transfer${isMe(group, t.fromId) ? ' transfer-mine' : ''}`}>
                  <div className="transfer-people">
                    <span className="transfer-person">
                      <Avatar member={from} />
                      <span>{personName(group, from.id)}</span>
                    </span>
                    <span className="transfer-arrow">
                      <strong>{formatINR(t.amountPaise)}</strong>
                      <Icon name="arrowRight" />
                    </span>
                    <span className="transfer-person">
                      <Avatar member={to} />
                      <span>{personName(group, to.id)}</span>
                    </span>
                  </div>
                  <div className="transfer-actions">
                    <button type="button" className="btn btn-sm btn-pay" onClick={() => setPaying(t)}>
                      <Icon name="qr" size={16} /> Pay {formatINR(t.amountPaise, { compact: true })} via UPI
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => settle(t)}>
                      <Icon name="check" size={16} /> Mark settled
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {before.length > transfers.length && transfers.length > 0 && <DebtGraph members={group.members} before={before} after={transfers} meId={group.meId} />}

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
                    <strong>{personName(group, m.id)}</strong>
                    <span className={s.net > 0 ? 'pos' : s.net < 0 ? 'owe' : 'muted'}>{balanceVerb(group, m.id, s.net)}</span>
                  </div>
                  <div className="diverge" aria-hidden="true">
                    <span className="diverge-axis" />
                    {s.net !== 0 && (
                      <span
                        className={`diverge-bar ${s.net > 0 ? 'pos-bg' : 'owe-bg'}`}
                        style={s.net > 0 ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }}
                      />
                    )}
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
                    {personName(group, s.fromId)} paid {personName(group, s.toId, { lower: true })}
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

/** Compact balances for the desktop sidebar next to the expense list. */
export function BalancesSidebar({ group }: { group: Group }) {
  const stats = useMemo(() => computeMemberStats(group), [group]);
  const transfers = useMemo(() => suggestSettlements(group), [group]);
  return (
    <div className="card stack sidebar-card">
      <h2 className="card-title">Balances</h2>
      <ul className="sidebar-balances">
        {group.members.map((m) => {
          const net = stats[m.id]?.net ?? 0;
          return (
            <li key={m.id}>
              <Avatar member={m} size="sm" />
              <span className="grow">{personName(group, m.id)}</span>
              <strong className={net > 0 ? 'pos' : net < 0 ? 'owe' : 'muted'}>{net === 0 ? 'settled' : formatINR(net, { sign: true })}</strong>
            </li>
          );
        })}
      </ul>
      <h3 className="eyebrow">{transfers.length ? `${transfers.length} payment${transfers.length > 1 ? 's' : ''} to settle` : 'All settled'}</h3>
      <ul className="sidebar-transfers">
        {transfers.map((t, i) => (
          <li key={i}>
            {personName(group, t.fromId)} <Icon name="arrowRight" size={14} /> {personName(group, t.toId)} <strong>{formatINR(t.amountPaise)}</strong>
          </li>
        ))}
      </ul>
      <a className="btn btn-sm" href={`#/g/${group.id}/balances`}>
        Settle up <Icon name="arrowRight" size={16} />
      </a>
    </div>
  );
}

function UpiModal({ transfer, group, onClose, onSettled }: { transfer: Transfer | null; group: Group; onClose: () => void; onSettled: (t: Transfer) => void }) {
  const updateMember = useStore((s) => s.updateMember);
  const from = group.members.find((m) => m.id === transfer?.fromId);
  const to = group.members.find((m) => m.id === transfer?.toId);
  const [vpa, setVpa] = useState('');
  const [qr, setQr] = useState('');
  /** Set after "Open UPI app": we ask whether the payment went through when the user returns. */
  const [askConfirm, setAskConfirm] = useState(false);

  const link =
    transfer && to?.upiId ? buildUpiLink({ payeeVpa: to.upiId, payeeName: to.name, amountPaise: transfer.amountPaise, note: `SplitSmart: ${group.name}` }) : '';

  useEffect(() => {
    setQr('');
    if (link) qrDataUrl(link).then(setQr, () => setQr(''));
  }, [link]);
  useEffect(() => {
    setVpa('');
    setAskConfirm(false);
  }, [transfer]);

  const finish = () => {
    if (transfer) onSettled(transfer);
    onClose();
  };

  return (
    <Modal open={!!transfer} title="Pay via UPI" onClose={onClose}>
      {transfer && from && to && (
        <div className="stack center-text">
          <p>
            <strong>{personName(group, from.id)}</strong> {isMe(group, from.id) ? 'pay' : 'pays'} <strong>{personName(group, to.id, { lower: true })}</strong>
          </p>
          <p className="big-amount">{formatINR(transfer.amountPaise)}</p>
          {to.upiId ? (
            <>
              {askConfirm && (
                <div className="confirm-paid" role="alertdialog" aria-labelledby="paid-q">
                  <strong id="paid-q">Did the payment go through?</strong>
                  <div className="row-wrap center">
                    <button type="button" className="btn btn-primary" onClick={finish}>
                      <Icon name="check" size={16} /> Yes, mark settled
                    </button>
                    <button type="button" className="btn" onClick={() => setAskConfirm(false)}>
                      Not yet
                    </button>
                  </div>
                </div>
              )}
              <div className="qr-box">
                {qr ? (
                  <img src={qr} alt={`UPI QR code to pay ${to.name} ${formatINR(transfer.amountPaise)}`} width={220} height={220} />
                ) : (
                  <span className="muted">Generating QR…</span>
                )}
              </div>
              <p className="small muted">Scan with any UPI app, or on a phone tap the button below. UPI ID: {to.upiId}</p>
              <p className="small muted">Some apps block pre-filled links opened from a browser — if so, scan the QR from another phone.</p>
              <div className="row-wrap center">
                <a className="btn btn-primary" href={link} onClick={() => setTimeout(() => setAskConfirm(true), 400)}>
                  Open UPI app
                </a>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    navigator.clipboard?.writeText(link).then(
                      () => toast('UPI link copied'),
                      () => toast('Could not copy', 'error'),
                    );
                  }}
                >
                  <Icon name="link" size={16} /> Copy link
                </button>
              </div>
              <button type="button" className="btn btn-ghost" onClick={finish}>
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
