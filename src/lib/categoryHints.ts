/**
 * Keyword hints for categories. Obvious words ("soda", "cab", "wi-fi") get a category
 * instantly and reliably; only names with no clear hint go to the zero-shot model.
 * This also keeps categories sensible when the model can't load (e.g. offline).
 */
import type { Category } from './types';

/** Multi-word phrases are checked before single words so "water bill" beats "water". */
const PHRASES: [RegExp, Category][] = [
  [/\b(water|electricity|power|gas|maintenance)\s+bill\b/, 'Utilities'],
  [/\bgas\s+cylinder\b|\blpg\b/, 'Utilities'],
  [/\bmovie\s+tickets?\b|\bcinema\b/, 'Entertainment'],
  [/\b(bus|train|flight|metro)\s+tickets?\b/, 'Travel'],
];

const WORDS: Record<Exclude<Category, 'Other'>, string[]> = {
  Food: [
    'pizza',
    'maggi',
    'burger',
    'chai',
    'tea',
    'coffee',
    'dosa',
    'idli',
    'biryani',
    'paneer',
    'chicken',
    'mutton',
    'fish',
    'prawn',
    'curry',
    'noodles',
    'rice',
    'roti',
    'naan',
    'thali',
    'juice',
    'soda',
    'lassi',
    'water',
    'coke',
    'pepsi',
    'sprite',
    'sandwich',
    'momo',
    'momos',
    'samosa',
    'paratha',
    'pav',
    'vada',
    'icecream',
    'ice',
    'cake',
    'brownie',
    'shake',
    'tikka',
    'kebab',
    'roll',
    'fries',
    'soup',
    'calamari',
    'dal',
    'meal',
    'lunch',
    'dinner',
    'breakfast',
    'snack',
    'snacks',
    'canteen',
    'restaurant',
    'dhaba',
    'zomato',
    'swiggy',
    'starter',
    'dessert',
    'manchurian',
    'chilli',
    'fried',
    'masala',
    'egg',
    'omelette',
    'poha',
    'upma',
  ],
  Groceries: [
    'grocery',
    'groceries',
    'dmart',
    'bigbasket',
    'blinkit',
    'zepto',
    'instamart',
    'milk',
    'bread',
    'eggs',
    'atta',
    'sugar',
    'salt',
    'detergent',
    'surf',
    'soap',
    'shampoo',
    'toothpaste',
    'tissue',
    'vegetables',
    'fruits',
    'onion',
    'onions',
    'tomato',
    'potato',
  ],
  Travel: ['cab', 'taxi', 'uber', 'ola', 'rapido', 'auto', 'bus', 'train', 'irctc', 'flight', 'metro', 'fuel', 'petrol', 'diesel', 'toll', 'parking', 'trip'],
  Utilities: ['wifi', 'internet', 'broadband', 'recharge', 'electricity', 'jio', 'airtel', 'bsnl', 'rent', 'laundry', 'dth'],
  Entertainment: ['movie', 'movies', 'film', 'pvr', 'inox', 'netflix', 'spotify', 'hotstar', 'concert', 'game', 'gaming', 'bowling', 'party', 'club', 'show'],
};
const OTHER = ['medicine', 'medicines', 'pharmacy', 'stationery', 'xerox', 'print', 'printout', 'gift'];

/** Ties go to the earlier category (Food first: "butter garlic prawn" is a dish, not groceries). */
const ORDER: Category[] = ['Food', 'Groceries', 'Travel', 'Utilities', 'Entertainment', 'Other'];

export function categoryHint(text: string): Category | undefined {
  const t = text
    .toLowerCase()
    .replace(/wi-?fi/g, 'wifi')
    .replace(/ice\s*cream/g, 'icecream');
  for (const [re, cat] of PHRASES) if (re.test(t)) return cat;
  const words = t.split(/[^a-z]+/).filter(Boolean);
  const score = new Map<Category, number>();
  for (const w of words) {
    for (const [cat, list] of Object.entries(WORDS) as [Category, string[]][]) if (list.includes(w)) score.set(cat, (score.get(cat) ?? 0) + 1);
    if (OTHER.includes(w)) score.set('Other', (score.get('Other') ?? 0) + 1);
  }
  // A pack size ("1kg", "500 ml") is a weak hint for groceries.
  if (/\d+\s?(kg|gm|g|ml|ltr|l)\b/.test(t)) score.set('Groceries', (score.get('Groceries') ?? 0) + 0.5);
  let best: Category | undefined;
  let max = 0;
  for (const cat of ORDER) {
    const s = score.get(cat) ?? 0;
    if (s > max) [best, max] = [cat, s];
  }
  return best;
}
