// backend/routes/daily.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../db/daily.js', () => ({
  MAX_DAILY_ATTEMPTS: 3,
  getOrCreateDailyRace: vi.fn(),
  getDailyAttempts: vi.fn(),
  claimDailyAttempt: vi.fn(),
  attachGameToDailyAttempt: vi.fn(),
  getDailyGameForUser: vi.fn(),
  completeDailyAttempt: vi.fn(),
  queryDailyLeaderboard: vi.fn(),
  queryDailyNeighborhood: vi.fn(),
  queryDailyLastPlace: vi.fn(),
  countDailyRacers: vi.fn(),
  queryDailyPlacing: vi.fn(),
  getOrCreateShareLink: vi.fn(),
  getShareInfo: vi.fn(),
}));
vi.mock('../db/dailyResults.js', () => ({
  queryEfficiencyBoard: vi.fn(),
  queryDailyHistory: vi.fn(),
  getSeenBadges: vi.fn(),
  addSeenBadges: vi.fn(),
}));
vi.mock('../db/stats.js', () => ({
  createGameSession: vi.fn(),
  finishGameSession: vi.fn(),
  upsertTasksOnFirstUse: vi.fn(),
}));
vi.mock('../taskPool.js', () => ({ pickTasksFromCache: vi.fn(() => []) }));
vi.mock('../auth/httpAuth.js', () => ({
  // Simulated signed-in user for every request; individual tests override.
  requireSupabaseAuth: vi.fn(async () => ({ id: 'user-1' })),
  // The public GETs resolve the user optionally; null means a visitor.
  tryResolveSupabaseUser: vi.fn(async () => ({ id: 'user-1' })),
}));

import * as daily from '../db/daily.js';
import * as dailyResults from '../db/dailyResults.js';
import * as stats from '../db/stats.js';
import {
  requireSupabaseAuth,
  tryResolveSupabaseUser,
} from '../auth/httpAuth.js';
import { registerDailyRoutes } from './daily.js';

async function buildServer() {
  const app = Fastify();
  await registerDailyRoutes(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Most tests are for users with no prior attempts today; individual tests
  // override with their own attempt history.
  vi.mocked(daily.getDailyAttempts).mockResolvedValue([]);
  // Attach succeeds by default; failure-path tests override with false.
  vi.mocked(daily.attachGameToDailyAttempt).mockResolvedValue(true);
  // No daily history unless a test supplies some: rows carry null badges.
  vi.mocked(dailyResults.queryDailyHistory).mockResolvedValue([]);
  vi.mocked(dailyResults.queryEfficiencyBoard).mockResolvedValue([]);
});

