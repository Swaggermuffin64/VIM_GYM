// @vitest-environment jsdom
/**
 * Tests for the DailyRacePage: pre-race screen states, start flow,
 * rollover/out-of-attempts edge cases, and leaderboard rendering.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, act, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Stub useAuth — provides a signed-in session and user id for highlighting.
const AUTH = {
  session: { access_token: 'tok' } as Session,
  user: { id: 'me-123' } as { id: string },
  profile: {
    id: 'me-123',
    display_name: 'testuser',
    avatar_url: null,
    is_premium: false,
    has_completed_onboarding: true,
  },
  loading: false,
  profileStatus: 'ready' as const,
  applyProfileUpdate: vi.fn(),
};
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => AUTH }));

// Stub the RaceSessionPage to a simple testid div.
vi.mock('./practice/PracticeEditor', () => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  RaceSessionPage: (_props: {
    config: unknown;
    initialSession?: unknown;
    autoStart?: boolean;
  }) => <div data-testid="race-session" />,
}));

// Stub daily API functions.
const mockFetchDailyRace = vi.fn();
const mockStartDailyAttempt = vi.fn();
const mockCompleteDailyAttempt = vi.fn();
const mockFetchDailyLeaderboard = vi.fn();
const mockCreateDailyShareLink = vi.fn();
const mockFetchChallenge = vi.fn();
// The synchronous cache peek the page seeds its phase from; defaults to a
// cold cache so most tests exercise the fetch path.
const mockGetCachedDailyRace = vi.fn();

vi.mock('../api/daily', () => ({
  fetchDailyRace: (...args: unknown[]) => mockFetchDailyRace(...args),
  fetchDailyRaceCached: (...args: unknown[]) => mockFetchDailyRace(...args),
  getCachedDailyRace: (...args: unknown[]) => mockGetCachedDailyRace(...args),
  startDailyAttempt: (...args: unknown[]) => mockStartDailyAttempt(...args),
  completeDailyAttempt: (...args: unknown[]) =>
    mockCompleteDailyAttempt(...args),
  fetchDailyLeaderboard: (...args: unknown[]) =>
    mockFetchDailyLeaderboard(...args),
  createDailyShareLink: (...args: unknown[]) =>
    mockCreateDailyShareLink(...args),
  fetchChallenge: (...args: unknown[]) => mockFetchChallenge(...args),
}));

// Import after mocks are wired (top-level await, same pattern as profile.test.tsx).
const dailyModule = await import('./daily');
const DailyRacePage = dailyModule.default;
const { DailyCompletionExtras } = dailyModule;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDaily(initialEntry = '/daily') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <DailyRacePage />
    </MemoryRouter>
  );
}

/** Echoes where the page navigated, so tests can assert the login hand-off. */
function LoginProbe() {
  const location = useLocation();
  return <div>LOGIN PAGE {location.search}</div>;
}

function renderDailyWithLoginRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/daily" element={<DailyRacePage />} />
        <Route path="/login" element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

const CHALLENGE = {
  displayName: 'Jackson',
  rank: 4,
  totalRacers: 212,
  bestMs: 61_300,
  raceDate: '2026-08-16',
};

const RACE_DATE = '2026-08-16';
const TASKS = [
  {
    id: 't1',
    type: 'navigate',
    codeSnippet: 'abc',
    description: 'go',
    targetOffset: 2,
  },
];

function makeInfo(overrides: Record<string, unknown> = {}) {
  return {
    raceDate: RACE_DATE,
    tasks: TASKS,
    attempts: [],
    attemptsRemaining: 3,
    bestMs: null,
    ...overrides,
  };
}

