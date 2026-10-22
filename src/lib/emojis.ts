/** Emoji sets for the group-icon and avatar pickers, grouped so the right one is quick to find. */
export interface EmojiSet {
  label: string;
  emojis: string[];
}

export const GROUP_EMOJI_SETS: EmojiSet[] = [
  { label: 'Trips', emojis: ['🏖️', '🏔️', '⛺', '✈️', '🚆', '🚌', '🚗', '🛵', '🏝️', '🗺️', '🧳', '🏕️', '🚢', '🌄', '🏞️', '🕌'] },
  { label: 'Food', emojis: ['🍕', '🍔', '🍛', '🍜', '🍣', '🥘', '🌮', '🍩', '☕', '🧋', '🍺', '🍷', '🥗', '🍦', '🍿', '🥤'] },
  { label: 'Home', emojis: ['🏠', '🏢', '🛋️', '🛒', '📶', '💡', '🚿', '🧹', '🧺', '🔌', '🪴', '🐶', '🐱', '🔑', '🧾', '🍳'] },
  { label: 'College', emojis: ['🎓', '📚', '🏫', '🌙', '🧪', '💻', '📝', '🎒', '🖨️', '🧑‍💻', '🏆', '🎤', '📐', '🔬', '🗂️', '🚲'] },
  { label: 'Fun', emojis: ['🎉', '🎂', '🎁', '🎬', '🎮', '🎳', '🎵', '🎸', '⚽', '🏏', '🏸', '🏋️', '🎲', '🎟️', '💃', '🎆'] },
  { label: 'Other', emojis: ['👥', '💰', '💸', '🧑‍🤝‍🧑', '👨‍👩‍👧', '💼', '🏥', '💊', '🛍️', '👗', '💍', '⛽', '🅿️', '📦', '🌟', '❤️'] },
];

export const AVATAR_EMOJI_SETS: EmojiSet[] = [
  { label: 'Faces', emojis: ['😎', '😄', '🤓', '😇', '🥳', '🤠', '😴', '🤩', '😺', '🤖', '👻', '👽', '🧐', '😜', '🥸', '🫠'] },
  { label: 'Animals', emojis: ['🦁', '🐼', '🦊', '🐯', '🐸', '🐵', '🦄', '🐙', '🐶', '🐱', '🐨', '🐧', '🦉', '🐢', '🐝', '🦋'] },
  { label: 'Things', emojis: ['🌟', '⚡', '🔥', '🌈', '🍀', '🌸', '🌻', '🌊', '🎧', '📸', '🎨', '⚽', '🏏', '🎸', '☕', '🍕'] },
];

/** Name keywords → indicative group icons, so "Goa trip" offers a beach before the user hunts for one. */
const KEYWORDS: [RegExp, string[]][] = [
  [/goa|beach|sea|island|andaman|kerala/i, ['🏖️', '🏝️', '🌊']],
  [/trek|hill|mountain|manali|himalaya|ladakh|camp/i, ['🏔️', '⛺', '🏕️']],
  [/trip|travel|tour|vacation|holiday|outing/i, ['✈️', '🧳', '🗺️']],
  [/train|rail/i, ['🚆']],
  [/road|drive|car|bike|ride/i, ['🚗', '🛵', '⛽']],
  [/flat|room|home|house|pg|hostel|rent|wing|bhawan/i, ['🏠', '🛋️', '🔑']],
  [/grocer|mart|kirana|ration/i, ['🛒']],
  [/wifi|internet|broadband|bill|electric|utilit/i, ['📶', '💡', '🧾']],
  [/night|canteen|midnight|maggi|ANC|mess/i, ['🌙', '🍜', '☕']],
  [/pizza/i, ['🍕']],
  [/food|dinner|lunch|eat|biryani|restaurant|cafe|zomato|swiggy/i, ['🍛', '🍔', '🍽️']],
  [/coffee|chai|tea/i, ['☕']],
  [/drink|party|bar|pub|beer/i, ['🍺', '🎉', '🍷']],
  [/birthday|bday/i, ['🎂', '🎁', '🎉']],
  [/gift|wedding|shaadi/i, ['🎁', '💍']],
  [/fest|concert|gig|music|waves|quark|spree/i, ['🎆', '🎵', '🎟️']],
  [/movie|film|cinema|netflix|ott/i, ['🎬', '🍿']],
  [/game|gaming|ps5|bowling/i, ['🎮', '🎳']],
  [/cricket|ipl/i, ['🏏']],
  [/football|futsal/i, ['⚽']],
  [/gym|fitness|badminton|sport/i, ['🏋️', '🏸']],
  [/project|hackathon|club|team|dept|lab/i, ['💻', '🧑‍💻', '🏆']],
  [/college|class|course|book|exam|study/i, ['🎓', '📚']],
  [/shop|mall|cloth/i, ['🛍️', '👗']],
  [/doctor|medic|hospital|pharma/i, ['🏥', '💊']],
  [/family|parents|mom|dad/i, ['👨‍👩‍👧']],
];

/** Up to `max` distinct icons suggested by words in a group name. */
export function suggestGroupEmojis(name: string, max = 6): string[] {
  const out: string[] = [];
  for (const [re, emojis] of KEYWORDS) if (re.test(name)) for (const e of emojis) if (!out.includes(e)) out.push(e);
  return out.slice(0, max);
}

const PICTOGRAPHIC = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

/** The first emoji in typed text (whole grapheme, so 🧑‍💻 and 🇮🇳 stay intact), or null if there is none. */
export function firstEmoji(text: string): string | null {
  const graphemes =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment)
      : Array.from(text);
  return graphemes.find((g) => PICTOGRAPHIC.test(g)) ?? null;
}
