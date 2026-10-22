import type { Category } from '../lib/types';

/**
 * Natural-language descriptions fed to the zero-shot model as candidate labels.
 * Descriptive phrases score far better with NLI models than one-word category names.
 */
export const CATEGORY_LABELS: { category: Category; label: string }[] = [
  { category: 'Food', label: 'food, a meal, snacks or drinks' },
  { category: 'Groceries', label: 'groceries or household supplies' },
  { category: 'Travel', label: 'travel, transport, fuel or tickets' },
  { category: 'Utilities', label: 'a utility bill, internet or mobile recharge' },
  { category: 'Entertainment', label: 'entertainment, movies, games or a party' },
  { category: 'Other', label: 'stationery, clothes, medicine or something else' },
];

export interface ClassifierRequest {
  id: number;
  texts: string[];
}

export type ClassifierResponse =
  | { type: 'progress'; progress: number }
  | { type: 'ready' }
  | { type: 'result'; id: number; results: { category: Category; score: number }[] }
  | { type: 'error'; id: number; message: string };