/** A leaderboard row as the API client returns it. */
function boardEntry(rank: number, userId: string, displayName: string) {
  return {
    rank,
    userId,
    displayName,
    avatarUrl: null,
    bestMs: rank * 1000,
    efficiency: null,
    optimalKeys: null,
    actualKeys: null,
    dailyStreak: 0,
    speedWins: 0,
    efficiencyWins: 0,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockGetCachedDailyRace.mockReturnValue(null);
  mockFetchDailyRace.mockResolvedValue({ status: 'ok', info: makeInfo() });
  mockStartDailyAttempt.mockResolvedValue({
    status: 'started',
    raceDate: RACE_DATE,
    attemptNumber: 1,
    gameId: 42,
  });
  mockFetchDailyLeaderboard.mockResolvedValue({
    entries: [],
    neighborhood: null,
    lastPlace: null,
    totalRacers: 0,
  });
  mockCompleteDailyAttempt.mockResolvedValue({
    status: 'ok',
    placing: { rank: 1, totalRacers: 5, bestMs: 5000, attemptsRemaining: 2 },
  });
  mockCreateDailyShareLink.mockResolvedValue({
    status: 'ok',
    url: 'https://vim.gym/c/abc',
  });
  mockFetchChallenge.mockResolvedValue(null);
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Test cases (six from the brief)
// ---------------------------------------------------------------------------

describe('DailyRacePage', () => {
  // Reaching /daily is the end of the challenge-link journey, so this page
  // is the single place the stashed slug is cleared.
  it('clears the stashed challenge slug on mount', async () => {
    sessionStorage.setItem('vimgym.challengeSlug', 'a1B2c3D4e5');

    await act(async () => {
      renderDaily();
    });
    expect(await screen.findByText(/Start attempt 1 of 3/i)).toBeTruthy();

    expect(sessionStorage.getItem('vimgym.challengeSlug')).toBeNull();
  });

  // Arriving from the home page (which already fetched today's race) must
  // paint the pre-race screen immediately — no loading-spinner flash, no
  // network round trip.
  it('seeds the pre-race screen from the cache without fetching', async () => {
    mockGetCachedDailyRace.mockReturnValue(makeInfo());

    await act(async () => {
      renderDaily();
    });

    expect(screen.getByText(/Start attempt 1 of 3/i)).toBeTruthy();
    expect(mockFetchDailyRace).not.toHaveBeenCalled();
  });

  // 1. Pre-race screen shows attempt dots and correct start button label.
  it('shows attempt dots and "Start attempt 2 of 3" when one attempt used', async () => {
    mockFetchDailyRace.mockResolvedValue({
      status: 'ok',
      info: makeInfo({
        attempts: [{ attemptNumber: 1, durationMs: 5000 }],
        attemptsRemaining: 2,
      }),
    });

    await act(async () => {
      renderDaily();
    });
    // Wait for pre-race content to appear.
    expect(await screen.findByText(/Start attempt 2 of 3/i)).toBeTruthy();
    // Attempt dots label.
    expect(screen.getByLabelText('1 of 3 attempts used')).toBeTruthy();
  });

  // 2. Out of attempts: start button replaced by the countdown.
  it('shows the countdown when out of attempts', async () => {
    mockFetchDailyRace.mockResolvedValue({
      status: 'ok',
      info: makeInfo({
        attemptsRemaining: 0,
        attempts: [
          { attemptNumber: 1, durationMs: 5000 },
          { attemptNumber: 2, durationMs: 4000 },
          { attemptNumber: 3, durationMs: 3000 },
        ],
      }),
    });

    await act(async () => {
      renderDaily();
    });
    // Countdown label present.
    expect(await screen.findByText(/New race in/i)).toBeTruthy();
    // Start button should NOT appear.
    expect(screen.queryByRole('button', { name: /Start attempt/i })).toBeNull();
  });

  // 3. Clicking start calls startDailyAttempt and mounts the race session stub.
  it('calls startDailyAttempt and mounts race session on start click', async () => {
    await act(async () => {
      renderDaily();
    });
    const startBtn = await screen.findByRole('button', {
      name: /Start attempt 1 of 3/i,
    });

    await act(async () => {
      startBtn.click();
    });

    expect(mockStartDailyAttempt).toHaveBeenCalledWith('tok');
    expect(screen.getByTestId('race-session')).toBeTruthy();
  });

  // 4. startDailyAttempt resolving { status: 'out_of_attempts' } refetches info.
  it('refetches info when startDailyAttempt returns out_of_attempts', async () => {
    mockStartDailyAttempt.mockResolvedValue({ status: 'out_of_attempts' });
    // After refetch, user is out of attempts.
    const outInfo = makeInfo({
      attemptsRemaining: 0,
      attempts: [
        { attemptNumber: 1, durationMs: 5000 },
        { attemptNumber: 2, durationMs: 4000 },
        { attemptNumber: 3, durationMs: 3000 },
      ],
    });

    await act(async () => {
      renderDaily();
    });
    const startBtn = await screen.findByRole('button', {
      name: /Start attempt 1 of 3/i,
    });

    // Replace mock before clicking so the refetch returns out-of-attempts info.
    mockFetchDailyRace.mockResolvedValue({ status: 'ok', info: outInfo });

    await act(async () => {
      startBtn.click();
    });

    // fetchDailyRace called twice: once on mount, once on refetch.
    expect(mockFetchDailyRace).toHaveBeenCalledTimes(2);
    // Should NOT mount race session.
    expect(screen.queryByTestId('race-session')).toBeNull();
    expect(await screen.findByText(/New race in/i)).toBeTruthy();
  });

  // 5. startDailyAttempt returning a different raceDate triggers refetch (UTC rollover).
  it('refetches when startDailyAttempt returns a different raceDate (rollover)', async () => {
    mockStartDailyAttempt.mockResolvedValue({
      status: 'started',
      raceDate: '2026-08-17', // tomorrow — different from loaded info
      attemptNumber: 1,
      gameId: 99,
    });

    const tomorrowInfo = makeInfo({ raceDate: '2026-08-17' });
    await act(async () => {
      renderDaily();
    });
    const startBtn = await screen.findByRole('button', {
      name: /Start attempt 1 of 3/i,
    });

    mockFetchDailyRace.mockResolvedValue({ status: 'ok', info: tomorrowInfo });

    await act(async () => {
      startBtn.click();
    });

    // Should refetch (mount + rollover = 2 calls).
    expect(mockFetchDailyRace).toHaveBeenCalledTimes(2);
    // Should NOT mount race session — refetch happens first.
    expect(screen.queryByTestId('race-session')).toBeNull();
  });

  // Flex (share) button on the pre-race screen.
  it('hides the flex button before any finished attempt', async () => {
    await act(async () => {
      renderDaily();
    });
    expect(await screen.findByText(/Start attempt 1 of 3/i)).toBeTruthy();

    expect(
      screen.queryByRole('button', { name: /Flex on people/i })
    ).toBeNull();
  });

  it('opens the share modal with the link and an unfurl preview on flex click', async () => {
    mockFetchDailyRace.mockResolvedValue({
      status: 'ok',
      info: makeInfo({
        attempts: [{ attemptNumber: 1, durationMs: 41200 }],
        attemptsRemaining: 2,
        bestMs: 41200,
      }),
    });

    await act(async () => {
      renderDaily();
    });
    const flexBtn = await screen.findByRole('button', {
      name: /Flex on people/i,
    });

    await act(async () => {
      flexBtn.click();
    });

    // Modal minted the link on open, pinned to the loaded race's date so a
    // share clicked after a UTC rollover still shares the day that was raced.
    expect(mockCreateDailyShareLink).toHaveBeenCalledWith('tok', RACE_DATE);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(
      (await screen.findByDisplayValue('https://vim.gym/c/abc')) as unknown
    ).toBeTruthy();
    // Explains the rich unfurl preview.
    expect(
      screen.getByText(/How it looks in Slack, Discord, or iMessage/i)
    ).toBeTruthy();
    // The preview shows the real og.png the minted link serves, so what the
    // user sees is exactly what recipients get.
    const previewImage = (await screen.findByAltText(
      /Share card image preview/i
    )) as HTMLImageElement;
    expect(previewImage.src).toBe('https://vim.gym/c/abc/og.png');
  });

  it('copies the link from the modal and confirms', async () => {
    mockFetchDailyRace.mockResolvedValue({
      status: 'ok',
      info: makeInfo({
        attempts: [{ attemptNumber: 1, durationMs: 41200 }],
        attemptsRemaining: 2,
        bestMs: 41200,
      }),
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    await act(async () => {
      renderDaily();
    });
    const flexBtn = await screen.findByRole('button', {
      name: /Flex on people/i,
    });
    await act(async () => {
      flexBtn.click();
    });
    const copyBtn = await screen.findByRole('button', { name: /^Copy$/i });

    await act(async () => {
      copyBtn.click();
    });

    expect(writeText).toHaveBeenCalledWith('https://vim.gym/c/abc');
    expect(await screen.findByText(/Copied/i)).toBeTruthy();
  });

  it('closes the share modal with its close button', async () => {
    mockFetchDailyRace.mockResolvedValue({
      status: 'ok',
      info: makeInfo({
        attempts: [{ attemptNumber: 1, durationMs: 41200 }],
        attemptsRemaining: 2,
        bestMs: 41200,
      }),
    });

    await act(async () => {
      renderDaily();
    });
    const flexBtn = await screen.findByRole('button', {
      name: /Flex on people/i,
    });
    await act(async () => {
      flexBtn.click();
    });
    expect(await screen.findByRole('dialog')).toBeTruthy();

    const closeBtn = screen.getByRole('button', { name: /close/i });
    await act(async () => {
      closeBtn.click();
    });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the flex button available when out of attempts', async () => {
    mockFetchDailyRace.mockResolvedValue({
      status: 'ok',
      info: makeInfo({
        attempts: [
          { attemptNumber: 1, durationMs: 41200 },
          { attemptNumber: 2, durationMs: 40000 },
          { attemptNumber: 3, durationMs: 42000 },
        ],
        attemptsRemaining: 0,
        bestMs: 40000,
      }),
    });

    await act(async () => {
      renderDaily();
    });
    expect(await screen.findByText(/New race in/i)).toBeTruthy();

    expect(
      screen.getByRole('button', { name: /Flex on people/i })
    ).toBeTruthy();
  });

  // The rail keeps its header to the title and board switch; the racer
  // count and the efficiency tip live in the full-leaderboard dialog.
  // The rail header states the size of the field, since the rows below it
  // are only the top slice.
  it('shows the total racer count in the leaderboard header', async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 312,
      neighborhood: null,
      entries: [boardEntry(1, 'other-1', 'speedster')],
    });

    await act(async () => {
      renderDaily();
    });
    expect(await screen.findByText('speedster')).toBeTruthy();

    expect(screen.getByText('312 racers')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Show all 312 racers' })
    ).toBeTruthy();
  });

  it('uses the singular in the header for a field of one racer', async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 1,
      neighborhood: null,
      entries: [boardEntry(1, 'other-1', 'speedster')],
    });

    await act(async () => {
      renderDaily();
    });
    expect(await screen.findByText('speedster')).toBeTruthy();

    expect(screen.getByText('1 racer')).toBeTruthy();
  });

  it('shows no racer count or full-leaderboard button before anyone has finished', async () => {
    await act(async () => {
      renderDaily();
    });
    expect(await screen.findByText('No entries yet')).toBeTruthy();

    expect(screen.queryByText(/\d+ racers?/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /show all/i })).toBeNull();
  });

  it('offers no full-leaderboard button when every racer is already listed', async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 2,
      neighborhood: null,
      entries: [
        boardEntry(1, 'other-1', 'speedster'),
        boardEntry(2, 'me-123', 'testuser'),
      ],
    });

    await act(async () => {
      renderDaily();
    });
    expect(await screen.findByText('speedster')).toBeTruthy();

    expect(screen.queryByRole('button', { name: /show all/i })).toBeNull();
  });

  describe('the full leaderboard dialog', () => {
    const TOP_SLICE = {
      totalRacers: 10,
      entries: [boardEntry(1, 'other-1', 'speedster')],
      neighborhood: null,
      lastPlace: boardEntry(10, 'me-123', 'testuser'),
    };
    const WHOLE_FIELD = {
      totalRacers: 10,
      entries: [
        boardEntry(1, 'other-1', 'speedster'),
        boardEntry(9, 'other-9', 'midpacker'),
        boardEntry(10, 'me-123', 'testuser'),
      ],
      neighborhood: null,
      lastPlace: null,
    };

    /** Serves the top slice to the rail and the whole field to the dialog. */
    function serveBoardByLimit() {
      mockFetchDailyLeaderboard.mockImplementation(
        async (_token: unknown, _date: unknown, limit: number) =>
          limit === 5 ? TOP_SLICE : WHOLE_FIELD
      );
    }

    async function renderAndOpenFullLeaderboard() {
      serveBoardByLimit();
      await act(async () => {
        renderDaily();
      });
      const showFull = await screen.findByRole('button', {
        name: 'Show all 10 racers',
      });
      await act(async () => {
        showFull.click();
      });
      return screen.getByRole('dialog', { name: 'Leaderboard' });
    }

    it('keeps racers outside the top slice out of the rail', async () => {
      serveBoardByLimit();
      await act(async () => {
        renderDaily();
      });
      expect(await screen.findByText('speedster')).toBeTruthy();

      expect(screen.queryByText('midpacker')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('opens a dialog that fetches the whole field and lists every racer', async () => {
      const dialog = await renderAndOpenFullLeaderboard();

      expect(mockFetchDailyLeaderboard).toHaveBeenCalledWith(
        'tok',
        undefined,
        1000,
        'speed'
      );
      expect(await within(dialog).findByText('midpacker')).toBeTruthy();
      expect(within(dialog).getByText('speedster')).toBeTruthy();
      expect(within(dialog).queryByText('···')).toBeNull();
    });

    it("links each racer's name in the dialog to their profile", async () => {
      const dialog = await renderAndOpenFullLeaderboard();
      await within(dialog).findByText('midpacker');

      expect(
        within(dialog)
          .getByRole('link', { name: 'midpacker' })
          .getAttribute('href')
      ).toBe('/players/other-9');
      expect(
        within(dialog)
          .getByRole('link', { name: 'testuser' })
          .getAttribute('href')
      ).toBe('/profile');
    });

    it('ends each dialog row with the Spd. wins and Streak badges', async () => {
      mockFetchDailyLeaderboard.mockImplementation(
        async (_token: unknown, _date: unknown, limit: number) =>
          limit === 5
            ? TOP_SLICE
            : {
                ...WHOLE_FIELD,
                entries: [
                  {
                    ...boardEntry(1, 'other-1', 'speedster'),
                    dailyStreak: 12,
                    speedWins: 3,
                  },
                ],
              }
      );
      await act(async () => {
        renderDaily();
      });
      await act(async () => {
        (
          await screen.findByRole('button', { name: 'Show all 10 racers' })
        ).click();
      });
      const dialog = screen.getByRole('dialog', { name: 'Leaderboard' });
      const row = (
        await within(dialog).findByRole('link', { name: 'speedster' })
      ).parentElement!.parentElement!;
      const [winsCell, streakCell] = Array.from(row.children).slice(-2);

      expect(within(dialog).getByText('Spd. wins')).toBeTruthy();
      expect(within(dialog).getByText('Streak')).toBeTruthy();
      expect(
        within(winsCell as HTMLElement).getByLabelText('3 speed board wins')
          .textContent
      ).toBe('WIN3');
      expect(
        within(streakCell as HTMLElement).getByLabelText('12-day streak')
          .textContent
      ).toBe('STRK12');
    });

    it('states the racer count in the dialog', async () => {
      const dialog = await renderAndOpenFullLeaderboard();

      expect(within(dialog).getByText('10 racers')).toBeTruthy();
    });

    it('uses the singular for a field of one racer', async () => {
      mockFetchDailyLeaderboard.mockImplementation(
        async (_token: unknown, _date: unknown, limit: number) =>
          limit === 5
            ? { ...TOP_SLICE, totalRacers: 2 }
            : { ...WHOLE_FIELD, totalRacers: 1 }
      );
      await act(async () => {
        renderDaily();
      });
      await act(async () => {
        (
          await screen.findByRole('button', { name: 'Show all 2 racers' })
        ).click();
      });

      expect(
        await within(screen.getByRole('dialog')).findByText('1 racer')
      ).toBeTruthy();
    });

    it("highlights the signed-in user's row in the dialog", async () => {
      const dialog = await renderAndOpenFullLeaderboard();
      await within(dialog).findByText('midpacker');

      const ownRow = within(dialog)
        .getByText('testuser')
        .closest('[aria-current]');
      expect(ownRow).not.toBeNull();
    });

    it('leaves the rail on the top slice while the dialog is open', async () => {
      await renderAndOpenFullLeaderboard();
      await screen.findByText('midpacker');

      expect(screen.getAllByText('midpacker')).toHaveLength(1);
    });

    it('closes the dialog from its close button', async () => {
      await renderAndOpenFullLeaderboard();

      await act(async () => {
        screen.getByRole('button', { name: 'Close' }).click();
      });

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByText('midpacker')).toBeNull();
    });

    it('switches the dialog between the speed and efficiency boards', async () => {
      mockFetchDailyLeaderboard.mockImplementation(
        async (
          _token: unknown,
          _date: unknown,
          limit: number,
          board: string
        ) =>
          limit === 5
            ? TOP_SLICE
            : {
                ...WHOLE_FIELD,
                entries: [
                  boardEntry(
                    1,
                    'other-1',
                    board === 'efficiency' ? 'golfer' : 'speedster'
                  ),
                ],
              }
      );
      await act(async () => {
        renderDaily();
      });
      await act(async () => {
        (
          await screen.findByRole('button', { name: 'Show all 10 racers' })
        ).click();
      });
      const dialog = screen.getByRole('dialog');
      expect(await within(dialog).findByText('speedster')).toBeTruthy();
      expect(
        within(dialog)
          .getByRole('button', { name: 'Speed' })
          .getAttribute('aria-pressed')
      ).toBe('true');

      await act(async () => {
        within(dialog).getByRole('button', { name: 'Key Efficiency' }).click();
      });

      expect(mockFetchDailyLeaderboard).toHaveBeenCalledWith(
        'tok',
        undefined,
        1000,
        'efficiency'
      );
      const switched = screen.getByRole('dialog', {
        name: 'Leaderboard by key efficiency',
      });
      expect(await within(switched).findByText('golfer')).toBeTruthy();
      expect(within(switched).queryByText('speedster')).toBeNull();
    });

    it('carries a board switch in the dialog back to the rail', async () => {
      await renderAndOpenFullLeaderboard();

      await act(async () => {
        within(screen.getByRole('dialog'))
          .getByRole('button', { name: 'Key Efficiency' })
          .click();
      });
      await act(async () => {
        screen.getByRole('button', { name: 'Close' }).click();
      });

      expect(
        screen
          .getByRole('button', { name: 'Key Efficiency' })
          .getAttribute('aria-pressed')
      ).toBe('true');
      expect(mockFetchDailyLeaderboard).toHaveBeenCalledWith(
        'tok',
        undefined,
        5,
        'efficiency'
      );
    });
  });

  // The rail is the top 5 as large rows, then the viewer's own row when they
  // fall outside it; the full field lives in the dialog.
  it('asks for the top 5 racers', async () => {
    await act(async () => {
      renderDaily();
    });
    await screen.findByText('No entries yet');

    expect(mockFetchDailyLeaderboard).toHaveBeenCalledWith(
      'tok',
      undefined,
      5,
      'speed'
    );
  });

  it('lists five top racers, with only the podium in medal colours', async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 5,
      entries: [
        boardEntry(1, 'other-1', 'first'),
        boardEntry(2, 'other-2', 'second'),
        boardEntry(3, 'other-3', 'third'),
        boardEntry(4, 'other-4', 'fourth'),
        boardEntry(5, 'other-5', 'fifth'),
      ],
      neighborhood: null,
      lastPlace: null,
    });

    await act(async () => {
      renderDaily();
    });
    await screen.findByText('first');

    const rows = screen.getAllByTestId('top-racer');
    expect(rows).toHaveLength(5);
    const bronzeBorder = rows[2].style.borderColor;
    expect(rows[3].style.borderColor).not.toBe(bronzeBorder);
    expect(rows[4].style.borderColor).not.toBe(bronzeBorder);
  });

  it("labels each top racer's keys, efficiency, and time", async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 1,
      entries: [
        {
          ...boardEntry(1, 'other-1', 'speedster'),
          bestMs: 31000,
          efficiency: 0.9375,
          optimalKeys: 120,
          actualKeys: 128,
        },
      ],
      neighborhood: null,
      lastPlace: null,
    });

    await act(async () => {
      renderDaily();
    });
    const row = (await screen.findByText('speedster')).closest(
      '[data-testid="top-racer"]'
    ) as HTMLElement;

    expect(within(row).getByText('Keys')).toBeTruthy();
    expect(within(row).getByText('Efficiency')).toBeTruthy();
    expect(within(row).getByText('Time')).toBeTruthy();
    expect(within(row).getByText('/120').parentElement?.textContent).toBe(
      '128/120'
    );
    expect(within(row).getByText('93.8%')).toBeTruthy();
    expect(within(row).getByText('31.0s')).toBeTruthy();
  });

  it("shows the viewer's own row under the top 5 when they're outside it", async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 312,
      entries: [boardEntry(1, 'other-1', 'speedster')],
      neighborhood: [
        boardEntry(46, 'other-46', 'yank_bank'),
        boardEntry(47, 'me-123', 'testuser'),
        boardEntry(48, 'other-48', 'paste_waste'),
      ],
      lastPlace: boardEntry(312, 'other-312', 'normie_mode'),
    });

    await act(async () => {
      renderDaily();
    });
    expect(await screen.findByText('speedster')).toBeTruthy();

    expect(screen.getByText('Your position')).toBeTruthy();
    const ownRow = screen.getByText('testuser').closest('[aria-current]');
    expect(ownRow).not.toBeNull();
    expect(screen.getByText('#47')).toBeTruthy();
    // Only the viewer: no rank neighbors, no last place.
    expect(screen.queryByText('yank_bank')).toBeNull();
    expect(screen.queryByText('paste_waste')).toBeNull();
    expect(screen.queryByText('normie_mode')).toBeNull();
  });

  it('shows the viewer as last place under "Your position" when they are last', async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 312,
      entries: [boardEntry(1, 'other-1', 'speedster')],
      neighborhood: null,
      lastPlace: boardEntry(312, 'me-123', 'testuser'),
    });

    await act(async () => {
      renderDaily();
    });
    expect(await screen.findByText('speedster')).toBeTruthy();

    expect(screen.getByText('Your position')).toBeTruthy();
    expect(screen.getByText('#312')).toBeTruthy();
  });

  it("marks the viewer's podium row without a 'you' tag or second outline", async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 2,
      entries: [
        boardEntry(1, 'me-123', 'testuser'),
        boardEntry(2, 'other-2', 'second'),
      ],
      neighborhood: null,
      lastPlace: null,
    });

    await act(async () => {
      renderDaily();
    });
    const [ownRow, otherRow] = await screen.findAllByTestId('top-racer');

    expect(ownRow.getAttribute('aria-current')).toBe('true');
    expect(ownRow.style.boxShadow).toBe('');
    expect(otherRow.getAttribute('aria-current')).toBeNull();
    expect(within(ownRow).queryByText('you')).toBeNull();
  });

  it("links each racer's name to their profile, and the viewer's to /profile", async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 2,
      entries: [
        boardEntry(1, 'other-1', 'speedster'),
        boardEntry(2, 'me-123', 'testuser'),
      ],
      neighborhood: null,
      lastPlace: null,
    });

    await act(async () => {
      renderDaily();
    });

    const other = await screen.findByRole('link', { name: 'speedster' });
    expect(other.getAttribute('href')).toBe('/players/other-1');
    const own = screen.getByRole('link', { name: 'testuser' });
    expect(own.getAttribute('href')).toBe('/profile');
  });

  it('links the "Your position" row to the viewer\'s own profile', async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 312,
      entries: [boardEntry(1, 'other-1', 'speedster')],
      neighborhood: [boardEntry(47, 'me-123', 'testuser')],
      lastPlace: null,
    });

    await act(async () => {
      renderDaily();
    });
    await screen.findByText('Your position');

    expect(
      screen.getByRole('link', { name: 'testuser' }).getAttribute('href')
    ).toBe('/profile');
  });

  // Wins and streak sit in the stats grid so their titles line up with the
  // stats' titles.
  it("shows a top-5 racer's speed wins and streak as titled badge columns", async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 1,
      neighborhood: null,
      lastPlace: null,
      entries: [
        {
          ...boardEntry(1, 'other-1', 'speedster'),
          dailyStreak: 12,
          speedWins: 3,
          efficiencyWins: 2,
        },
      ],
    });

    await act(async () => {
      renderDaily();
    });
    const row = await screen.findByTestId('top-racer');
    const statColumns = Array.from(row.lastElementChild!.children);

    expect(
      statColumns.map((cell) => cell.firstElementChild!.textContent)
    ).toEqual(['Keys', 'Efficiency', 'Time', 'Spd. wins', 'Streak']);
    expect(
      within(statColumns[3] as HTMLElement).getByLabelText('3 speed board wins')
        .textContent
    ).toBe('WIN3');
    expect(
      within(statColumns[4] as HTMLElement).getByLabelText('12-day streak')
        .textContent
    ).toBe('STRK12');
  });

  it('shows a dash, not a badge, for a racer with no wins', async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 1,
      neighborhood: null,
      lastPlace: null,
      entries: [{ ...boardEntry(1, 'other-1', 'speedster'), dailyStreak: 1 }],
    });

    await act(async () => {
      renderDaily();
    });
    await screen.findByText('speedster');

    expect(screen.getByLabelText('0 speed board wins').textContent).toBe('—');
    expect(screen.getByLabelText('1-day streak').textContent).toBe('STRK1');
  });

  it('shows no "Your position" row when the viewer is in the top 5', async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 312,
      entries: [
        boardEntry(1, 'other-1', 'speedster'),
        boardEntry(2, 'me-123', 'testuser'),
      ],
      neighborhood: null,
      lastPlace: boardEntry(312, 'other-312', 'normie_mode'),
    });

    await act(async () => {
      renderDaily();
    });
    expect(await screen.findByText('speedster')).toBeTruthy();

    expect(screen.queryByText('Your position')).toBeNull();
    expect(screen.queryByText('normie_mode')).toBeNull();
  });

  // 6. Leaderboard renders entries with the signed-in user's row highlighted.
  it('renders leaderboard with signed-in user row highlighted', async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 3,
      neighborhood: null,
      entries: [
        { ...boardEntry(1, 'other-1', 'speedster'), bestMs: 3000 },
        { ...boardEntry(2, 'me-123', 'testuser'), bestMs: 5000 },
        { ...boardEntry(3, 'other-2', 'slowpoke'), bestMs: 8000 },
      ],
    });

    await act(async () => {
      renderDaily();
    });
    // Wait for leaderboard to render.
    expect(await screen.findByText('speedster')).toBeTruthy();
    expect(screen.getByText('testuser')).toBeTruthy();
    expect(screen.getByText('slowpoke')).toBeTruthy();

    // The signed-in user's row should be highlighted (aria-current="true").
    const ownRow = screen.getByText('testuser').closest('[aria-current]');
    expect(ownRow).not.toBeNull();
    expect(ownRow!.getAttribute('aria-current')).toBe('true');
  });
});

