// @vitest-environment jsdom
/**
 * Tests for the home page: the featured Race of the Day panel (live attempt
 * dots, countdown, CTA wording) and the three evergreen mode rows.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';

const AUTH = {
  session: { access_token: 'tok' } as Session,
  user: { id: 'me-123' } as { id: string },
  profile: null,
  loading: false,
  profileStatus: 'ready' as const,
  applyProfileUpdate: vi.fn(),
};
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => AUTH }));

// The leaderboard and banner fetch on their own; stub them out.
vi.mock('../components/LeaderboardTable', () => ({
  LeaderboardTable: () => <div data-testid="leaderboard" />,
}));
vi.mock('../components/SiteBanner', () => ({
  SiteBanner: () => <div data-testid="site-banner" />,
}));

const mockFetchDailyRace = vi.fn();
vi.mock('../api/daily', () => ({
  fetchDailyRaceCached: (...args: unknown[]) => mockFetchDailyRace(...args),
}));

const HomePage = (await import('./home')).default;

function makeInfo(overrides: Record<string, unknown> = {}) {
  return {
    raceDate: '2026-09-02',
    tasks: [],
    attempts: [{ attemptNumber: 1, durationMs: 41200 }],
    attemptsRemaining: 2,
    bestMs: 41200,
    ...overrides,
  };
}

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockFetchDailyRace.mockResolvedValue({ status: 'ok', info: makeInfo() });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('HomePage', () => {
  it('lists the three evergreen modes alongside the daily panel', async () => {
    await act(async () => {
      renderHome();
    });

    expect(screen.getByText('Quick Play')).toBeTruthy();
    expect(screen.getByText('Private Match')).toBeTruthy();
    expect(screen.getByText('Practice')).toBeTruthy();
    expect(screen.getByText('Race of the Day')).toBeTruthy();
    expect(screen.getByTestId('leaderboard')).toBeTruthy();
  });

  it('keeps the keyword heading for crawlers', async () => {
    await act(async () => {
      renderHome();
    });
    expect(
      screen.getByRole('heading', { name: /Practice Vim Motions Online/i })
    ).toBeTruthy();
  });

  it("shows today's real attempts once the daily race loads", async () => {
    await act(async () => {
      renderHome();
    });

    expect(mockFetchDailyRace).toHaveBeenCalledWith('tok');
    expect(await screen.findByText('2 attempts left')).toBeTruthy();
    expect(screen.getByLabelText('1 of 3 attempts used')).toBeTruthy();
  });

  it('invites the user to race while attempts remain', async () => {
    await act(async () => {
      renderHome();
    });
    expect(await screen.findByText('Race now')).toBeTruthy();
    expect(screen.queryByText(/See today's board/)).toBeNull();
  });

  it('points at the board instead when attempts are spent', async () => {
    mockFetchDailyRace.mockResolvedValue({
      status: 'ok',
      info: makeInfo({
        attempts: [
          { attemptNumber: 1, durationMs: 41200 },
          { attemptNumber: 2, durationMs: 40000 },
          { attemptNumber: 3, durationMs: 39000 },
        ],
        attemptsRemaining: 0,
      }),
    });

    await act(async () => {
      renderHome();
    });

    expect(await screen.findByText("See today's board")).toBeTruthy();
    expect(screen.getByText('no attempts left')).toBeTruthy();
    expect(screen.queryByText('Race now')).toBeNull();
  });

  // A slow or broken daily API must never leave the menu unusable.
  it('falls back to static copy when the daily race fails to load', async () => {
    mockFetchDailyRace.mockResolvedValue({ status: 'error' });

    await act(async () => {
      renderHome();
    });

    expect(
      screen.getByText(/One shared task set · three attempts/)
    ).toBeTruthy();
    expect(screen.getByText('Race now')).toBeTruthy();
    expect(screen.getByText('Quick Play')).toBeTruthy();
  });

  it('counts down to the next race', async () => {
    await act(async () => {
      renderHome();
    });
    expect(screen.getByText(/New race in/)).toBeTruthy();
    expect(screen.getByText(/^\d{2}:\d{2}:\d{2}$/)).toBeTruthy();
  });
});
