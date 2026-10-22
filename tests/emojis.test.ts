import { describe, expect, it } from 'vitest';
import { AVATAR_EMOJI_SETS, firstEmoji, GROUP_EMOJI_SETS, suggestGroupEmojis } from '../src/lib/emojis';

describe('emoji pickers', () => {
  it('suggests icons that match the group name', () => {
    expect(suggestGroupEmojis('Goa trip 2026')[0]).toBe('🏖️');
    expect(suggestGroupEmojis('Night Canteen Gang')).toContain('🌙');
    expect(suggestGroupEmojis('Flat 4B rent')).toContain('🏠');
    expect(suggestGroupEmojis('Xyzzy')).toEqual([]);
    expect(suggestGroupEmojis('Goa beach trek trip party birthday').length).toBeLessThanOrEqual(6);
  });

  it('takes the first whole emoji from typed text', () => {
    expect(firstEmoji('🛺')).toBe('🛺');
    expect(firstEmoji('abc 🧑‍💻 x')).toBe('🧑‍💻');
    expect(firstEmoji('🇮🇳')).toBe('🇮🇳');
    expect(firstEmoji('hello')).toBeNull();
    expect(firstEmoji('123')).toBeNull();
  });

  it('has no duplicates inside any set', () => {
    for (const s of [...GROUP_EMOJI_SETS, ...AVATAR_EMOJI_SETS]) expect(new Set(s.emojis).size).toBe(s.emojis.length);
  });
});
