// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';

const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const signOut = vi.fn().mockResolvedValue({ error: null });

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      onAuthStateChange: (...args: unknown[]) => onAuthStateChange(...args),
      signOut: () => signOut(),
    },
  },
}));

const { AuthProvider, useAuth } = await import('./AuthContext');

const FAKE_SESSION = { access_token: 'token-abc' } as Session;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function Probe() {
  const { profile, profileStatus, loading } = useAuth();
  if (loading) return <div>LOADING</div>;
  return (
    <div>
      STATUS:{profileStatus} NAME:{profile?.display_name ?? 'none'}
    </div>
  );
}

let fetchMock: ReturnType<typeof vi.fn>;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  signOut.mockClear();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: () => {} } },
  });
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

describe('AuthProvider profile fetching', () => {
  it('fetches and exposes the profile when a session exists', async () => {
    getSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        profile: {
          id: 'u1',
          display_name: 'zaphod',
          avatar_url: null,
          is_premium: false,
          has_completed_onboarding: true,
        },
      })
    );

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    expect(await screen.findByText('STATUS:ready NAME:zaphod')).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/user/me'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-abc' },
      })
    );
  });

  it('signs out and marks the profile rejected on a 401', async () => {
    getSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: 'Authentication required' }, 401)
    );

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('STATUS:rejected NAME:none')).toBeDefined();
  });

  it('marks the profile unreachable on a network error', async () => {
    getSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    fetchMock.mockRejectedValue(new Error('network down'));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    expect(
      await screen.findByText('STATUS:unreachable NAME:none')
    ).toBeDefined();
    expect(signOut).not.toHaveBeenCalled();
  });

  /**
   * Fires the callback registered with supabase.auth.onAuthStateChange, the
   * way supabase-js does for events like INITIAL_SESSION / TOKEN_REFRESHED.
   * Those events always carry a NEW session object, even for the same user.
   */
  function emitAuthStateChange(event: string, session: Session | null) {
    const callback = onAuthStateChange.mock.calls[0][0] as (
      event: string,
      session: Session | null
    ) => void;
    act(() => callback(event, session));
  }

  it('does not refetch or blank when the same token is re-emitted by onAuthStateChange', async () => {
    getSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        profile: {
          id: 'u1',
          display_name: 'zaphod',
          avatar_url: null,
          is_premium: false,
          has_completed_onboarding: true,
        },
      })
    );

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await screen.findByText('STATUS:ready NAME:zaphod');

    // Same token, new object reference — supabase re-emits sessions like this
    emitAuthStateChange('INITIAL_SESSION', {
      access_token: 'token-abc',
    } as Session);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('STATUS:ready NAME:zaphod')).toBeDefined();
  });

  it('keeps the ready profile visible while refetching after a token refresh', async () => {
    getSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        profile: {
          id: 'u1',
          display_name: 'zaphod',
          avatar_url: null,
          is_premium: false,
          has_completed_onboarding: true,
        },
      })
    );

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await screen.findByText('STATUS:ready NAME:zaphod');

    // Refresh fetch stays in flight — the old profile must remain visible
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    emitAuthStateChange('TOKEN_REFRESHED', {
      access_token: 'token-refreshed',
    } as Session);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/user/me'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-refreshed' },
      })
    );
    expect(screen.getByText('STATUS:ready NAME:zaphod')).toBeDefined();
  });

  it('does not fetch a profile when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    expect(await screen.findByText('STATUS:rejected NAME:none')).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
