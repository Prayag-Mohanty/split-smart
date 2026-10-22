/** A ready-made sample group so the app can be explored without scanning anything. */
import { AVATAR_COLORS, todayIso, uid } from './ids';
import type { Group, Member } from './types';

export function demoGroup(): Group {
  const names = ['Riya', 'Arjun', 'Meera', 'Kabir'];
  const members: Member[] = names.map((name, i) => ({
    id: uid('m_'),
    name,
    color: AVATAR_COLORS[i],
    upiId: `${name.toLowerCase()}@okaxis`,
  }));
  const [riya, arjun, meera, kabir] = members.map((m) => m.id);
  const all = members.map((m) => m.id);
  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const item = (name: string, qty: number, unit: number, assignees: string[], category: 'Food' | 'Groceries' = 'Food') => ({
    id: uid('i_'),
    name,
    qty,
    unitPaise: unit,
    totalPaise: qty * unit,
    category,
    assignees,
  });
  return {
    id: uid('g_'),
    name: 'Night Canteen Gang',
    emoji: '🌙',
    createdAt: Date.now(),
    members,
    settlements: [],
    recurring: [
      {
        id: uid('r_'),
        description: 'Wi-Fi recharge',
        totalPaise: 59900,
        payerId: kabir,
        category: 'Utilities',
        split: { mode: 'equal', participants: all, values: {} },
        frequency: 'monthly',
        nextDate: nextMonthFirst(),
        active: true,
      },
    ],
    expenses: [
      {
        id: uid('e_'),
        kind: 'itemized',
        description: 'Night Canteen order',
        date: todayIso(),
        payerId: riya,
        category: 'Food',
        createdAt: Date.now(),
        items: [
          item('Large Pizza', 1, 40000, all),
          item('Maggi', 1, 6000, [arjun]),
          item('Maggi', 1, 6000, [kabir]),
          item('Maggi', 1, 6000, [riya]),
          item('Cold Coffee', 1, 22000, [meera]),
        ],
        adjustments: [
          { id: uid('a_'), label: 'CGST 2.5%', kind: 'tax', amountPaise: 2000 },
          { id: uid('a_'), label: 'SGST 2.5%', kind: 'tax', amountPaise: 2000 },
        ],
        printedTotalPaise: 84000,
      },
      {
        id: uid('e_'),
        kind: 'manual',
        description: 'Cab to Panjim',
        date: day(3),
        payerId: arjun,
        category: 'Travel',
        createdAt: Date.now() - 3,
        totalPaise: 64000,
        split: { mode: 'equal', participants: all, values: {} },
      },
      {
        id: uid('e_'),
        kind: 'manual',
        description: 'Movie tickets',
        date: day(6),
        payerId: meera,
        category: 'Entertainment',
        createdAt: Date.now() - 6,
        totalPaise: 90000,
        split: { mode: 'shares', participants: [riya, arjun, meera], values: { [riya]: 1, [arjun]: 1, [meera]: 1 } },
      },
    ],
  };
}

function nextMonthFirst(): string {
  const d = new Date();
  return `${d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear()}-${String(((d.getMonth() + 1) % 12) + 1).padStart(2, '0')}-01`;
}
