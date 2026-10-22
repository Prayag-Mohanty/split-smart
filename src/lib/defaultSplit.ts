/**
 * Applying a saved default split to a new expense. Members may have been removed or added
 * since the default was saved, so it is re-checked against the group every time.
 */
import type { DefaultSplit, Group, MemberId, SplitSpec } from './types';

export function initialSplit(group: Group, saved?: DefaultSplit): { payerId: MemberId; split: SplitSpec } {
  const ids = group.members.map((m) => m.id);
  const fallbackPayer = group.meId ?? ids[0] ?? '';
  const fallback = { payerId: fallbackPayer, split: { mode: 'equal' as const, participants: ids, values: {} } };
  if (!saved) return fallback;
  const participants = saved.split.participants.filter((id) => ids.includes(id));
  if (participants.length === 0) return fallback;
  const values = Object.fromEntries(Object.entries(saved.split.values).filter(([id]) => participants.includes(id)));
  // Exact amounts depend on the bill, so a saved "exact" default falls back to equal.
  const mode = saved.split.mode === 'exact' ? 'equal' : saved.split.mode;
  return {
    payerId: saved.payerId && ids.includes(saved.payerId) ? saved.payerId : fallbackPayer,
    split: { mode, participants, values: mode === 'equal' ? {} : values },
  };
}

/** Human summary, e.g. "Paid by you and split equally" / "Paid by Riya, split by shares (2 : 1 : 1)". */
export function describeDefault(group: Group, saved?: DefaultSplit): string {
  const { payerId, split } = initialSplit(group, saved);
  const payer = payerId === group.meId ? 'you' : (group.members.find((m) => m.id === payerId)?.name ?? 'someone');
  const everyone = split.participants.length === group.members.length;
  const who = everyone ? '' : ` between ${split.participants.length} of ${group.members.length} people`;
  const how =
    split.mode === 'equal'
      ? 'split equally'
      : split.mode === 'percent'
        ? `split by percentage (${split.participants.map((id) => `${split.values[id] ?? 0}%`).join(' / ')})`
        : `split by shares (${split.participants.map((id) => split.values[id] ?? 0).join(' : ')})`;
  return `Paid by ${payer} and ${how}${who}`;
}