// Share links land visitors here before they sign in. They see the real
// pre-race screen; Start is the sign-in gate, and the challenge slug survives
// the trip so login and onboarding can bring them back.
describe('DailyRacePage for a visitor with no session', () => {
  beforeEach(() => {
    AUTH.session = null as unknown as Session;
  });
  afterEach(() => {
    AUTH.session = { access_token: 'tok' } as Session;
  });

  it('loads the race and the board without a token and offers attempt 1 of 3', async () => {
    await act(async () => {
      renderDaily();
    });
    expect(await screen.findByText(/Start attempt 1 of 3/i)).toBeTruthy();
    expect(mockFetchDailyRace).toHaveBeenCalledWith(null);
    expect(mockFetchDailyLeaderboard).toHaveBeenCalledWith(
      null,
      undefined,
      5,
      'speed'
    );
    expect(mockGetCachedDailyRace).not.toHaveBeenCalled();
  });

  it("shows racers' names as plain text, since profiles need a sign-in", async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 1,
      entries: [boardEntry(1, 'other-1', 'speedster')],
      neighborhood: null,
      lastPlace: null,
    });
    const visitorUser = AUTH.user;
    AUTH.user = null as unknown as { id: string };
    try {
      await act(async () => {
        renderDaily();
      });
      expect(await screen.findByText('speedster')).toBeTruthy();
      expect(screen.queryByRole('link', { name: 'speedster' })).toBeNull();
    } finally {
      AUTH.user = visitorUser;
    }
  });

  it('sends Start to /login instead of claiming an attempt', async () => {
    await act(async () => {
      renderDailyWithLoginRoute('/daily');
    });
    const start = await screen.findByRole('button', { name: /Start attempt/i });
    await act(async () => {
      start.click();
    });
    expect(await screen.findByText(/LOGIN PAGE/)).toBeTruthy();
    expect(mockStartDailyAttempt).not.toHaveBeenCalled();
  });

  it('stashes a challenge slug and keeps it for the trip through login', async () => {
    await act(async () => {
      renderDaily('/daily?challenge=a1B2c3D4e5');
    });
    await screen.findByText(/Start attempt 1 of 3/i);
    expect(sessionStorage.getItem('vimgym.challengeSlug')).toBe('a1B2c3D4e5');
  });

  it('ignores a malformed challenge slug', async () => {
    await act(async () => {
      renderDaily('/daily?challenge=<script>');
    });
    await screen.findByText(/Start attempt 1 of 3/i);
    expect(sessionStorage.getItem('vimgym.challengeSlug')).toBeNull();
    expect(mockFetchChallenge).not.toHaveBeenCalled();
  });

  it('shows the challenger taunt and carries the slug to login on Start', async () => {
    mockFetchChallenge.mockResolvedValue(CHALLENGE);
    await act(async () => {
      renderDailyWithLoginRoute('/daily?challenge=a1B2c3D4e5');
    });
    const banner = await screen.findByRole('status');
    expect(banner.textContent).toContain('Jackson');
    expect(banner.textContent).toContain('61.3 seconds');

    const start = await screen.findByRole('button', { name: /Start attempt/i });
    await act(async () => {
      start.click();
    });
    expect(
      await screen.findByText('LOGIN PAGE ?challenge=a1B2c3D4e5')
    ).toBeTruthy();
  });
});

