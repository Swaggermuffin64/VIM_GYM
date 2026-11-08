// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { DailyProfile } from '../api/daily';

const mockFetchDailyProfile = vi.fn();
vi.mock('../api/daily', () => ({
  fetchDailyProfile: (...args: unknown[]) => mockFetchDailyProfile(...args),
}));

const { DailyProfileSection } = await import('./DailyProfileSection');

const PROFILE: DailyProfile = {
  badges: [{ id: 'days_7', earnedOn: '2026-10-08' }],
  unseenBadges: [],
  streaks: {
    participation: { current: 5, longest: 9 },
    podium: { current: 2, longest: 2 },
  },
  counters: { daysRaced: 18, speedWins: 1, efficiencyWins: 2, podiums: 6 },
  personalBests: {
    bestSpeedPlacing: { rank: 1, racers: 44, raceDate: '2026-10-09' },
    bestEfficiencyPlacing: null,
    fastest: { ms: 30_100, raceDate: '2026-10-12' },
    mostEfficient: { efficiency: 0.96, raceDate: '2026-10-10' },
  },
  recent: [
    {
      raceDate: '2026-10-18',
      bestMs: 35_000,
      speedRank: 4,
      racers: 41,
      efficiency: null,
      efficiencyRank: null,
      efficiencyRacers: null,
    },
    {
      raceDate: '2026-10-17',
      bestMs: 33_000,
      speedRank: 2,
      racers: 30,
      efficiency: 0.875,
      efficiencyRank: 3,
      efficiencyRacers: 29,
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function renderSection(profile: DailyProfile | null) {
  mockFetchDailyProfile.mockResolvedValue(profile);
  await act(async () => {
    render(<DailyProfileSection accessToken="tok" />);
  });
}

describe('DailyProfileSection', () => {
  it('shows streaks, wins, personal bests, and recent placings', async () => {
    await renderSection(PROFILE);

    expect(mockFetchDailyProfile).toHaveBeenCalledWith('tok');
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('longest 9 days')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('1 speed · 2 eff.')).toBeTruthy();
    expect(screen.getByText('1st of 44')).toBeTruthy();
    expect(screen.getByText('96%')).toBeTruthy();
    expect(screen.getByText('4th of 41')).toBeTruthy();
    expect(screen.getByText('3rd of 29')).toBeTruthy();
    expect(screen.getByText('87.5%')).toBeTruthy();
    // An unscorable day shows a dash in the efficiency column.
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('marks earned badges with their date and shows progress on the rest', async () => {
    await renderSection(PROFILE);

    expect(screen.getByLabelText('Regular: Race 7 days, earned')).toBeTruthy();
    expect(screen.getByText('Earned Oct 8')).toBeTruthy();
    // Devoted: 18 of 30 days raced.
    expect(screen.getByText('18 / 30')).toBeTruthy();
  });

  it('invites a first race when the user has none', async () => {
    await renderSection({
      ...PROFILE,
      badges: [],
      streaks: {
        participation: { current: 0, longest: 0 },
        podium: { current: 0, longest: 0 },
      },
      counters: { daysRaced: 0, speedWins: 0, efficiencyWins: 0, podiums: 0 },
      personalBests: {
        bestSpeedPlacing: null,
        bestEfficiencyPlacing: null,
        fastest: null,
        mostEfficient: null,
      },
      recent: [],
    });

    expect(screen.getByText(/Finish a Race of the Day/)).toBeTruthy();
    expect(screen.getByText('Badges')).toBeTruthy();
  });

  it('renders nothing when the profile cannot be loaded', async () => {
    await renderSection(null);
    expect(screen.queryByText('Race of the Day')).toBeNull();
  });
});
