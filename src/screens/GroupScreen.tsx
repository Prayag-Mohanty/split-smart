import { AppBar } from '../components/AppBar';
import { AvatarStack } from '../components/Avatar';
import { Icon, type IconName } from '../components/Icon';
import { formatINR } from '../lib/money';
import { groupSpend } from '../lib/settle';
import { useGroup } from '../store/useStore';
import { BalancesTab } from './group/BalancesTab';
import { ExpensesTab } from './group/ExpensesTab';
import { InsightsTab } from './group/InsightsTab';
import { SettingsTab } from './group/SettingsTab';
import { NotFound } from './NotFound';

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: 'expenses', label: 'Expenses', icon: 'list' },
  { id: 'balances', label: 'Balances', icon: 'scale' },
  { id: 'insights', label: 'Insights', icon: 'chart' },
  { id: 'settings', label: 'Members', icon: 'users' },
];

export function GroupScreen({ groupId, tab = 'expenses' }: { groupId: string; tab?: string }) {
  const group = useGroup(groupId);
  if (!group) return <NotFound message="This group was deleted or never existed on this device." />;
  const active = TABS.some((t) => t.id === tab) ? tab : 'expenses';
  const noMembers = group.members.length === 0;

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
        subtitle={`${formatINR(groupSpend(group))} spent · ${group.members.length} members`}
      />
      <nav className="tabs" aria-label="Group sections">
        <div className="tabs-inner">
          {TABS.map((t) => (
            <a key={t.id} href={`#/g/${group.id}/${t.id}`} className={`tab${active === t.id ? ' active' : ''}`} aria-current={active === t.id ? 'page' : undefined}>
              <Icon name={t.icon} size={18} />
              <span>{t.label}</span>
            </a>
          ))}
        </div>
      </nav>
      <main id="main" className="page with-fab">
        {active !== 'settings' && (
          <div className="group-header-row">
            <AvatarStack members={group.members} max={8} />
          </div>
        )}
        {active === 'expenses' && <ExpensesTab group={group} />}
        {active === 'balances' && <BalancesTab group={group} />}
        {active === 'insights' && <InsightsTab group={group} />}
        {active === 'settings' && <SettingsTab group={group} />}
      </main>
      {active !== 'settings' && !noMembers && (
        <div className="fab-bar">
          <a className="btn btn-lg" href={`#/g/${group.id}/expense/new`}>
            <Icon name="plus" /> Add expense
          </a>
          <a className="btn btn-primary btn-lg" href={`#/g/${group.id}/scan`}>
            <Icon name="camera" /> Scan receipt
          </a>
        </div>
      )}
    </>
  );
}
