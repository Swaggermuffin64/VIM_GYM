import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifySupabaseToken = vi.fn();
const isSupabaseToken = vi.fn();
const getProfile = vi.fn();

vi.mock('./supabaseAuth.js', () => ({
  verifySupabaseToken: (...args: unknown[]) => verifySupabaseToken(...args),
  isSupabaseToken: (...args: unknown[]) => isSupabaseToken(...args),
}));
vi.mock('../db/profiles.js', () => ({
  getProfile: (...args: unknown[]) => getProfile(...args),
}));

const { resolveSocketIdentity } = await import('./socketIdentity.js');

beforeEach(() => {
  verifySupabaseToken.mockReset();
  isSupabaseToken.mockReset();
  getProfile.mockReset();
});

describe('resolveSocketIdentity', () => {
  it('rejects when no token is provided', async () => {
    const result = await resolveSocketIdentity(undefined);
    expect(result).toEqual({ ok: false, error: 'Authentication required' });
    expect(verifySupabaseToken).not.toHaveBeenCalled();
  });

  it('rejects when the token is not a recognizable Supabase token', async () => {
    isSupabaseToken.mockReturnValue(false);
    const result = await resolveSocketIdentity('not-a-jwt');
    expect(result).toEqual({ ok: false, error: 'Authentication required' });
    expect(verifySupabaseToken).not.toHaveBeenCalled();
  });

  it('rejects when Supabase verification fails', async () => {
    isSupabaseToken.mockReturnValue(true);
    verifySupabaseToken.mockResolvedValue({
      success: false,
      error: 'Token expired',
    });
    const result = await resolveSocketIdentity('expired-token');
    expect(result).toEqual({ ok: false, error: 'Token expired' });
    expect(getProfile).not.toHaveBeenCalled();
  });

  it('rejects when the user has no profile row', async () => {
    isSupabaseToken.mockReturnValue(true);
    verifySupabaseToken.mockResolvedValue({
      success: true,
      user: { id: 'user-1', email: 'a@b.com' },
    });
    getProfile.mockResolvedValue(null);
    const result = await resolveSocketIdentity('valid-token');
    expect(result).toEqual({ ok: false, error: 'Profile not found' });
  });

  it('resolves userId and displayName for a valid token with a profile', async () => {
    isSupabaseToken.mockReturnValue(true);
    verifySupabaseToken.mockResolvedValue({
      success: true,
      user: { id: 'user-1', email: 'a@b.com' },
    });
    getProfile.mockResolvedValue({
      id: 'user-1',
      display_name: 'zaphod',
      avatar_url: null,
      is_premium: false,
      has_completed_onboarding: true,
      created_at: new Date(),
    });
    const result = await resolveSocketIdentity('valid-token');
    expect(result).toEqual({
      ok: true,
      userId: 'user-1',
      displayName: 'zaphod',
    });
  });
});