describe('GET /api/daily', () => {
  it('counts a forfeited attempt (game attached, never completed) against the cap', async () => {
    vi.mocked(daily.getOrCreateDailyRace).mockResolvedValue({
      taskHashes: ['h1'],
      tasks: [{ contentHash: 'h1' } as never],
    });
    // Slot 1 got a playable game but was abandoned mid-race: it is burned.
    // Slot 2 finished normally.
    vi.mocked(daily.getDailyAttempts).mockResolvedValue([
      { attemptNumber: 1, durationMs: null, completedAt: null, gameId: 55 },
      {
        attemptNumber: 2,
        durationMs: 19_800,
        completedAt: new Date(),
        gameId: 56,
      },
    ]);

    const app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/api/daily' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.attempts).toEqual([
      expect.objectContaining({ attempt_number: 1, duration_ms: null }),
      expect.objectContaining({ attempt_number: 2, duration_ms: 19_800 }),
    ]);
    expect(body.attempts_remaining).toBe(1);
    expect(body.best_ms).toBe(19_800);
  });

  it('hides a claimed slot that never received a game and does not count it', async () => {
    vi.mocked(daily.getOrCreateDailyRace).mockResolvedValue({
      taskHashes: ['h1'],
      tasks: [{ contentHash: 'h1' } as never],
    });
    // Slot 1 was claimed but game creation/attach failed (server error, lost
    // response): the player never raced, so nothing is burned or shown.
    vi.mocked(daily.getDailyAttempts).mockResolvedValue([
      { attemptNumber: 1, durationMs: null, completedAt: null, gameId: null },
      {
        attemptNumber: 2,
        durationMs: 19_800,
        completedAt: new Date(),
        gameId: 56,
      },
    ]);

    const app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/api/daily' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.attempts).toEqual([
      expect.objectContaining({ attempt_number: 2, duration_ms: 19_800 }),
    ]);
    expect(body.attempts_remaining).toBe(2);
    expect(body.best_ms).toBe(19_800);
  });

  // The optimal solution must never reach the client before a competitive
  // race — it is readable in the browser's network tab.
  // Share links land visitors here before they sign in, so the race must be
  // readable without a token. They get the tasks and the full attempt
  // allowance, and no attempt history is looked up for them.
  it("serves a visitor today's race with no attempts and the full allowance", async () => {
    vi.mocked(tryResolveSupabaseUser).mockResolvedValueOnce(null);
    vi.mocked(daily.getOrCreateDailyRace).mockResolvedValue({
      taskHashes: ['h1'],
      tasks: [{ contentHash: 'h1' } as never],
    });

    const app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/api/daily' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.attempts).toEqual([]);
    expect(body.attempts_remaining).toBe(3);
    expect(body.best_ms).toBeNull();
    expect(daily.getDailyAttempts).not.toHaveBeenCalled();
  });

  it('strips the recommended solution from the tasks it returns', async () => {
    vi.mocked(daily.getOrCreateDailyRace).mockResolvedValue({
      taskHashes: ['h1'],
      tasks: [
        {
          id: 't1',
          type: 'navigate',
          codeSnippet: 'abc',
          contentHash: 'h1',
          description: 'go',
          targetOffset: 2,
          recommendedSequence: ['t', 'c'],
          recommendedWeight: 2,
        } as never,
      ],
    });

    const app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/api/daily' });

    expect(res.statusCode).toBe(200);
    const [task] = res.json().tasks;
    expect(task.recommendedSequence).toBeUndefined();
    expect(task.recommendedWeight).toBeUndefined();
    // Everything the client actually races with is still there.
    expect(task).toMatchObject({
      id: 't1',
      codeSnippet: 'abc',
      targetOffset: 2,
    });
  });
});

describe('POST /api/daily/attempt/start', () => {
  it('reuses a slot that never received a game instead of burning a new one', async () => {
    vi.mocked(daily.getOrCreateDailyRace).mockResolvedValue({
      taskHashes: ['h1'],
      tasks: [{ contentHash: 'h1' } as never],
    });
    // Slot 1 was claimed but the start request failed before a game was
    // attached — the player never raced it, so it is recycled.
    vi.mocked(daily.getDailyAttempts).mockResolvedValue([
      { attemptNumber: 1, durationMs: null, completedAt: null, gameId: null },
      {
        attemptNumber: 2,
        durationMs: 19_800,
        completedAt: new Date(),
        gameId: 56,
      },
    ]);
    vi.mocked(stats.createGameSession).mockResolvedValue(88);

    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/daily/attempt/start',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, attempt_number: 1 });
    // The never-raced slot is recycled, so no fresh slot is claimed and the
    // new game session (fresh timing window) is attached to it.
    expect(daily.claimDailyAttempt).not.toHaveBeenCalled();
    expect(daily.attachGameToDailyAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ attemptNumber: 1, gameId: 88 })
    );
  });

  it('does not reuse a forfeited slot: abandoning a race burns the attempt', async () => {
    vi.mocked(daily.getOrCreateDailyRace).mockResolvedValue({
      taskHashes: ['h1'],
      tasks: [{ contentHash: 'h1' } as never],
    });
    // Slot 1 got a playable game and was abandoned mid-race. Restarting must
    // claim a fresh slot, not recycle the abandoned one with a fresh timer.
    vi.mocked(daily.getDailyAttempts).mockResolvedValue([
      { attemptNumber: 1, durationMs: null, completedAt: null, gameId: 55 },
    ]);
    vi.mocked(daily.claimDailyAttempt).mockResolvedValue({
      status: 'claimed',
      attemptNumber: 2,
    });
    vi.mocked(stats.createGameSession).mockResolvedValue(88);

    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/daily/attempt/start',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, attempt_number: 2 });
    expect(daily.claimDailyAttempt).toHaveBeenCalled();
  });

  it('claims a slot, creates a daily game session, and returns both ids', async () => {
    vi.mocked(daily.claimDailyAttempt).mockResolvedValue({
      status: 'claimed',
      attemptNumber: 2,
    });
    vi.mocked(daily.getOrCreateDailyRace).mockResolvedValue({
      taskHashes: ['h1'],
      tasks: [{ contentHash: 'h1' } as never],
    });
    vi.mocked(stats.createGameSession).mockResolvedValue(77);

    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/daily/attempt/start',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      success: true,
      attempt_number: 2,
      game_id: 77,
    });
    expect(stats.createGameSession).toHaveBeenCalledWith(
      expect.objectContaining({ playMode: 'daily', userIds: ['user-1'] })
    );
    expect(daily.attachGameToDailyAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ attemptNumber: 2, gameId: 77 })
    );
  });

  it('returns 500 game_creation_failed when the game session cannot be created', async () => {
    vi.mocked(daily.getOrCreateDailyRace).mockResolvedValue({
      taskHashes: ['h1'],
      tasks: [{ contentHash: 'h1' } as never],
    });
    vi.mocked(daily.claimDailyAttempt).mockResolvedValue({
      status: 'claimed',
      attemptNumber: 1,
    });
    vi.mocked(stats.createGameSession).mockResolvedValue(null);

    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/daily/attempt/start',
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({
      success: false,
      error: 'game_creation_failed',
    });
    expect(daily.attachGameToDailyAttempt).not.toHaveBeenCalled();
  });

  it('returns 500 attach_failed when the game cannot be linked to the attempt', async () => {
    vi.mocked(daily.getOrCreateDailyRace).mockResolvedValue({
      taskHashes: ['h1'],
      tasks: [{ contentHash: 'h1' } as never],
    });
    vi.mocked(daily.claimDailyAttempt).mockResolvedValue({
      status: 'claimed',
      attemptNumber: 1,
    });
    vi.mocked(stats.createGameSession).mockResolvedValue(77);
    vi.mocked(daily.attachGameToDailyAttempt).mockResolvedValue(false);

    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/daily/attempt/start',
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({
      success: false,
      error: 'attach_failed',
    });
  });

  it('refuses the 4th attempt with 403 out_of_attempts', async () => {
    vi.mocked(daily.getOrCreateDailyRace).mockResolvedValue({
      taskHashes: ['h1'],
      tasks: [{ contentHash: 'h1' } as never],
    });
    vi.mocked(daily.claimDailyAttempt).mockResolvedValue({
      status: 'out_of_attempts',
    });
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/daily/attempt/start',
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      success: false,
      error: 'out_of_attempts',
    });
  });
});

