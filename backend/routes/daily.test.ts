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

beforeEach(() => vi.clearAllMocks());

describe('POST /api/daily/attempt/start', () => {
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
    vi.mocked(daily.getDailyAttempts).mockResolvedValue([
      { attemptNumber: 1, durationMs: 60_000, completedAt: new Date() },
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
      attempts_remaining: 2,
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
