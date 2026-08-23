// backend/db/profiles.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
let poolAvailable = true;
vi.mock('./pool.js', () => ({
  getPool: () => (poolAvailable ? { query: mockQuery } : null),
}));

import { upsertProfile } from './profiles.js';

const PROFILE_ROW = {
  id: 'u1',
  display_name: 'speedy',
  avatar_url: null,
  is_premium: false,
  has_completed_onboarding: true,
  created_at: '2026-08-23T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  poolAvailable = true;
});

describe('upsertProfile', () => {
  it('returns ok with the profile on success', async () => {
    mockQuery.mockResolvedValue({ rows: [PROFILE_ROW] });

    const result = await upsertProfile('u1', { display_name: 'speedy' });

    expect(result).toEqual({ status: 'ok', profile: PROFILE_ROW });
  });

  it('returns name_taken when the unique display-name index rejects the write', async () => {
    mockQuery.mockRejectedValue(
      Object.assign(new Error('duplicate key'), { code: '23505' })
    );

    const result = await upsertProfile('u1', { display_name: 'speedy' });

    expect(result).toEqual({ status: 'name_taken' });
  });

  it('returns error without a pool', async () => {
    poolAvailable = false;

    const result = await upsertProfile('u1', { display_name: 'speedy' });

    expect(result).toEqual({ status: 'error' });
  });

  it('rethrows non-unique-violation database errors', async () => {
    mockQuery.mockRejectedValue(new Error('connection reset'));

    await expect(
      upsertProfile('u1', { display_name: 'speedy' })
    ).rejects.toThrow('connection reset');
  });
});