describe('POST /api/daily/attempt/complete', () => {
  it('rejects a client duration exceeding the server window plus tolerance', async () => {
    vi.mocked(daily.getDailyGameForUser).mockResolvedValue({
      startedAt: new Date(Date.now() - 10_000), // server says ~10s elapsed
      finishedAt: null,
      taskCount: 10,
    });
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/daily/attempt/complete',
      payload: { game_id: 77, duration_ms: 60_000 }, // claims 60s
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: 'duration_exceeds_server_window',
    });
    expect(daily.completeDailyAttempt).not.toHaveBeenCalled();
  });

  it('finalizes a valid completion and returns placing', async () => {
    vi.mocked(daily.getDailyGameForUser).mockResolvedValue({
      startedAt: new Date(Date.now() - 65_000),
      finishedAt: null,
      taskCount: 10,
    });
    vi.mocked(daily.completeDailyAttempt).mockResolvedValue({
      attemptNumber: 1,
      raceDate: '2026-08-16',
    });
    vi.mocked(daily.queryDailyPlacing).mockResolvedValue({
      rank: 4,
      totalRacers: 212,
      bestMs: 60_000,
    });
    // Slot 1 was forfeited (game attached, never completed): it still counts
    // against the remaining attempts.
    vi.mocked(daily.getDailyAttempts).mockResolvedValue([
      { attemptNumber: 1, durationMs: null, completedAt: null, gameId: 55 },
      {
        attemptNumber: 2,
        durationMs: 60_000,
        completedAt: new Date(),
        gameId: 77,
      },
    ]);
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/daily/attempt/complete',
      payload: { game_id: 77, duration_ms: 60_000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      rank: 4,
      total_racers: 212,
      best_ms: 60_000,
      attempts_remaining: 1,
    });
    expect(stats.finishGameSession).toHaveBeenCalled();
  });
});

