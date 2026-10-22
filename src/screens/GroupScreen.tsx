import { useMemo } from 'react';
import { AppBar } from '../components/AppBar';
import { Avatar, AvatarStack } from '../components/Avatar';
import { Icon, type IconName } from '../components/Icon';
import { formatINR } from '../lib/money';
import { balancePhrase } from '../lib/people';
import { computeNetBalances, groupSpend, suggestSettlements } from '../lib/settle';
import type { Group } from '../lib/types';
import { useGroup, useStore } from '../store/useStore';
import { BalancesTab, BalancesSidebar } from './group/BalancesTab';
import { ExpensesTab } from './group/ExpensesTab';
import { InsightsTab } from './group/InsightsTab';
import { SettingsTab } from './group/SettingsTab';
import { NotFound } from './NotFound';

const TABS: { id: string; label: string; hint?: string; icon: IconName }[] = [
  { id: 'expenses', label: 'Expenses', icon: 'list' },
  { id: 'balances', label: 'Balances', icon: 'scale' },
  { id: 'insights', label: 'Insights', icon: 'chart' },
  // Members, recurring bills, export and delete all live here, so it's named for the group.
  { id: 'settings', label: 'Group', hint: 'Members & settings', icon: 'users' },
];

export function GroupScreen({ groupId, tab = 'expenses' }: { groupId: string; tab?: string }) {
  const group = useGroup(groupId);
  if (!group) return <NotFound message="This group was deleted or never existed on this device." />;
  const active = TABS.some((t) => t.id === tab) ? tab : 'expenses';
  const noMembers = group.members.length === 0;

  const actions = (size: '' | 'btn-lg') => (
    <>
      <a className={`btn ${size} fab-secondary`} href={`#/g/${group.id}/expense/new`}>
        <Icon name="plus" /> Add expense
      </a>
      <a className={`btn btn-primary ${size} fab-primary`} href={`#/g/${group.id}/scan`}>
        <Icon name="camera" /> Scan receipt
      </a>
    </>
  );

  return (
    <>
      <AppBar
        back="#/"
        title={
          <>
            <span aria-hidden="true">{group.emoji} </span>
            {group.name}
          </>
        }
        subtitle={`${formatINR(groupSpend(group), { compact: true })} spent · ${group.members.length} members`}
        actions={!noMembers && <div className="appbar-cta desktop-only">{actions('')}</div>}
      />
      <nav className="tabs" aria-label="Group sections">
        <div className="tabs-inner">
          {TABS.map((t) => (
            <a
              key={t.id}
              href={`#/g/${group.id}/${t.id}`}
              className={`tab${active === t.id ? ' active' : ''}`}
              aria-current={active === t.id ? 'page' : undefined}
              title={t.hint}
            >
              <Icon name={t.icon} size={18} />
              <span>{t.label}</span>
            </a>
          ))}
        </div>
      </nav>
      <main id="main" className={`page with-fab${active === 'expenses' ? ' page-split' : ''}`}>
        {active !== 'settings' && !noMembers && <GroupStrip group={group} />}
        {active === 'expenses' ? (
          <div className="split-layout">
            <div className="split-main">
              <ExpensesTab group={group} />
            </div>
            {group.expenses.length > 0 && (
              <aside className="split-side desktop-only" aria-label="Balances at a glance">
                <BalancesSidebar group={group} />
              </aside>
            )}
          </div>
        ) : null}
        {active === 'balances' && <BalancesTab group={group} />}
        {active === 'insights' && <InsightsTab group={group} />}
        {active === 'settings' && <SettingsTab group={group} />}
      </main>
      {active !== 'settings' && !noMembers && <div className="fab-bar mobile-only">{actions('btn-lg')}</div>}
    </>
  );
}

/**
 * One-line status under the tabs: your balance and how many payments are pending,
 * linking to Balances. For an imported group it first asks which member you are.
 */
function GroupStrip({ group }: { group: Group }) {
  const setMe = useStore((s) => s.setMe);
  const nets = useMemo(() => computeNetBalances(group), [group]);
  const pending = useMemo(() => suggestSettlements(group).length, [group]);
  const me = group.members.find((m) => m.id === group.meId);

  if (!me) {
    return (
      <div className="group-strip who-are-you" role="group" aria-label="Which one is you?">
        <span className="strip-text">Which one is you?</span>
        <div className="strip-people">
          {group.members.map((m) => (
            <button key={m.id} type="button" className="payer" onClick={() => setMe(group.id, m.id)}>
              <Avatar member={m} size="sm" />
              {m.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const net = nets[me.id] ?? 0;
  return (
    <a className="group-strip" href={`#/g/${group.id}/balances`}>
      <AvatarStack members={group.members} max={5} />
      <span className="strip-text">
        <strong className={net > 0 ? 'pos' : net < 0 ? 'owe' : ''}>{balancePhrase(group, me.id, net)}</strong>
        <span className="muted"> · {pending === 0 ? 'everyone is settled' : `${pending} payment${pending > 1 ? 's' : ''} pending`}</span>
      </span>
      <span className="strip-cta">
        View <Icon name="arrowRight" size={16} />
      </span>
    </a>
  );
}
