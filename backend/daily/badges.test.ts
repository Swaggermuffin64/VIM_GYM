// backend/daily/badges.test.ts
import { describe, it, expect } from 'vitest';
import type { DailyDayResult } from '../db/dailyResults.js';
import {
  addDays,
  chipsByUser,
  isBadgeId,
  RECENT_DAYS,
  summarizeDailyHistory,
} from './badges.js';

const TODAY = '2026-10-19';

/** A raced day for user u1; mid-pack on both boards unless overridden. */
function day(
  raceDate: string,
  overrides: Partial<DailyDayResult> = {}
): DailyDayResult {
  return {
    userId: 'u1',
    raceDate,
    bestMs: 40_000,
    speedRank: 10,
    racers: 30,
    efficiency: 0.8,
    efficiencyMs: 42_000,
    optimalKeys: 40,
    actualKeys: 50,
    efficiencyRank: 10,
    efficiencyRacers: 28,
    ...overrides,
  };
}

/** `count` consecutive raced days ending on `last`, oldest first. */
function daysEnding(
  last: string,
  count: number,
  overrides: Partial<DailyDayResult> = {}
): DailyDayResult[] {
  return Array.from({ length: count }, (_, i) =>
    day(addDays(last, i - count + 1), overrides)
  );
}

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('participation streak', () => {
  it('stays alive when the user has not raced yet today', () => {
    const s = summarizeDailyHistory(daysEnding('2026-10-18', 4), TODAY);
    expect(s.streaks.participation).toEqual({ current: 4, longest: 4 });
  });

  it('includes today once raced', () => {
    const s = summarizeDailyHistory(daysEnding(TODAY, 4), TODAY);
    expect(s.streaks.participation.current).toBe(4);
  });

  it('is broken by a fully missed day, keeping the longest run', () => {
    const history = [
      ...daysEnding('2026-10-10', 5),
      ...daysEnding('2026-10-17', 2),
    ];
    const s = summarizeDailyHistory(history, TODAY);
    expect(s.streaks.participation).toEqual({ current: 0, longest: 5 });
  });
});

describe('podium streak', () => {
  it('counts top 3 on either board, through yesterday', () => {
    const history = [
      day('2026-10-16', { speedRank: 3 }),
      day('2026-10-17', { efficiencyRank: 2 }),
      day('2026-10-18', { speedRank: 1 }),
    ];
    const s = summarizeDailyHistory(history, TODAY);
    expect(s.streaks.podium).toEqual({ current: 3, longest: 3 });
    expect(s.counters.podiums).toBe(3);
  });

  it("ignores today's podium, which can still be lost", () => {
    const history = [
      day('2026-10-18', { speedRank: 1 }),
      day(TODAY, { speedRank: 1 }),
    ];
    const s = summarizeDailyHistory(history, TODAY);
    expect(s.streaks.podium.current).toBe(1);
    expect(s.counters.speedWins).toBe(1);
  });

  it('is broken by a raced day off the podium', () => {
    const history = [
      day('2026-10-16', { speedRank: 1 }),
      day('2026-10-17', { speedRank: 4, efficiencyRank: 4 }),
      day('2026-10-18', { speedRank: 2 }),
    ];
    const s = summarizeDailyHistory(history, TODAY);
    expect(s.streaks.podium).toEqual({ current: 1, longest: 1 });
  });

  it('does not treat an unscorable efficiency day as off-podium on speed', () => {
    const history = [
      day('2026-10-18', {
        speedRank: 2,
        efficiency: null,
        efficiencyMs: null,
        optimalKeys: null,
        actualKeys: null,
        efficiencyRank: null,
        efficiencyRacers: null,
      }),
    ];
    expect(summarizeDailyHistory(history, TODAY).streaks.podium.current).toBe(
      1
    );
  });
});