describe('POST /api/daily/share', () => {
  it('refuses when the user has no finished attempt today', async () => {
    vi.mocked(daily.queryDailyPlacing).mockResolvedValue(null);
    const app = await buildServer();
    const res = await app.inject({ method: 'POST', url: '/api/daily/share' });
    expect(res.statusCode).toBe(403);
  });

  it('returns an idempotent share URL after a finished attempt', async () => {
    vi.mocked(daily.queryDailyPlacing).mockResolvedValue({
      rank: 1,
      totalRacers: 5,
      bestMs: 42_000,
    });
    vi.mocked(daily.getOrCreateShareLink).mockResolvedValue('a1B2c3D4e5');
    const app = await buildServer();
    const res = await app.inject({ method: 'POST', url: '/api/daily/share' });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toMatch(/\/s\/a1B2c3D4e5$/);
  });

  // A race finished at 23:59 can be shared at 00:01: the client passes the
  // race_date it is sharing instead of the server assuming "today".
  it('shares the explicitly requested race_date (midnight straddle)', async () => {
    vi.mocked(daily.queryDailyPlacing).mockResolvedValue({
      rank: 1,
      totalRacers: 5,
      bestMs: 42_000,
    });
    vi.mocked(daily.getOrCreateShareLink).mockResolvedValue('a1B2c3D4e5');
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/daily/share',
      payload: { race_date: '2026-08-15' },
    });
    expect(res.statusCode).toBe(200);
    expect(daily.queryDailyPlacing).toHaveBeenCalledWith(
      expect.any(String),
      '2026-08-15'
    );
    expect(daily.getOrCreateShareLink).toHaveBeenCalledWith(
      expect.any(String),
      '2026-08-15'
    );
  });

  it('rejects a malformed race_date', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/daily/share',
      payload: { race_date: 'yesterday' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_date_format');
  });
});

