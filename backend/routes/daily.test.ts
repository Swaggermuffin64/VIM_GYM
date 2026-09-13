// backend/routes/daily.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  countDailyRacers: vi.fn(),
  queryDailyPlacing: vi.fn(),
  getOrCreateShareLink: vi.fn(),
  getShareInfo: vi.fn(),
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
}));

import * as daily from '../db/daily.js';
import * as stats from '../db/stats.js';
import { requireSupabaseAuth } from '../auth/httpAuth.js';
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
      },
      {
        user_id: 'user-1',
        display_name: 'me',
        avatar_url: null,
        best_ms: 58700,
        rank: 47,
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
    const res = await app.inject({ method: 'GET', url: '/api/daily' });
    expect(res.statusCode).toBe(401);
  });
});
