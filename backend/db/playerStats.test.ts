// Unit test: with DATABASE_URL unset, getPlayerStats degrades to the
// zero-state instead of throwing (real SQL is covered by the integration
// suite in test/integration/playerStats.test.ts).
import { describe, it, expect } from 'vitest';
import { getPlayerStats } from './playerStats.js';

describe('getPlayerStats without DATABASE_URL', () => {
  it('resolves to the zero-state object instead of throwing', async () => {
    await expect(
      getPlayerStats('00000000-0000-0000-0000-000000000000')
    ).resolves.toEqual({
      racesPlayed: 0,
      wins: 0,
      bestRaceMs: null,
      tasksCompleted: 0,
      avgTaskMs: null,
      recentGames: [],
    });
  });
});
