// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { DailyHistoryDay, DailyProfile } from '../../api/daily';
import type { RecentGame } from '../../api/profile';
import { ActivityCalendar } from './ActivityCalendar';
import { MultiplayerTile } from './MultiplayerTile';
import { RaceOfTheDayTile } from './RaceOfTheDayTile';
import { RaceTimeChart } from './RaceTimeChart';
import { RecentGames } from './RecentGames';
import { TrophyCase } from './TrophyCase';

afterEach(cleanup);

const TODAY = '2026-11-26';

const historyDay = (raceDate: string, speedRank = 1): DailyHistoryDay => ({
  raceDate,
  bestMs: 1000,
  speedRank,
  racers: 44,
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
      fastest: { ms: 6800, raceDate: '2026-11-01' },
      mostEfficient: { efficiency: 0.97, raceDate: '2026-11-03' },
    },
    recent: [historyDay('2026-11-25')],
    winDates: [],
  };
}

const game = (overrides: Partial<RecentGame>): RecentGame => ({
  playMode: 'quick_play',
  position: null,
  finished: true,
  leftRace: false,
  totalTimeMs: 9200,
  startedAt: '2026-11-20T12:00:00Z',
  ...overrides,
});

describe('MultiplayerTile', () => {
  it('renders nothing at 0 races', () => {
    const { container } = render(<MultiplayerTile races={0} winRate={0} />);
    expect(container.innerHTML).toBe('');
  });
  it('shows the win rate as a percentage', () => {
    render(<MultiplayerTile races={13} winRate={0.38} />);
    expect(screen.getByText('38%')).toBeTruthy();
    expect(screen.getByText('13 races')).toBeTruthy();
  });
});

describe('RaceOfTheDayTile', () => {
  it('shows the empty message when daily is null', () => {
    render(<RaceOfTheDayTile daily={null} today={TODAY} />);
    expect(
      screen.getByText(
        'Finish a Race of the Day to start earning streaks and badges.'
      )
    ).toBeTruthy();
  });
  it("says today's still open when today is not raced", () => {
    render(<RaceOfTheDayTile daily={sampleProfile()} today={TODAY} />);
    expect(screen.getByText(/today's still open/)).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('6.8s')).toBeTruthy();
  });
  it('hides the open hint once today is raced', () => {
    const daily = { ...sampleProfile(), recent: [historyDay(TODAY)] };
    render(<RaceOfTheDayTile daily={daily} today={TODAY} />);
    expect(screen.queryByText(/today's still open/)).toBeNull();
  });
});

describe('ActivityCalendar', () => {
  it('marks a daily-win day as won', () => {
    render(
      <ActivityCalendar
        activity={[{ day: '2026-11-20', runs: 3, multiplayerWins: 0 }]}
        winDates={['2026-11-20']}
        today={TODAY}
      />
    );
    expect(screen.getByLabelText('2026-11-20: 3 runs, won')).toBeTruthy();
    expect(screen.getByLabelText('2026-11-19: 0 runs')).toBeTruthy();
  });
  it('shows the days-active and wins summary', () => {
    render(
      <ActivityCalendar
        activity={[{ day: '2026-11-20', runs: 3, multiplayerWins: 1 }]}
        winDates={['2026-11-21']}
        today={TODAY}
      />
    );
    expect(screen.getByText('1 days raced · 2 wins')).toBeTruthy();
  });
});

describe('RecentGames', () => {
  it('shows the daily placing for a daily row and an ordinal for a win', () => {
    render(
      <RecentGames
        games={[
          game({ playMode: 'daily', startedAt: '2026-11-25T08:00:00Z' }),
          game({ playMode: 'quick_play', position: 1 }),
        ]}
        dailyRecent={[historyDay('2026-11-25', 4)]}
      />
    );
    expect(screen.getByText('4/44')).toBeTruthy();
    expect(screen.getByText('1st')).toBeTruthy();
  });
  it('labels a game the player quit as left and an unfinished one as DNF', () => {
    render(
      <RecentGames
        games={[
          game({ finished: false, leftRace: true }),
          game({ finished: false }),
        ]}
        dailyRecent={[]}
      />
    );
    expect(screen.getByText('left')).toBeTruthy();
    expect(screen.getByText('DNF')).toBeTruthy();
  });
});

describe('TrophyCase', () => {
  it('shows earned / total and Flawless best efficiency', () => {
    render(<TrophyCase daily={sampleProfile()} />);
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('/ 9')).toBeTruthy();
    expect(screen.getByText('best 97%')).toBeTruthy();
  });
  it('renders every badge locked when daily is null', () => {
    render(<TrophyCase daily={null} />);
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByText('/ 9')).toBeTruthy();
    expect(screen.getAllByText(/^0 \/ \d+$/).length).toBeGreaterThan(0);
  });
});

describe('RaceTimeChart', () => {
  it('hides the delta when prev30d is null', () => {
    render(
      <RaceTimeChart
        avgRaceMs={12400}
        weekly={[]}
        avg30d={10000}
        prev30d={null}
      />
    );
    expect(screen.getByText('12.4s')).toBeTruthy();
    expect(screen.queryByText(/\/ 30d/)).toBeNull();
  });
  it('shows a green faster delta and draws the line with 2+ weeks', () => {
    const { container } = render(
      <RaceTimeChart
        avgRaceMs={12400}
        weekly={[
          { weekStart: '2026-11-02', avgMs: 14000 },
          { weekStart: '2026-11-09', avgMs: 12000 },
        ]}
        avg30d={10000}
        prev30d={12100}
      />
    );
    expect(screen.getByText('▼ 2.1s / 30d')).toBeTruthy();
    expect(container.querySelectorAll('path').length).toBe(2);
  });
  it('draws no path with fewer than 2 weekly points', () => {
    const { container } = render(
      <RaceTimeChart
        avgRaceMs={null}
        weekly={[{ weekStart: '2026-11-02', avgMs: 14000 }]}
        avg30d={null}
        prev30d={null}
      />
    );
    expect(container.querySelectorAll('path').length).toBe(0);
    expect(screen.getByText('—')).toBeTruthy();
  });
});
