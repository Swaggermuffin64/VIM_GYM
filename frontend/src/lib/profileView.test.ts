import { describe, expect, it } from 'vitest';
import type { DailyHistoryDay, DailyProfile } from '../api/daily';
import {
  activityGrid,
  activityLevel,
  activitySummary,
  bestFinish,
  raceTimeDelta,
  weekStartAxis,
  showcaseBadges,
  trophyCase,
  weekTicks,
} from './profileView';

const placing = (rank: number, racers: number) => ({
  rank,
  racers,
  raceDate: '2026-11-01',
});

const historyDay = (raceDate: string): DailyHistoryDay => ({
  raceDate,
  bestMs: 1000,
  speedRank: 1,
  racers: 10,
  efficiency: null,
  efficiencyRank: null,
  efficiencyRacers: null,
});

function sampleProfile(): DailyProfile {
  return {
    badges: [
      { id: 'days_7', earnedOn: '2026-09-30' },
      { id: 'streak_7', earnedOn: '2026-10-14' },
      { id: 'first_win', earnedOn: '2026-10-21' },
      { id: 'podium_streak_3', earnedOn: '2026-11-02' },
      { id: 'days_30', earnedOn: '2026-11-08' },
    ],
    unseenBadges: [],
    streaks: {
      participation: { current: 2, longest: 19 },
      podium: { current: 0, longest: 3 },
    },
    counters: { daysRaced: 41, speedWins: 1, efficiencyWins: 0, podiums: 4 },
    personalBests: {
      bestSpeedPlacing: null,
      bestEfficiencyPlacing: null,
      fastest: null,
      mostEfficient: { efficiency: 0.97, raceDate: '2026-11-03' },
    },
    recent: [],
    winDates: [],
  };
}

describe('bestFinish', () => {
  it('prefers the lower rank', () => {
    expect(
      bestFinish({
        bestSpeedPlacing: placing(1, 44),
        bestEfficiencyPlacing: placing(2, 50),
      } as DailyProfile['personalBests'])
    ).toEqual(placing(1, 44));
  });
  it('breaks a rank tie with the larger field', () => {
    expect(
      bestFinish({
        bestSpeedPlacing: placing(1, 10),
        bestEfficiencyPlacing: placing(1, 44),
      } as DailyProfile['personalBests'])
    ).toEqual(placing(1, 44));
  });
  it('returns the only placing, or null when there is none', () => {
    const base = {} as DailyProfile['personalBests'];
    expect(
      bestFinish({
        ...base,
        bestSpeedPlacing: null,
        bestEfficiencyPlacing: placing(3, 9),
      })
    ).toEqual(placing(3, 9));
    expect(
      bestFinish({
        ...base,
        bestSpeedPlacing: null,
        bestEfficiencyPlacing: null,
      })
    ).toBeNull();
  });
});

describe('weekTicks', () => {
  it('marks six raced days then today open', () => {
    const recent = [
      '2026-11-25',
      '2026-11-24',
      '2026-11-23',
      '2026-11-22',
      '2026-11-21',
      '2026-11-20',
    ].map(historyDay);
    expect(weekTicks(recent, '2026-11-26')).toEqual([
      'raced',
      'raced',
      'raced',
      'raced',
      'raced',
      'raced',
      'open',
    ]);
  });
  it('marks a gap day missed and a raced today raced', () => {
    const recent = ['2026-11-26', '2026-11-24'].map(historyDay);
    expect(weekTicks(recent, '2026-11-26')).toEqual([
      'missed',
      'missed',
      'missed',
      'missed',
      'raced',
      'missed',
      'raced',
    ]);
  });
});

describe('activityGrid', () => {
  // 2026-11-26 is a Thursday.
  const today = '2026-11-26';
  it('returns 26 columns of 7 Monday-first rows ending in the current week', () => {
    const grid = activityGrid([], [], today);
    expect(grid).toHaveLength(26);
    expect(grid.every((c) => c.length === 7)).toBe(true);
    expect(grid[25][0].day).toBe('2026-11-23');
    expect(grid[25][3].day).toBe('2026-11-26');
    expect(grid[25][6].day).toBe('2026-11-29');
  });
  it('flags days after today as future', () => {
    const last = activityGrid([], [], today)[25];
    expect(last.map((c) => c.future)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
  });
  it('carries runs and marks daily wins won even without multiplayer wins', () => {
    const grid = activityGrid(
      [
        { day: '2026-11-24', runs: 4, multiplayerWins: 0 },
        { day: '2026-11-25', runs: 1, multiplayerWins: 2 },
      ],
      ['2026-11-24'],
      today
    );
    expect(grid[25][1]).toMatchObject({ runs: 4, won: true });
    expect(grid[25][2]).toMatchObject({ runs: 1, won: true });
    expect(grid[25][0]).toMatchObject({ runs: 0, won: false });
  });
});

describe('activityLevel', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 1],
    [3, 2],
    [5, 2],
    [6, 3],
    [40, 3],
  ])('%i runs -> level %i', (runs, level) =>
    expect(activityLevel(runs)).toBe(level)
  );
});

