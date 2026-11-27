// backend/routes/players.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../db/profiles.js', () => ({ getProfile: vi.fn() }));
vi.mock('../db/playerStats.js', () => ({ getPlayerStats: vi.fn() }));
vi.mock('../db/dailyResults.js', () => ({ queryDailyHistory: vi.fn() }));
vi.mock('../auth/httpAuth.js', () => ({
  // Simulated signed-in viewer for every request; individual tests override.
  requireSupabaseAuth: vi.fn(async () => ({ id: 'viewer-1' })),
}));

import { getProfile } from '../db/profiles.js';
import { getPlayerStats } from '../db/playerStats.js';
import { queryDailyHistory } from '../db/dailyResults.js';
import { requireSupabaseAuth } from '../auth/httpAuth.js';
import { registerPlayerRoutes } from './players.js';

const PLAYER_ID = 'e7a7e52a-d6b8-4084-88fd-d7362cd7975a';

const PROFILE = {
  id: PLAYER_ID,
  display_name: 'stinkyhat',
  avatar_url: 'https://example.com/a.png',
  is_premium: true,
  has_completed_onboarding: true,
  showcased_badges: ['streak-7'],
  created_at: '2026-05-01T00:00:00.000Z',
};

const STATS = {
  racesPlayed: 4,
  wins: 1,
  bestRaceMs: 21_444,
  tasksCompleted: 40,
  avgTaskMs: 2_000,
  avgRaceMs: 30_000,
  avgTaskEfficiency: 0.8,
  efficiencySample: 40,
  recentGames: [],
  totalRuns: 12,
  multiplayer: { races: 4, wins: 1 },
  activity: [{ day: '2026-11-25', runs: 3, multiplayerWins: 1 }],
  raceTimeWeekly: [],
  avgRaceMs30d: 29_000,
  avgRaceMsPrev30d: 31_000,
};

async function buildServer() {
  const app = Fastify();
  await registerPlayerRoutes(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProfile).mockResolvedValue(PROFILE as never);
  vi.mocked(getPlayerStats).mockResolvedValue(STATS as never);
  vi.mocked(queryDailyHistory).mockResolvedValue([]);
});

describe('GET /api/players/:id', () => {
  it("returns another player's profile, stats and daily history", async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: `/api/players/${PLAYER_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.player).toEqual({
      id: PLAYER_ID,
      display_name: 'stinkyhat',
      avatar_url: 'https://example.com/a.png',
      showcased_badges: ['streak-7'],
      created_at: '2026-05-01T00:00:00.000Z',
    });
    expect(body.stats.total_runs).toBe(12);
    expect(body.stats.multiplayer).toEqual({
      races: 4,
      wins: 1,
      win_rate: 0.25,
    });
    expect(body.daily.counters.days_raced).toBe(0);
    expect(getPlayerStats).toHaveBeenCalledWith(PLAYER_ID);
    expect(queryDailyHistory).toHaveBeenCalledWith([PLAYER_ID]);
  });

  it('keeps private fields out of the response', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: `/api/players/${PLAYER_ID}`,
    });

    const body = res.json();
    expect(body.player).not.toHaveProperty('is_premium');
    expect(body.player).not.toHaveProperty('has_completed_onboarding');
    expect(body.daily).not.toHaveProperty('unseen_badges');
  });

  it('404s for an id with no profile', async () => {
    vi.mocked(getProfile).mockResolvedValue(null);
    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: `/api/players/${PLAYER_ID}`,
    });

    expect(res.statusCode).toBe(404);
    expect(getPlayerStats).not.toHaveBeenCalled();
  });

  it('404s for a malformed id without querying the database', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/players/not-a-uuid',
    });

    expect(res.statusCode).toBe(404);
    expect(getProfile).not.toHaveBeenCalled();
  });

  it('is for signed-in users only', async () => {
    vi.mocked(requireSupabaseAuth).mockImplementationOnce(
      async (_request, reply) => {
        reply.status(401).send({ success: false, error: 'Unauthorized' });
        return null;
      }
    );
    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: `/api/players/${PLAYER_ID}`,
    });

    expect(res.statusCode).toBe(401);
    expect(getProfile).not.toHaveBeenCalled();
  });
});