describe('DailyRacePage for a member arriving from a share link', () => {
  it('shows the taunt and clears the stash, since the journey is over', async () => {
    mockFetchChallenge.mockResolvedValue(CHALLENGE);
    sessionStorage.setItem('vimgym.challengeSlug', 'a1B2c3D4e5');
    await act(async () => {
      renderDaily('/daily?challenge=a1B2c3D4e5');
    });
    const banner = await screen.findByRole('status');
    expect(banner.textContent).toContain('Jackson');
    expect(sessionStorage.getItem('vimgym.challengeSlug')).toBeNull();
    expect(mockFetchDailyRace).toHaveBeenCalledWith('tok');
  });
});

describe('DailyCompletionExtras', () => {
  // Attempt 1 finished before this race; attempt 2 is the run that just ended.
  const LOADED_ATTEMPTS = [{ attemptNumber: 1, durationMs: 41200 }];
  const JUST_FINISHED = { attemptNumber: 2, durationMs: 38400 };

  function renderExtras(
    overrides: {
      loadedAttempts?: Array<{
        attemptNumber: number;
        durationMs: number | null;
      }>;
      justFinished?: { attemptNumber: number; durationMs: number };
      attemptsRemaining?: number;
      onTryAgain?: () => void;
      isAwaitingCompletionInfo?: boolean;
    } = {}
  ) {
    return render(
      <MemoryRouter>
        <DailyCompletionExtras
          isAwaitingCompletionInfo={overrides.isAwaitingCompletionInfo ?? false}
          completionInfo={{
            kind: 'daily',
            rank: 2,
            totalRacers: 7,
            bestMs: 38400,
            attemptsRemaining: overrides.attemptsRemaining ?? 1,
          }}
          raceDate={RACE_DATE}
          loadedAttempts={overrides.loadedAttempts ?? LOADED_ATTEMPTS}
          justFinished={overrides.justFinished ?? JUST_FINISHED}
          onTryAgain={overrides.onTryAgain ?? (() => {})}
          onBackToLeaderboard={() => {}}
        />
      </MemoryRouter>
    );
  }

  // Regression: the placing decides how many attempt slots are left, so the
  // extras rendered nothing at all until it arrived and the results card
  // visibly grew when it did. While the run is being scored, the block spins in
  // the same reserved space the loaded content occupies.
  describe('while the run is still being scored', () => {
    it('shows a spinner instead of half-built results', () => {
      renderExtras({ isAwaitingCompletionInfo: true });
      expect(screen.getByRole('status')).toBeTruthy();
      expect(screen.queryByText('Attempt 1')).toBeNull();
      expect(screen.queryByText(/Try again/i)).toBeNull();
    });

    it('reserves the same height as the loaded results', () => {
      const { container, unmount } = renderExtras({
        isAwaitingCompletionInfo: true,
      });
      const loadingHeight = (container.firstElementChild as HTMLElement).style
        .minHeight;
      unmount();

      const loaded = renderExtras();
      const loadedHeight = (loaded.container.firstElementChild as HTMLElement)
        .style.minHeight;

      expect(loadingHeight).not.toBe('');
      expect(loadingHeight).toBe(loadedHeight);
    });
  });

  // When completeDailyAttempt fails (network blip, expired token), the
  // completion overlay is the only UI on screen: it must still offer a way
  // out, or the user is stranded until a browser reload.
  describe('when the completion submission failed (null completionInfo)', () => {
    function renderFailedSubmission() {
      return render(
        <MemoryRouter>
          <DailyCompletionExtras
            completionInfo={null}
            raceDate={RACE_DATE}
            loadedAttempts={LOADED_ATTEMPTS}
            justFinished={JUST_FINISHED}
            onTryAgain={() => {}}
            onBackToLeaderboard={() => {}}
          />
        </MemoryRouter>
      );
    }

    it('still shows the finished attempts and a back-to-leaderboard exit', () => {
      renderFailedSubmission();
      expect(screen.getByText('Attempt 2')).toBeTruthy();
      expect(screen.getByText('38.4s')).toBeTruthy();
      expect(
        screen.getByRole('button', { name: /Back to leaderboard/i })
      ).toBeTruthy();
    });

    it('explains that the time could not be submitted', () => {
      renderFailedSubmission();
      expect(screen.getByText(/couldn.t be submitted/i)).toBeTruthy();
    });

    it('hides the actions that need a server-recorded result', () => {
      renderFailedSubmission();
      // Sharing and remaining-attempt counts come from the server's record
      // of the run; without one they would 403 or lie.
      expect(screen.queryByRole('button', { name: /Flex/i })).toBeNull();
      expect(screen.queryByText(/Try again/i)).toBeNull();
    });
  });

  it("lists every finished attempt's time, including the run that just ended", () => {
    renderExtras();
    expect(screen.getByText('Attempt 1')).toBeTruthy();
    expect(screen.getByText('41.2s')).toBeTruthy();
    expect(screen.getByText('Attempt 2')).toBeTruthy();
    expect(screen.getByText('38.4s')).toBeTruthy();
  });

  it('marks the attempt that just finished as current', () => {
    renderExtras();
    const currentRow = screen.getByText('Attempt 2').closest('[aria-current]');
    expect(currentRow).not.toBeNull();
    expect(currentRow!.getAttribute('aria-current')).toBe('true');
    expect(screen.getByText('Attempt 1').closest('[aria-current]')).toBeNull();
  });

  it('skips attempts that were started but never finished', () => {
    renderExtras({
      loadedAttempts: [
        { attemptNumber: 1, durationMs: null },
        { attemptNumber: 2, durationMs: 41200 },
      ],
      justFinished: { attemptNumber: 3, durationMs: 38400 },
    });
    expect(screen.queryByText('Attempt 1')).toBeNull();
    expect(screen.getByText('Attempt 2')).toBeTruthy();
    expect(screen.getByText('Attempt 3')).toBeTruthy();
  });

  it('does not include the just-finished attempt twice', () => {
    renderExtras({
      loadedAttempts: [{ attemptNumber: 2, durationMs: 99900 }],
      justFinished: JUST_FINISHED,
    });
    expect(screen.getAllByText('Attempt 2')).toHaveLength(1);
    expect(screen.getByText('38.4s')).toBeTruthy();
    expect(screen.queryByText('99.9s')).toBeNull();
  });

  // The screen is deliberately just attempts, try-again, flex, and back.
  it('shows the try-again, flex, and back-to-leaderboard actions', () => {
    renderExtras();
    expect(
      screen.getByRole('button', { name: 'Try again (1 left)' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Flex on people/i })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Back to leaderboard/i })
    ).toBeTruthy();
    expect(screen.queryByText(/Share your time/i)).toBeNull();
    expect(screen.queryByText(/#2 of 7/)).toBeNull();
  });

  it('hides try-again when no attempts are left', () => {
    renderExtras({ attemptsRemaining: 0 });
    expect(screen.queryByText(/Try again/i)).toBeNull();
    expect(
      screen.getByRole('button', { name: /Back to leaderboard/i })
    ).toBeTruthy();
  });

  // Unraced slots keep the tile row balanced and show what's still available.
  it('shows a placeholder tile for each remaining attempt', () => {
    renderExtras({ attemptsRemaining: 2 });
    expect(screen.getByText('Attempt 3')).toBeTruthy();
    expect(screen.getByText('Attempt 4')).toBeTruthy();
    expect(screen.queryByText('Attempt 5')).toBeNull();
  });

  it('shows no placeholder tiles when out of attempts', () => {
    renderExtras({ attemptsRemaining: 0 });
    expect(screen.getByText('Attempt 2')).toBeTruthy();
    expect(screen.queryByText('Attempt 3')).toBeNull();
  });

  it('calls onTryAgain when try-again is clicked', () => {
    const onTryAgain = vi.fn();
    renderExtras({ attemptsRemaining: 2, onTryAgain });

    screen.getByRole('button', { name: 'Try again (2 left)' }).click();

    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });

  it('opens the share modal with the link and the best time from today', async () => {
    renderExtras();

    await act(async () => {
      screen.getByRole('button', { name: /Flex on people/i }).click();
    });

    expect(mockCreateDailyShareLink).toHaveBeenCalledWith('tok', RACE_DATE);
    const dialog = await screen.findByRole('dialog');
    expect(
      await screen.findByDisplayValue('https://vim.gym/c/abc')
    ).toBeTruthy();
    // Preview headline mirrors the backend og:title: name + best time.
    expect(
      within(dialog).getByText(
        /finished the VIM GYM daily race in 38\.4 seconds/
      )
    ).toBeTruthy();
  });
});

