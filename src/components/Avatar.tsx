import type { Member } from '../lib/types';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

interface AvatarProps {
  member: Pick<Member, 'name' | 'color' | 'emoji'>;
  size?: 'sm' | 'md' | 'lg';
  /** Render faded (e.g. unselected in a toggle). */
  dim?: boolean;
}

export function Avatar({ member, size = 'md', dim }: AvatarProps) {
  return (
    <span
      className={`avatar avatar-${size}${dim ? ' avatar-dim' : ''}`}
      style={{ background: member.color }}
      aria-hidden="true"
      title={member.name}
    >
      {member.emoji || initials(member.name)}
    </span>
  );
}

export function AvatarStack({ members, max = 5 }: { members: Member[]; max?: number }) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <span className="avatar-stack" aria-label={members.map((m) => m.name).join(', ')}>
      {shown.map((m) => (
        <Avatar key={m.id} member={m} size="sm" />
      ))}
      {extra > 0 && <span className="avatar avatar-sm avatar-more">+{extra}</span>}
    </span>
  );
}
