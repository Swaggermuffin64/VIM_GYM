import { describe, it, expect } from 'vitest';
import { BADGE_CATALOG, chipsFor, formatEfficiency } from './dailyBadges';

describe('chipsFor', () => {
  it('shows nothing for a racer with no history', () => {
    expect(chipsFor(null)).toEqual([]);
  });

  it('skips streaks too short to mention', () => {
    expect(chipsFor({ streak: 2, podiumStreak: 1, wins: 0 })).toEqual([]);
  });

  it('lists streak, podium streak, then wins', () => {
    const chips = chipsFor({ streak: 12, podiumStreak: 4, wins: 9 });
    expect(chips.map((c) => [c.label, c.value])).toEqual([
      ['STRK', '12'],
      ['TOP3', '4'],
      ['WIN', '9'],
    ]);
  });

  it('falls through to wins when a streak is missing', () => {
    const chips = chipsFor({ streak: 0, podiumStreak: 2, wins: 1 });
    expect(chips.map((c) => [c.kind, c.value, c.title])).toEqual([
      ['podium', '2', 'Top 3 for 2 days running'],
      ['win', '1', '1 daily win'],
    ]);
  });
});

describe('formatEfficiency', () => {
  it.each([
    [1, '100%'],
    [0.875, '87.5%'],
    [0.5, '50%'],
    [7 / 9, '77.8%'],
    // Close to perfect, but not perfect, never reads 100%.
    [0.9996, '99.9%'],
  ])('%s -> %s', (efficiency, expected) => {
    expect(formatEfficiency(efficiency)).toBe(expected);
  });
});

describe('BADGE_CATALOG', () => {
  // Must stay in step with BADGE_IDS in backend/daily/badges.ts.
  it('lists each server badge id once', () => {
    expect(BADGE_CATALOG.map((b) => b.id)).toEqual([
      'days_7',
      'days_30',
      'days_100',
      'streak_7',
      'streak_30',
      'podium_streak_3',
      'podium_streak_7',
      'first_win',
      'first_perfect',
    ]);
  });
});
