// backend/daily/eagerDailyRaceCreation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/daily.js', () => ({
  getOrCreateDailyRace: vi.fn(),
}));
vi.mock('../taskPool.js', () => ({ pickTasksFromCache: vi.fn(() => []) }));

import { getOrCreateDailyRace } from '../db/daily.js';
import { pickTasksFromCache } from '../taskPool.js';
import { eagerlyCreateTodaysDailyRace } from './eagerDailyRaceCreation.js';

beforeEach(() => vi.clearAllMocks());

describe('eagerlyCreateTodaysDailyRace', () => {
  it('does not touch the database when disabled (local dev)', async () => {
    const result = await eagerlyCreateTodaysDailyRace(false);

    expect(result).toBe('skipped');
    expect(getOrCreateDailyRace).not.toHaveBeenCalled();
  });

  it("creates today's UTC race using the task cache when enabled", async () => {
    vi.mocked(getOrCreateDailyRace).mockResolvedValue({
      taskHashes: ['h1'],
      tasks: [{ contentHash: 'h1' } as never],
    });

    const result = await eagerlyCreateTodaysDailyRace(true);

    expect(result).toBe('ok');
    const todayUtc = new Date().toISOString().slice(0, 10);
    expect(getOrCreateDailyRace).toHaveBeenCalledWith(
      todayUtc,
      pickTasksFromCache
    );
  });

  it('reports failure without throwing when creation returns null', async () => {
    vi.mocked(getOrCreateDailyRace).mockResolvedValue(null);

    await expect(eagerlyCreateTodaysDailyRace(true)).resolves.toBe('failed');
  });

  it('reports failure without throwing when creation rejects', async () => {
    vi.mocked(getOrCreateDailyRace).mockRejectedValue(new Error('db down'));

    await expect(eagerlyCreateTodaysDailyRace(true)).resolves.toBe('failed');
  });
});
