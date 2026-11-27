import { describe, it, expect } from 'vitest';
import {
  BADGE_CATALOG,
  badgeInfo,
  badgeTitle,
  winSplit,
  formatEfficiency,
} from './dailyBadges';

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

describe('winSplit / badgeTitle', () => {
  const win = badgeInfo('first_win')!;
  const regular = badgeInfo('days_7')!;

  it('splits the win badge by board once the player has a win', () => {
    const wins = { speed: 3, efficiency: 2 };
    expect(winSplit(win, wins)).toEqual(wins);
    expect(badgeTitle(win, wins)).toBe('Champion: 3 speed, 2 efficiency wins');
  });

  it('keeps the catalog value with no wins or unknown counts', () => {
    expect(winSplit(win, { speed: 0, efficiency: 0 })).toBeNull();
    expect(winSplit(win, null)).toBeNull();
    expect(badgeTitle(win, null)).toBe('Champion');
  });

  it('uses the singular for a single win', () => {
    expect(badgeTitle(win, { speed: 0, efficiency: 1 })).toBe(
      'Champion: 0 speed, 1 efficiency win'
    );
  });

  it('leaves every other badge alone', () => {
    expect(winSplit(regular, { speed: 3, efficiency: 2 })).toBeNull();
    expect(badgeTitle(regular, { speed: 3, efficiency: 2 })).toBe('Regular');
  });
});