describe('GET /api/daily/leaderboard', () => {
  const TOP_ENTRY = {
    userId: 'other-1',
    displayName: 'speedy',
    avatarUrl: null,
    bestMs: 34800,
    rank: 1,
  };
  const NEIGHBORS = [
    {
      userId: 'other-46',
      displayName: 'yank_bank',
      avatarUrl: null,
      bestMs: 57900,
      rank: 46,
    },
    {
      userId: 'user-1',
      displayName: 'me',
      avatarUrl: null,
      bestMs: 58700,
      rank: 47,
    },
  ];

  it('includes total_racers and the neighborhood when the user is outside the top entries', async () => {
    vi.mocked(daily.queryDailyLeaderboard).mockResolvedValue([TOP_ENTRY]);
    vi.mocked(daily.countDailyRacers).mockResolvedValue(312);
    vi.mocked(daily.queryDailyNeighborhood).mockResolvedValue(NEIGHBORS);

    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/daily/leaderboard',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total_racers).toBe(312);
    expect(body.neighborhood).toEqual([
      {
        user_id: 'other-46',
        display_name: 'yank_bank',
        avatar_url: null,
        best_ms: 57900,
        rank: 46,
        efficiency: null,
        optimal_keys: null,
        actual_keys: null,
        efficiency_ms: null,
        badges: null,
      },
      {
        user_id: 'user-1',
        display_name: 'me',
        avatar_url: null,
        best_ms: 58700,
        rank: 47,
        efficiency: null,
        optimal_keys: null,
        actual_keys: null,
        efficiency_ms: null,
        badges: null,
      },
    ]);
  });

  it('returns a null neighborhood when the user already appears in the top entries', async () => {
    vi.mocked(daily.queryDailyLeaderboard).mockResolvedValue([
      { ...TOP_ENTRY, userId: 'user-1' },
    ]);
    vi.mocked(daily.countDailyRacers).mockResolvedValue(5);

    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/daily/leaderboard',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().neighborhood).toBeNull();
    expect(daily.queryDailyNeighborhood).not.toHaveBeenCalled();
  });

  it('serves a visitor the top entries with no neighborhood lookup', async () => {
    vi.mocked(tryResolveSupabaseUser).mockResolvedValueOnce(null);
    vi.mocked(daily.queryDailyLeaderboard).mockResolvedValue([TOP_ENTRY]);
    vi.mocked(daily.countDailyRacers).mockResolvedValue(212);

    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/daily/leaderboard',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.entries).toHaveLength(1);
    expect(body.total_racers).toBe(212);
    expect(body.neighborhood).toBeNull();
    expect(daily.queryDailyNeighborhood).not.toHaveBeenCalled();
  });

  it('returns a null neighborhood when the user has no finished attempt', async () => {
    vi.mocked(daily.queryDailyLeaderboard).mockResolvedValue([TOP_ENTRY]);
    vi.mocked(daily.countDailyRacers).mockResolvedValue(312);
    vi.mocked(daily.queryDailyNeighborhood).mockResolvedValue([]);

    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/daily/leaderboard',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().neighborhood).toBeNull();
  });

  // The rail closes with the slowest racer, below the top entries.
  it('includes last_place when the field is larger than the entries returned', async () => {
    vi.mocked(daily.queryDailyLeaderboard).mockResolvedValue([TOP_ENTRY]);
    vi.mocked(daily.countDailyRacers).mockResolvedValue(47);
    vi.mocked(daily.queryDailyNeighborhood).mockResolvedValue([]);
    vi.mocked(daily.queryDailyLastPlace).mockResolvedValue(NEIGHBORS[1]!);

    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/daily/leaderboard?date=2026-08-16',
    });

    expect(daily.queryDailyLastPlace).toHaveBeenCalledWith('2026-08-16');
    expect(res.json().last_place).toEqual({
      user_id: 'user-1',
      display_name: 'me',
      avatar_url: null,
      best_ms: 58700,
      rank: 47,
      efficiency: null,
      optimal_keys: null,
      actual_keys: null,
      efficiency_ms: null,
      badges: null,
    });
  });

  it('returns a null last_place, without looking it up, when every racer is in the entries', async () => {
    vi.mocked(daily.queryDailyLeaderboard).mockResolvedValue([
      { ...TOP_ENTRY, userId: 'user-1' },
    ]);
    vi.mocked(daily.countDailyRacers).mockResolvedValue(1);

    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/daily/leaderboard',
    });

    expect(res.json().last_place).toBeNull();
    expect(daily.queryDailyLastPlace).not.toHaveBeenCalled();
  });

  // The daily page's full-leaderboard dialog asks for the whole field in one call.
  it('honors a row limit above the old 100-row ceiling', async () => {
    vi.mocked(daily.queryDailyLeaderboard).mockResolvedValue([TOP_ENTRY]);
    vi.mocked(daily.countDailyRacers).mockResolvedValue(312);

    const app = await buildServer();
    await app.inject({
      method: 'GET',
      url: '/api/daily/leaderboard?date=2026-08-16&limit=1000',
    });

    expect(daily.queryDailyLeaderboard).toHaveBeenCalledWith(
      '2026-08-16',
      1000
    );
  });

  it('clamps an oversized row limit to 1000', async () => {
    vi.mocked(daily.queryDailyLeaderboard).mockResolvedValue([TOP_ENTRY]);
    vi.mocked(daily.countDailyRacers).mockResolvedValue(312);

    const app = await buildServer();
    await app.inject({
      method: 'GET',
      url: '/api/daily/leaderboard?date=2026-08-16&limit=50000',
    });

    expect(daily.queryDailyLeaderboard).toHaveBeenCalledWith(
      '2026-08-16',
      1000
    );
  });
});

