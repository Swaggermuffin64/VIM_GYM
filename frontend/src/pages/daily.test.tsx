// @vitest-environment jsdom
/**
 * Tests for the DailyRacePage: pre-race screen states, start flow,
 * rollover/out-of-attempts edge cases, and leaderboard rendering.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

// Stub the RaceSessionPage to a simple testid div (per brief: mock './practice').
vi.mock('./practice', () => ({
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
}));

// Import after mocks are wired (top-level await, same pattern as profile.test.tsx).
const dailyModule = await import('./daily');
const DailyRacePage = dailyModule.default;
const { DailyCompletionExtras } = dailyModule;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDaily() {
  return render(
    <MemoryRouter initialEntries={['/daily']}>
      <DailyRacePage />
    </MemoryRouter>
  );
}

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

  // The rail header is just the title now — no field-size count beside it.
  it('does not show a racer count in the leaderboard header', async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 312,
      neighborhood: null,
      entries: [
        {
          rank: 1,
          userId: 'other-1',
          displayName: 'speedster',
          avatarUrl: null,
          bestMs: 3000,
        },
        {
          rank: 2,
          userId: 'me-123',
          displayName: 'testuser',
          avatarUrl: null,
          bestMs: 5000,
        },
      ],
    });

    await act(async () => {
      renderDaily();
    });
    expect(await screen.findByText('speedster')).toBeTruthy();

    expect(screen.queryByText(/\d+ racers?/i)).toBeNull();
  });

  // Pinned neighborhood: divider + user's rank±1 rows below the top list.
  it('renders the divider and pinned neighborhood when the user is outside the top', async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 312,
      entries: [
        {
          rank: 1,
          userId: 'other-1',
          displayName: 'speedster',
          avatarUrl: null,
          bestMs: 3000,
        },
      ],
      neighborhood: [
        {
          rank: 46,
          userId: 'other-46',
          displayName: 'yank_bank',
          avatarUrl: null,
          bestMs: 57900,
        },
        {
          rank: 47,
          userId: 'me-123',
          displayName: 'testuser',
          avatarUrl: null,
          bestMs: 58700,
        },
      ],
    });

    await act(async () => {
      renderDaily();
    });
    expect(await screen.findByText('speedster')).toBeTruthy();

    expect(screen.getByText('···')).toBeTruthy();
    expect(screen.getByText('yank_bank')).toBeTruthy();
    const ownRow = screen.getByText('testuser').closest('[aria-current]');
    expect(ownRow).not.toBeNull();
  });

  // 6. Leaderboard renders entries with the signed-in user's row highlighted.
  it('renders leaderboard with signed-in user row highlighted', async () => {
    mockFetchDailyLeaderboard.mockResolvedValue({
      totalRacers: 3,
      neighborhood: null,
      entries: [
        {
          rank: 1,
          userId: 'other-1',
          displayName: 'speedster',
          avatarUrl: null,
          bestMs: 3000,
        },
        {
          rank: 2,
          userId: 'me-123',
          displayName: 'testuser',
          avatarUrl: null,
          bestMs: 5000,
        },
        {
          rank: 3,
          userId: 'other-2',
          displayName: 'slowpoke',
          avatarUrl: null,
          bestMs: 8000,
        },
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
    } = {}
  ) {
    return render(
      <MemoryRouter>
        <DailyCompletionExtras
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
        /finished the VIMGYM daily race in 38\.4 seconds/
      )
    ).toBeTruthy();
  });
});
