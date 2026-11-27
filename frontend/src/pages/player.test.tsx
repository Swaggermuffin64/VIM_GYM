// @vitest-environment jsdom
/**
 * Tests for PlayerProfilePage (/players/:id): another player's read-only
 * profile, the not-found and error states, and the redirect to /profile when
 * the id is the viewer's own.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';

const authState = {
  session: { access_token: 'tok' } as Session,
  user: { id: 'me-123' },
};
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }));

const mockFetchPlayer = vi.fn();
vi.mock('../api/profile', () => ({
  fetchPlayer: (...args: unknown[]) => mockFetchPlayer(...args),
}));

const PlayerProfilePage = (await import('./player')).default;

const PLAYER = {
  profile: {
    id: 'p1',
    displayName: 'stinkyhat',
    avatarUrl: null,
    isPremium: false,
    createdAt: '2026-05-01T00:00:00Z',
    showcasedBadges: [],
  },
  stats: {
    totalRuns: 12,
    avgRaceMs: null,
    avgRaceMs30d: null,
    avgRaceMsPrev30d: null,
    multiplayer: { races: 0, wins: 0, winRate: 0 },
    activity: [],
    raceTimeWeekly: [],
    recentGames: [],
  },
  daily: {
    badges: [],
    unseenBadges: [],
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
    winDates: [],
  },
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/players/:id" element={<PlayerProfilePage />} />
        <Route path="/profile" element={<div>OWN PROFILE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockFetchPlayer.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('PlayerProfilePage', () => {
  it("shows another player's profile without any edit controls", async () => {
    mockFetchPlayer.mockResolvedValue({ status: 'ok', player: PLAYER });

    await act(async () => {
      renderAt('/players/p1');
    });

    expect(await screen.findByText('stinkyhat')).toBeTruthy();
    expect(mockFetchPlayer).toHaveBeenCalledWith('tok', 'p1');
    expect(screen.getByText('Total runs')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit name' })).toBeNull();
    expect(screen.queryByText(/showcase ✎/)).toBeNull();
  });

  it('says so when the player does not exist', async () => {
    mockFetchPlayer.mockResolvedValue({ status: 'not_found' });

    await act(async () => {
      renderAt('/players/nobody');
    });

    expect(await screen.findByText('Player not found')).toBeTruthy();
  });

  it('shows an error when the profile fails to load', async () => {
    mockFetchPlayer.mockResolvedValue({ status: 'error' });

    await act(async () => {
      renderAt('/players/p1');
    });

    expect(await screen.findByText("Couldn't load this profile.")).toBeTruthy();
  });

  it('sends the viewer to their own editable profile for their own id', async () => {
    await act(async () => {
      renderAt('/players/me-123');
    });

    expect(await screen.findByText('OWN PROFILE')).toBeTruthy();
    expect(mockFetchPlayer).not.toHaveBeenCalled();
  });
});