describe('GET /api/daily/leaderboard?board=efficiency', () => {
  /** An efficiency-board row; rank and efficiency vary per test. */
  function effRow(userId: string, rank: number, efficiency: number) {
    return {
      userId,
      displayName: userId,
      avatarUrl: null,
      efficiency,
      durationMs: 40_000 + rank,
      optimalKeys: 42,
      actualKeys: Math.round(42 / efficiency),
      rank,
    };
  }

  it('rejects an unknown board', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/daily/leaderboard?board=style',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_board');
  });

  it('slices the top entries and last place from the ranked field', async () => {
    vi.mocked(tryResolveSupabaseUser).mockResolvedValueOnce(null);
    vi.mocked(dailyResults.queryEfficiencyBoard).mockResolvedValue([
      effRow('a', 1, 1),
      effRow('b', 2, 0.9),
      effRow('c', 3, 0.8),
      effRow('d', 4, 0.7),
    ]);

    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/daily/leaderboard?board=efficiency&limit=2',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.board).toBe('efficiency');
    expect(body.total_racers).toBe(4);
    expect(body.entries).toEqual([
      {
        user_id: 'a',
        display_name: 'a',
        avatar_url: null,
        best_ms: 40_001,
        rank: 1,
        efficiency: 1,
        optimal_keys: 42,
        actual_keys: 42,
        efficiency_ms: 40_001,
        badges: null,
      },
      {
        user_id: 'b',
        display_name: 'b',
        avatar_url: null,
        best_ms: 40_002,
        rank: 2,
        efficiency: 0.9,
        optimal_keys: 42,
        actual_keys: 47,
        efficiency_ms: 40_002,
        badges: null,
      },
    ]);
    expect(body.last_place.user_id).toBe('d');
    expect(body.neighborhood).toBeNull();
    expect(daily.queryDailyLeaderboard).not.toHaveBeenCalled();
  });

  it("includes the viewer's rank±1 rows when they fall outside the top entries", async () => {
    vi.mocked(dailyResults.queryEfficiencyBoard).mockResolvedValue([
      effRow('a', 1, 1),
      effRow('b', 2, 0.9),
      effRow('c', 3, 0.8),
      effRow('user-1', 4, 0.7),
      effRow('e', 5, 0.6),
      effRow('f', 6, 0.5),
    ]);

    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/daily/leaderboard?board=efficiency&limit=2',
    });

    const body = res.json();
    expect(
      body.neighborhood.map((e: { user_id: string }) => e.user_id)
    ).toEqual(['c', 'user-1', 'e']);
  });

  it('picks the lowest id among racers tied for last place', async () => {
    vi.mocked(dailyResults.queryEfficiencyBoard).mockResolvedValue([
      effRow('a', 1, 1),
      effRow('b', 2, 0.5),
      effRow('c', 2, 0.5),
    ]);

    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/daily/leaderboard?board=efficiency&limit=1',
    });

    expect(res.json().last_place.user_id).toBe('b');
  });
});

describe('leaderboard rows carry both metrics', () => {
  /** u1's result for 2026-10-19: best time 30s, best efficiency 40/50 on a 33s run. */
  const today = {
    userId: 'u1',
    raceDate: '2026-10-19',
    bestMs: 30_000,
    speedRank: 1,
    racers: 2,
    efficiency: 0.8,
    efficiencyMs: 33_000,
    optimalKeys: 40,
    actualKeys: 50,
    efficiencyRank: 2,
    efficiencyRacers: 2,
  };

  it('adds the most efficient run to speed-sorted rows', async () => {
    vi.mocked(daily.queryDailyLeaderboard).mockResolvedValue([
      {
        userId: 'u1',
        displayName: 'u1',
        avatarUrl: null,
        bestMs: 30_000,
        rank: 1,
      },
    ]);
    vi.mocked(daily.countDailyRacers).mockResolvedValue(1);
    vi.mocked(dailyResults.queryDailyHistory).mockResolvedValue([today]);

    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/daily/leaderboard?date=2026-10-19',
    });

    expect(res.json().entries[0]).toMatchObject({
      best_ms: 30_000,
      efficiency: 0.8,
      optimal_keys: 40,
      actual_keys: 50,
      efficiency_ms: 33_000,
    });
  });

  it('adds the best time to efficiency-sorted rows', async () => {
    vi.mocked(dailyResults.queryEfficiencyBoard).mockResolvedValue([
      {
        userId: 'u1',
        displayName: 'u1',
        avatarUrl: null,
        efficiency: 0.8,
        durationMs: 33_000,
        optimalKeys: 40,
        actualKeys: 50,
        rank: 1,
      },
    ]);
    vi.mocked(dailyResults.queryDailyHistory).mockResolvedValue([today]);

    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/daily/leaderboard?date=2026-10-19&board=efficiency',
    });

    // best_ms is the racer's best time, not the efficient run's 33s.
    expect(res.json().entries[0]).toMatchObject({
      best_ms: 30_000,
      efficiency: 0.8,
      efficiency_ms: 33_000,
    });
  });
});

