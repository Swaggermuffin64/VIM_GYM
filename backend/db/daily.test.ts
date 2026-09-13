// backend/db/daily.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
let poolAvailable = false;
vi.mock('./pool.js', () => ({
  getPool: () => (poolAvailable ? { query: mockQuery } : null),
}));
vi.mock('./stats.js', () => ({
  upsertTasksOnFirstUse: vi.fn(async () => {}),
}));

import {
  generateShareSlug,
  getOrCreateDailyRace,
  getDailyAttempts,
  claimDailyAttempt,
  attachGameToDailyAttempt,
  getDailyGameForUser,
  completeDailyAttempt,
  queryDailyLeaderboard,
  queryDailyNeighborhood,
  countDailyRacers,
  queryDailyPlacing,
  getOrCreateShareLink,
  getShareInfo,
  incrementShareLinkClicks,
} from './daily.js';

describe('generateShareSlug', () => {
  it('returns 10 base62 characters', () => {
    const slug = generateShareSlug();
    expect(slug).toMatch(/^[0-9A-Za-z]{10}$/);
  });

  it('is overwhelmingly unlikely to collide', () => {
    const slugs = new Set(Array.from({ length: 1000 }, generateShareSlug));
    expect(slugs.size).toBe(1000);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  poolAvailable = false;
});

describe('getOrCreateDailyRace durability', () => {
  const TASK = { contentHash: 'h1', type: 'navigate' } as never;

  it('does not commit the race row when a task row is not durable', async () => {
    // Simulates upsertTasksOnFirstUse having swallowed a transient DB error:
    // the tasks table ends up missing 'h1'. The race row must NOT be created,
    // or the daily race would be permanently broken for the rest of the day.
    poolAvailable = true;
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM daily_races')) return { rows: [] };
      if (sql.includes('FROM tasks')) return { rows: [] }; // 'h1' missing
      return { rows: [] };
    });

    const result = await getOrCreateDailyRace('2026-08-16', () => [TASK]);

    expect(result).toBeNull();
    const ranInsert = mockQuery.mock.calls.some(([sql]) =>
      String(sql).includes('INSERT INTO daily_races')
    );
    expect(ranInsert).toBe(false);
  });

  it('creates the race once every task row is verified durable', async () => {
    poolAvailable = true;
    let raceInserted = false;
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO daily_races')) {
        raceInserted = true;
        return { rows: [] };
      }
      if (sql.includes('FROM daily_races')) {
        return raceInserted
          ? { rows: [{ task_hashes: ['h1'] }] }
          : { rows: [] };
      }
      if (sql.includes('FROM tasks')) {
        return { rows: [{ content_hash: 'h1', task_json: TASK }] };
      }
      return { rows: [] };
    });

    const result = await getOrCreateDailyRace('2026-08-16', () => [TASK]);

    expect(result).toEqual({ taskHashes: ['h1'], tasks: [TASK] });
    expect(raceInserted).toBe(true);
  });
});

describe('attachGameToDailyAttempt', () => {
  const params = {
    userId: 'u1',
    raceDate: '2026-08-16',
    attemptNumber: 1,
    gameId: 7,
  };

  it('returns true when the attempt row was updated', async () => {
    poolAvailable = true;
    mockQuery.mockResolvedValue({ rowCount: 1, rows: [] });
    await expect(attachGameToDailyAttempt(params)).resolves.toBe(true);
  });

  it('returns false when no attempt row matched', async () => {
    poolAvailable = true;
    mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });
    await expect(attachGameToDailyAttempt(params)).resolves.toBe(false);
  });

  it('returns false when the update fails', async () => {
    poolAvailable = true;
    mockQuery.mockRejectedValue(new Error('connection reset'));
    await expect(attachGameToDailyAttempt(params)).resolves.toBe(false);
  });
});

describe('incrementShareLinkClicks', () => {
  it('increments the click count for the slug', async () => {
    poolAvailable = true;
    mockQuery.mockResolvedValue({ rowCount: 1, rows: [] });

    await incrementShareLinkClicks('a1B2c3D4e5');

    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(String(sql)).toContain('click_count');
    expect(params).toEqual(['a1B2c3D4e5']);
  });

  it('swallows database errors so counting never breaks the share page', async () => {
    poolAvailable = true;
    mockQuery.mockRejectedValue(new Error('connection reset'));

    await expect(
      incrementShareLinkClicks('a1B2c3D4e5')
    ).resolves.toBeUndefined();
  });
});

describe('daily db functions without DATABASE_URL', () => {
  const uid = '00000000-0000-0000-0000-000000000000';

  it('all resolve as no-ops instead of throwing', async () => {
    await expect(
      getOrCreateDailyRace('2026-08-16', () => [])
    ).resolves.toBeNull();
    await expect(getDailyAttempts(uid, '2026-08-16')).resolves.toEqual([]);
    await expect(claimDailyAttempt(uid, '2026-08-16')).resolves.toEqual({
      status: 'error',
    });
    await expect(
      attachGameToDailyAttempt({
        userId: uid,
        raceDate: '2026-08-16',
        attemptNumber: 1,
        gameId: 1,
      })
    ).resolves.toBe(false);
    await expect(getDailyGameForUser(1, uid)).resolves.toBeNull();
    await expect(
      completeDailyAttempt({ userId: uid, gameId: 1, durationMs: 30_000 })
    ).resolves.toBeNull();
    await expect(queryDailyLeaderboard('2026-08-16', 30)).resolves.toEqual([]);
    await expect(queryDailyNeighborhood(uid, '2026-08-16')).resolves.toEqual(
      []
    );
    await expect(countDailyRacers('2026-08-16')).resolves.toBe(0);
    await expect(queryDailyPlacing(uid, '2026-08-16')).resolves.toBeNull();
    await expect(getOrCreateShareLink(uid, '2026-08-16')).resolves.toBeNull();
    await expect(getShareInfo('abc123XYZ0')).resolves.toBeNull();
    await expect(
      incrementShareLinkClicks('abc123XYZ0')
    ).resolves.toBeUndefined();
  });
});