describe('badges', () => {
  it('dates day-count and streak badges to the day the threshold was crossed', () => {
    const history = daysEnding('2026-10-18', 8);
    const s = summarizeDailyHistory(history, TODAY);
    expect(s.badges).toEqual([
      { id: 'days_7', earnedOn: '2026-10-17' },
      { id: 'streak_7', earnedOn: '2026-10-17' },
    ]);
  });

  it('awards a streak badge earned in a past, broken run', () => {
    const history = [...daysEnding('2026-09-30', 7), day('2026-10-18')];
    const s = summarizeDailyHistory(history, TODAY);
    expect(s.badges).toContainEqual({ id: 'streak_7', earnedOn: '2026-09-30' });
    expect(s.streaks.participation.current).toBe(1);
  });

  it('awards first_win for an efficiency win on a closed day only', () => {
    expect(
      summarizeDailyHistory([day(TODAY, { efficiencyRank: 1 })], TODAY).badges
    ).toEqual([]);
    expect(
      summarizeDailyHistory([day('2026-10-18', { efficiencyRank: 1 })], TODAY)
        .badges
    ).toEqual([{ id: 'first_win', earnedOn: '2026-10-18' }]);
  });

  it('awards first_perfect for a 100% run, today included', () => {
    const s = summarizeDailyHistory([day(TODAY, { efficiency: 1 })], TODAY);
    expect(s.badges).toEqual([{ id: 'first_perfect', earnedOn: TODAY }]);
  });

  it('awards podium streak badges', () => {
    const s = summarizeDailyHistory(
      daysEnding('2026-10-18', 3, { speedRank: 2 }),
      TODAY
    );
    expect(s.badges).toContainEqual({
      id: 'podium_streak_3',
      earnedOn: '2026-10-18',
    });
  });

  it('recognizes only catalog ids', () => {
    expect(isBadgeId('days_7')).toBe(true);
    expect(isBadgeId('days_8')).toBe(false);
    expect(isBadgeId(7)).toBe(false);
  });
});

describe('personal bests', () => {
  it('prefers the lower rank, then the bigger field, among closed days', () => {
    const history = [
      day('2026-10-15', { speedRank: 2, racers: 50 }),
      day('2026-10-16', { speedRank: 2, racers: 80 }),
      day('2026-10-17', { speedRank: 3, racers: 200 }),
      day(TODAY, { speedRank: 1, racers: 5 }),
    ];
    const s = summarizeDailyHistory(history, TODAY);
    expect(s.personalBests.bestSpeedPlacing).toEqual({
      rank: 2,
      racers: 80,
      raceDate: '2026-10-16',
    });
  });

  it('includes today in fastest time and best efficiency', () => {
    const history = [
      day('2026-10-18', { bestMs: 30_000, efficiency: 0.9 }),
      day(TODAY, { bestMs: 25_000, efficiency: 0.95 }),
    ];
    const s = summarizeDailyHistory(history, TODAY);
    expect(s.personalBests.fastest).toEqual({ ms: 25_000, raceDate: TODAY });
    expect(s.personalBests.mostEfficient).toEqual({
      efficiency: 0.95,
      raceDate: TODAY,
    });
  });

  it('is empty for a user with no history', () => {
    const s = summarizeDailyHistory([], TODAY);
    expect(s.personalBests).toEqual({
      bestSpeedPlacing: null,
      bestEfficiencyPlacing: null,
      fastest: null,
      mostEfficient: null,
    });
    expect(s.streaks.participation).toEqual({ current: 0, longest: 0 });
  });
});

describe('recent', () => {
  it(`lists the latest ${RECENT_DAYS} raced days, newest first`, () => {
    const s = summarizeDailyHistory(daysEnding(TODAY, 20), TODAY);
    expect(s.recent).toHaveLength(RECENT_DAYS);
    expect(s.recent[0]!.raceDate).toBe(TODAY);
  });
});

describe('chipsByUser', () => {
  it('summarizes each user in a mixed history separately', () => {
    const chips = chipsByUser(
      [
        ...daysEnding('2026-10-18', 3, { speedRank: 1 }),
        day('2026-10-18', { userId: 'u2', efficiencyRank: 1 }),
      ],
      TODAY
    );
    expect(chips.get('u1')).toEqual({ streak: 3, podiumStreak: 3, wins: 3 });
    expect(chips.get('u2')).toEqual({ streak: 1, podiumStreak: 1, wins: 1 });
  });
});
