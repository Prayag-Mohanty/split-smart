/**
 * Second-person copy helpers: the member marked as "you" on this device is called
 * "You" everywhere, so balances read "You owe Riya ₹168" instead of "Arjun owes Riya ₹168".
 */
import { formatINR, type Paise } from './money';
import type { Group, MemberId } from './types';

export function isMe(group: Pick<Group, 'meId'>, id: MemberId): boolean {
  return !!group.meId && group.meId === id;
}

/** Display name, "You" for the current user. Pass `lower` mid-sentence ("paid you"). */
export function personName(group: Pick<Group, 'meId' | 'members'>, id: MemberId, opts: { lower?: boolean } = {}): string {
  if (isMe(group, id)) return opts.lower ? 'you' : 'You';
  return group.members.find((m) => m.id === id)?.name ?? 'Someone';
}

/** The verb part on its own: "get back ₹672" (you) / "gets back ₹672" / "owes ₹168" / "is settled up". */
export function balanceVerb(group: Pick<Group, 'meId'>, id: MemberId, net: Paise): string {
  const me = isMe(group, id);
  if (net > 0) return `${me ? 'get' : 'gets'} back ${formatINR(net)}`;
  if (net < 0) return `${me ? 'owe' : 'owes'} ${formatINR(-net)}`;
  return `${me ? 'are' : 'is'} settled up`;
}

/** "You get back ₹672" / "Arjun owes ₹168" / "Meera is settled up". */
export function balancePhrase(group: Pick<Group, 'meId' | 'members'>, id: MemberId, net: Paise): string {
  return `${personName(group, id)} ${balanceVerb(group, id, net)}`;
}

/** "Arjun → Riya ₹168", using "You" where it applies. */
export function transferPhrase(group: Pick<Group, 'meId' | 'members'>, fromId: MemberId, toId: MemberId, amount: Paise): string {
  return `${personName(group, fromId)} → ${personName(group, toId)} ${formatINR(amount)}`;
}
