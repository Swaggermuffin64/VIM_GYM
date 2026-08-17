// backend/db/daily.test.ts
import { describe, it, expect } from 'vitest';
import {
  generateShareSlug,
  getOrCreateDailyRace,
  getDailyAttempts,
  claimDailyAttempt,
  attachGameToDailyAttempt,
  getDailyGameForUser,
  completeDailyAttempt,
  queryDailyLeaderboard,
  queryDailyPlacing,
  getOrCreateShareLink,
  getShareInfo,
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
    ).resolves.toBeUndefined();
    await expect(getDailyGameForUser(1, uid)).resolves.toBeNull();
    await expect(
      completeDailyAttempt({ userId: uid, gameId: 1, durationMs: 30_000 })
    ).resolves.toBeNull();
    await expect(queryDailyLeaderboard('2026-08-16', 30)).resolves.toEqual([]);
    await expect(queryDailyPlacing(uid, '2026-08-16')).resolves.toBeNull();
    await expect(getOrCreateShareLink(uid, '2026-08-16')).resolves.toBeNull();
    await expect(getShareInfo('abc123XYZ0')).resolves.toBeNull();
  });
});