describe('leaderboard badge chips', () => {
  it("attaches each listed racer's streak, podium streak, and wins", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
    try {
      vi.mocked(daily.queryDailyLeaderboard).mockResolvedValue([
        {
          userId: 'other-1',
          displayName: 'speedy',
          avatarUrl: null,
          bestMs: 30_000,
          rank: 1,
        },
      ]);
      vi.mocked(daily.countDailyRacers).mockResolvedValue(1);
      const day = (raceDate: string, speedRank: number) => ({
        userId: 'other-1',
        raceDate,
        bestMs: 30_000,
        speedRank,
        racers: 10,
        efficiency: null,
        efficiencyMs: null,
        optimalKeys: null,
        actualKeys: null,
        efficiencyRank: null,
        efficiencyRacers: null,
      });
      vi.mocked(dailyResults.queryDailyHistory).mockResolvedValue([
        day('2026-10-17', 1),
        day('2026-10-18', 2),
        day('2026-10-19', 1),
      ]);

      const app = await buildServer();
      const res = await app.inject({
        method: 'GET',
        url: '/api/daily/leaderboard',
      });

      expect(dailyResults.queryDailyHistory).toHaveBeenCalledWith(['other-1']);
      // Today's #1 is still moving, so only the 17th counts as a win.
      expect(res.json().entries[0].badges).toEqual({
        streak: 3,
        podium_streak: 2,
        wins: 1,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('GET /api/daily/profile', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
    // Seven straight raced days through yesterday, winning the first.
    vi.mocked(dailyResults.queryDailyHistory).mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => ({
        userId: 'user-1',
        raceDate: `2026-10-${String(12 + i).padStart(2, '0')}`,
        bestMs: 40_000 - i,
        speedRank: i === 0 ? 1 : 5,
        racers: 20,
        efficiency: 0.9,
        efficiencyMs: 41_000,
        optimalKeys: 42,
        actualKeys: 48,
        efficiencyRank: 4,
        efficiencyRacers: 18,
      }))
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns badges, streaks, and recent placings, flagging unseen badges', async () => {
    vi.mocked(dailyResults.getSeenBadges).mockResolvedValue(['first_win']);

    const app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/api/daily/profile' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.badges).toEqual([
      { id: 'days_7', earned_on: '2026-10-18' },
      { id: 'streak_7', earned_on: '2026-10-18' },
      { id: 'first_win', earned_on: '2026-10-12' },
    ]);
    expect(body.unseen_badges.map((b: { id: string }) => b.id)).toEqual([
      'days_7',
      'streak_7',
    ]);
    expect(body.streaks.participation).toEqual({ current: 7, longest: 7 });
    expect(body.counters.speed_wins).toBe(1);
    expect(body.personal_bests.best_speed_placing).toEqual({
      rank: 1,
      racers: 20,
      race_date: '2026-10-12',
    });
    expect(body.recent[0]).toEqual({
      race_date: '2026-10-18',
      best_ms: 39_994,
      speed_rank: 5,
      racers: 20,
      efficiency: 0.9,
      efficiency_rank: 4,
      efficiency_racers: 18,
    });
  });

  it('reports nothing unseen when the seen list cannot be read', async () => {
    vi.mocked(dailyResults.getSeenBadges).mockResolvedValue(null);

    const app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/api/daily/profile' });

    expect(res.json().unseen_badges).toEqual([]);
    expect(res.json().badges).toHaveLength(3);
  });
});

describe('POST /api/daily/badges/seen', () => {
  it('records known badge ids as seen', async () => {
    vi.mocked(dailyResults.addSeenBadges).mockResolvedValue(true);

    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/daily/badges/seen',
      payload: { badge_ids: ['days_7', 'first_win'] },
    });

    expect(res.statusCode).toBe(200);
    expect(dailyResults.addSeenBadges).toHaveBeenCalledWith('user-1', [
      'days_7',
      'first_win',
    ]);
  });

  it.each([
    ['missing', {}],
    ['empty', { badge_ids: [] }],
    ['unknown', { badge_ids: ['days_7', 'made_up'] }],
  ])('rejects %s badge ids', async (_label, payload) => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/daily/badges/seen',
      payload,
    });

    expect(res.statusCode).toBe(400);
    expect(dailyResults.addSeenBadges).not.toHaveBeenCalled();
  });

  it('returns 500 when the write fails', async () => {
    vi.mocked(dailyResults.addSeenBadges).mockResolvedValue(false);

    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/daily/badges/seen',
      payload: { badge_ids: ['days_7'] },
    });

    expect(res.statusCode).toBe(500);
  });
});

describe('auth gating', () => {
  it('returns nothing past requireSupabaseAuth when unauthenticated', async () => {
    vi.mocked(requireSupabaseAuth).mockImplementation(async (_req, reply) => {
      (reply as { status: (c: number) => { send: (b: unknown) => unknown } })
        .status(401)
        .send({ success: false, error: 'Authentication required' });
      return null;
    });
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/daily/attempt/start',
    });
    expect(res.statusCode).toBe(401);
  });
});