describe('activitySummary', () => {
  const TODAY_KEY = '2026-11-26';
  it('counts active days and totals multiplayer plus daily wins', () => {
    expect(
      activitySummary(
        [
          { day: '2026-11-01', runs: 2, multiplayerWins: 1 },
          { day: '2026-11-02', runs: 0, multiplayerWins: 0 },
          { day: '2026-11-03', runs: 1, multiplayerWins: 2 },
        ],
        ['2026-11-04', '2026-11-05'],
        TODAY_KEY
      )
    ).toEqual({ daysActive: 2, wins: 5 });
  });
  it('ignores days and wins older than the grid window', () => {
    // 26 weeks ending Thu 2026-11-26 start on Monday 2026-06-01.
    expect(
      activitySummary(
        [
          { day: '2026-05-31', runs: 4, multiplayerWins: 1 },
          { day: '2026-06-01', runs: 1, multiplayerWins: 0 },
        ],
        ['2026-05-31', '2026-06-01'],
        TODAY_KEY
      )
    ).toEqual({ daysActive: 1, wins: 1 });
  });
});

describe('weekStartAxis', () => {
  it('lists UTC Mondays oldest first, ending with this week', () => {
    const axis = weekStartAxis('2026-11-26', 3);
    expect(axis).toEqual(['2026-11-09', '2026-11-16', '2026-11-23']);
  });
  it('defaults to 12 weeks', () => {
    expect(weekStartAxis('2026-11-23')).toHaveLength(12);
  });
});

describe('raceTimeDelta', () => {
  it('reports a faster average', () => {
    expect(raceTimeDelta(10000, 12100)).toEqual({ ms: 2100, faster: true });
  });
  it('reports a slower average', () => {
    expect(raceTimeDelta(12100, 10000)).toEqual({ ms: 2100, faster: false });
  });
  it('is null when the averages are equal or differ by under 50ms', () => {
    expect(raceTimeDelta(10000, 10000)).toBeNull();
    expect(raceTimeDelta(10000, 10040)).toBeNull();
  });
  it('is null when either side is missing', () => {
    expect(raceTimeDelta(null, 5)).toBeNull();
    expect(raceTimeDelta(5, null)).toBeNull();
  });
});

describe('trophyCase', () => {
  it('lists earned badges newest first, then locked by progress', () => {
    const cases = trophyCase(sampleProfile());
    expect(cases.map((t) => t.info.name)).toEqual([
      'Devoted',
      'Hat Trick',
      'Champion',
      'On Fire',
      'Regular',
      'Flawless',
      'Unstoppable',
      'Dynasty',
      'Centurion',
    ]);
    expect(cases[0].earnedOn).toBe('2026-11-08');
    expect(cases[5].earnedOn).toBeNull();
  });
  it('formats progress text', () => {
    const byName = Object.fromEntries(
      trophyCase(sampleProfile()).map((t) => [t.info.name, t])
    );
    expect(byName.Unstoppable.progressText).toBe('19 / 30');
    expect(byName.Unstoppable.fraction).toBeCloseTo(19 / 30);
    expect(byName.Flawless.progressText).toBe('best 97%');
    expect(byName.Flawless.fraction).toBe(0.97);
  });
  it('says Not yet for Flawless with no scored run', () => {
    const p = sampleProfile();
    p.personalBests.mostEfficient = null;
    const flawless = trophyCase(p).find((t) => t.info.id === 'first_perfect');
    expect(flawless).toMatchObject({ progressText: 'Not yet', fraction: 0 });
  });
});

describe('showcaseBadges', () => {
  const earned = [
    { id: 'first_win', earnedOn: '2026-10-21' },
    { id: 'days_7', earnedOn: '2026-09-30' },
    { id: 'days_30', earnedOn: '2026-11-08' },
    { id: 'streak_7', earnedOn: '2026-10-14' },
  ];
  it('keeps earned showcased ids in order and drops unearned ones', () => {
    expect(
      showcaseBadges(['days_100', 'first_win'], earned).map((b) => b.name)
    ).toEqual(['Champion']);
  });
  it('falls back to the three most recent when nothing is showcased', () => {
    expect(showcaseBadges([], earned).map((b) => b.id)).toEqual([
      'days_30',
      'first_win',
      'streak_7',
    ]);
  });
  it('caps a showcase at three', () => {
    expect(
      showcaseBadges(['days_7', 'days_30', 'first_win', 'streak_7'], earned)
    ).toHaveLength(3);
  });
  it('is empty when nothing is earned', () => {
    expect(showcaseBadges(['gone_badge'], [])).toEqual([]);
  });
});