describe('DailyRacePage efficiency board', () => {
  it('re-sorts by key efficiency, with every metric on each row', async () => {
    mockFetchDailyLeaderboard.mockImplementation(
      (_token: unknown, _date: unknown, _limit: unknown, board: unknown) =>
        Promise.resolve({
          totalRacers: 1,
          neighborhood: null,
          lastPlace: null,
          entries: [
            board === 'efficiency'
              ? {
                  ...boardEntry(1, 'other-1', 'golfer'),
                  bestMs: 38100,
                  efficiency: 0.875,
                  optimalKeys: 42,
                  actualKeys: 48,
                }
              : boardEntry(1, 'other-1', 'speedster'),
          ],
        })
    );

    await act(async () => {
      renderDaily();
    });
    expect(await screen.findByText('speedster')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Speed' }).getAttribute('aria-pressed')
    ).toBe('true');

    await act(async () => {
      screen.getByRole('button', { name: 'Key Efficiency' }).click();
    });

    expect(await screen.findByText('golfer')).toBeTruthy();
    expect(mockFetchDailyLeaderboard).toHaveBeenLastCalledWith(
      'tok',
      undefined,
      5,
      'efficiency'
    );
    expect(screen.getByText('Keys')).toBeTruthy();
    expect(screen.getByText('/42').parentElement?.textContent).toBe('48/42');
    expect(screen.getByText('87.5%')).toBeTruthy();
    // Time is the efficient run's own time, the same run as the keys.
    expect(screen.getByText('38.1s')).toBeTruthy();
    expect(screen.getByTitle('48 keys used, 42 optimal · 87.5%')).toBeTruthy();
    expect(screen.queryByText('speedster')).toBeNull();
  });

  it('explains the key columns in a tip in the full leaderboard', async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 2,
      neighborhood: null,
      lastPlace: null,
      entries: [boardEntry(1, 'other-1', 'golfer')],
    });

    await act(async () => {
      renderDaily();
    });
    await screen.findByText('golfer');
    await act(async () => {
      screen.getByRole('button', { name: 'Show all 2 racers' }).click();
    });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Time')).toBeTruthy();
    expect(screen.queryByRole('tooltip')).toBeNull();

    const tipButton = within(dialog).getByRole('button', {
      name: 'How efficiency is scored',
    });
    await act(async () => {
      tipButton.focus();
    });
    expect(screen.getByRole('tooltip').textContent).toBe(
      "Keys is keystrokes used / optimal. For example, 50/40 means the racer used 50 keystrokes where the day's tasks can be done in 40, so Efficiency is 80%."
    );
    await act(async () => {
      tipButton.blur();
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens the full leaderboard on the selected board', async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 20,
      neighborhood: null,
      lastPlace: null,
      entries: [boardEntry(1, 'other-1', 'golfer')],
    });

    await act(async () => {
      renderDaily();
    });
    await screen.findByText('golfer');
    await act(async () => {
      screen.getByRole('button', { name: 'Key Efficiency' }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: /show all/i }).click();
    });

    expect(mockFetchDailyLeaderboard).toHaveBeenLastCalledWith(
      'tok',
      undefined,
      1000,
      'efficiency'
    );
    expect(
      within(screen.getByRole('dialog')).getByText(
        'Leaderboard by key efficiency'
      )
    ).toBeTruthy();
  });

  it('counts efficiency wins in the wins column on the efficiency board', async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 1,
      neighborhood: null,
      lastPlace: null,
      entries: [
        {
          ...boardEntry(1, 'other-1', 'golfer'),
          speedWins: 3,
          efficiencyWins: 2,
        },
      ],
    });

    await act(async () => {
      renderDaily();
    });
    await screen.findByText('golfer');
    await act(async () => {
      screen.getByRole('button', { name: 'Key Efficiency' }).click();
    });

    expect(await screen.findByText('Eff. wins')).toBeTruthy();
    expect(screen.queryByText('Spd. wins')).toBeNull();
    expect(screen.getByLabelText('2 efficiency board wins').textContent).toBe(
      'WIN2'
    );
  });

  // Switching boards keeps the panel's height: the old rows stay, dimmed and
  // inert under the amber spinner, until the new board's rows land.
  describe('while a board switch is loading', () => {
    function boardOf(name: string) {
      return {
        totalRacers: 1,
        neighborhood: null,
        lastPlace: null,
        entries: [boardEntry(1, 'other-1', name)],
      };
    }

    it('shows the spinner, not "No entries yet", before the first rows land', async () => {
      mockFetchDailyLeaderboard.mockReturnValue(new Promise(() => {}));

      await act(async () => {
        renderDaily();
      });

      expect(
        await screen.findByRole('status', { name: 'Loading leaderboard' })
      ).toBeTruthy();
      expect(screen.getByTestId('branded-loading-spinner')).toBeTruthy();
      expect(screen.queryByText('No entries yet')).toBeNull();
    });

    it('keeps the old rows, dimmed under the spinner, until the new board arrives', async () => {
      let resolveEfficiency: (
        data: ReturnType<typeof boardOf>
      ) => void = () => {};
      mockFetchDailyLeaderboard.mockImplementation(
        (_token: unknown, _date: unknown, _limit: unknown, board: unknown) =>
          board === 'efficiency'
            ? new Promise((resolve) => {
                resolveEfficiency = resolve;
              })
            : Promise.resolve(boardOf('speedster'))
      );

      await act(async () => {
        renderDaily();
      });
      expect(await screen.findByText('speedster')).toBeTruthy();
      expect(
        screen.queryByRole('status', { name: 'Loading leaderboard' })
      ).toBeNull();

      await act(async () => {
        screen.getByRole('button', { name: 'Key Efficiency' }).click();
      });

      const staleRow = screen.getByText('speedster');
      const cover = staleRow.closest('[aria-busy]') as HTMLElement;
      expect(cover.getAttribute('aria-busy')).toBe('true');
      expect(staleRow.closest('[inert]')).not.toBeNull();
      expect(
        screen.getByRole('status', { name: 'Loading leaderboard' })
      ).toBeTruthy();

      await act(async () => {
        resolveEfficiency(boardOf('golfer'));
      });

      expect(await screen.findByText('golfer')).toBeTruthy();
      expect(screen.queryByText('speedster')).toBeNull();
      expect(
        screen.queryByRole('status', { name: 'Loading leaderboard' })
      ).toBeNull();
      expect(
        screen
          .getByText('golfer')
          .closest('[aria-busy]')
          ?.getAttribute('aria-busy')
      ).toBe('false');
    });
  });
});
