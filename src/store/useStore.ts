/**
 * Application state (zustand) persisted to localStorage so groups, expenses and
 * settlements survive a refresh. The store only holds data and simple mutations —
 * all money maths lives in src/lib.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { AVATAR_COLORS, todayIso, uid } from '../lib/ids';
import { materialiseRecurring } from '../lib/recurring';
import type { Expense, Group, Member, RecurringExpense, Settlement } from '../lib/types';

export interface Settings {
  autoCategorize: boolean;
}

interface State {
  groups: Group[];
  settings: Settings;

  createGroup: (name: string, memberNames?: string[], emoji?: string) => string;
  renameGroup: (groupId: string, name: string, emoji?: string) => void;
  deleteGroup: (groupId: string) => void;
  importGroup: (group: Group) => string;

  addMember: (groupId: string, member: Omit<Member, 'id' | 'color'> & { color?: string }) => string;
  updateMember: (groupId: string, memberId: string, patch: Partial<Omit<Member, 'id'>>) => void;
  removeMember: (groupId: string, memberId: string) => void;

  saveExpense: (groupId: string, expense: Expense) => void;
  deleteExpense: (groupId: string, expenseId: string) => void;

  addSettlement: (groupId: string, settlement: Omit<Settlement, 'id'>) => void;
  deleteSettlement: (groupId: string, settlementId: string) => void;

  saveRecurring: (groupId: string, recurring: RecurringExpense) => void;
  deleteRecurring: (groupId: string, recurringId: string) => void;
  /** Create any recurring expenses that have come due. Returns how many were added. */
  runRecurring: () => number;

  updateSettings: (patch: Partial<Settings>) => void;
}

const updateGroup = (groups: Group[], id: string, fn: (g: Group) => Group) => groups.map((g) => (g.id === id ? fn(g) : g));

/** Is a member referenced by any expense, settlement or recurring template? */
export function memberInUse(group: Group, memberId: string): boolean {
  return (
    group.expenses.some(
      (e) =>
        e.payerId === memberId ||
        (e.kind === 'manual' ? e.split.participants.includes(memberId) : e.items.some((i) => i.assignees.includes(memberId))),
    ) ||
    group.settlements.some((s) => s.fromId === memberId || s.toId === memberId) ||
    group.recurring.some((r) => r.payerId === memberId || r.split.participants.includes(memberId))
  );
}

function newMember(name: string, index: number, extra: Partial<Member> = {}): Member {
  return { id: uid('m_'), name: name.trim(), color: AVATAR_COLORS[index % AVATAR_COLORS.length], ...extra };
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      groups: [],
      settings: { autoCategorize: true },

      createGroup: (name, memberNames = [], emoji) => {
        const id = uid('g_');
        const members = memberNames.filter((n) => n.trim()).map((n, i) => newMember(n, i));
        set((s) => ({
          groups: [
            { id, name: name.trim(), emoji, createdAt: Date.now(), members, expenses: [], settlements: [], recurring: [] },
            ...s.groups,
          ],
        }));
        return id;
      },
      renameGroup: (groupId, name, emoji) =>
        set((s) => ({ groups: updateGroup(s.groups, groupId, (g) => ({ ...g, name: name.trim() || g.name, emoji })) })),
      deleteGroup: (groupId) => set((s) => ({ groups: s.groups.filter((g) => g.id !== groupId) })),
      importGroup: (group) => {
        // Always import as a new group so an import can never clobber local data.
        const id = uid('g_');
        set((s) => ({ groups: [{ ...group, id, createdAt: Date.now() }, ...s.groups] }));
        return id;
      },

      addMember: (groupId, member) => {
        const group = get().groups.find((g) => g.id === groupId);
        const m = newMember(member.name, group?.members.length ?? 0, {
          emoji: member.emoji,
          upiId: member.upiId,
          ...(member.color ? { color: member.color } : {}),
        });
        set((s) => ({ groups: updateGroup(s.groups, groupId, (g) => ({ ...g, members: [...g.members, m] })) }));
        return m.id;
      },
      updateMember: (groupId, memberId, patch) =>
        set((s) => ({
          groups: updateGroup(s.groups, groupId, (g) => ({
            ...g,
            members: g.members.map((m) => (m.id === memberId ? { ...m, ...patch } : m)),
          })),
        })),
      removeMember: (groupId, memberId) =>
        set((s) => ({
          groups: updateGroup(s.groups, groupId, (g) =>
            memberInUse(g, memberId) ? g : { ...g, members: g.members.filter((m) => m.id !== memberId) },
          ),
        })),

      saveExpense: (groupId, expense) =>
        set((s) => ({
          groups: updateGroup(s.groups, groupId, (g) => {
            const exists = g.expenses.some((e) => e.id === expense.id);
            return { ...g, expenses: exists ? g.expenses.map((e) => (e.id === expense.id ? expense : e)) : [expense, ...g.expenses] };
          }),
        })),
      deleteExpense: (groupId, expenseId) =>
        set((s) => ({ groups: updateGroup(s.groups, groupId, (g) => ({ ...g, expenses: g.expenses.filter((e) => e.id !== expenseId) })) })),

      addSettlement: (groupId, settlement) =>
        set((s) => ({
          groups: updateGroup(s.groups, groupId, (g) => ({ ...g, settlements: [{ ...settlement, id: uid('s_') }, ...g.settlements] })),
        })),
      deleteSettlement: (groupId, settlementId) =>
        set((s) => ({
          groups: updateGroup(s.groups, groupId, (g) => ({ ...g, settlements: g.settlements.filter((x) => x.id !== settlementId) })),
        })),

      saveRecurring: (groupId, recurring) => {
        set((s) => ({
          groups: updateGroup(s.groups, groupId, (g) => {
            const exists = g.recurring.some((r) => r.id === recurring.id);
            return { ...g, recurring: exists ? g.recurring.map((r) => (r.id === recurring.id ? recurring : r)) : [...g.recurring, recurring] };
          }),
        }));
        get().runRecurring();
      },
      deleteRecurring: (groupId, recurringId) =>
        set((s) => ({ groups: updateGroup(s.groups, groupId, (g) => ({ ...g, recurring: g.recurring.filter((r) => r.id !== recurringId) })) })),

      runRecurring: () => {
        const today = todayIso();
        let added = 0;
        const groups = get().groups.map((g) => {
          if (!g.recurring.some((r) => r.active && r.nextDate <= today)) return g;
          const newExpenses: Expense[] = [];
          const recurring = g.recurring.map((r) => {
            const { expenses, template } = materialiseRecurring(r, today, () => uid('e_'));
            newExpenses.push(...expenses);
            return template;
          });
          added += newExpenses.length;
          return { ...g, recurring, expenses: [...newExpenses.reverse(), ...g.expenses] };
        });
        if (added) set({ groups });
        return added;
      },

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
    }),
    {
      name: 'splitsmart:v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ groups: s.groups, settings: s.settings }),
    },
  ),
);

/** Convenience selector for a single group. */
export const useGroup = (groupId: string | undefined) => useStore((s) => s.groups.find((g) => g.id === groupId));
