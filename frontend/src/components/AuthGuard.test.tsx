// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';

const signOut = vi.fn().mockResolvedValue({ error: null });
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signOut: () => signOut() } },
}));

const authState: { session: Session | null; loading: boolean } = {
  session: null,
  loading: false,
};
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

const { AuthGuard } = await import('./AuthGuard');

const FAKE_SESSION = { access_token: 'token-abc' } as Session;

/** Renders the guard inside a router so redirects resolve to a visible page. */
function renderGuard(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
        <Route path="/onboarding" element={<div>ONBOARDING PAGE</div>} />
        <Route
          path="*"
          element={
            <AuthGuard>
              <div>PROTECTED CONTENT</div>
            </AuthGuard>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  signOut.mockClear();
  authState.session = null;
  authState.loading = false;
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  // Explicit: RTL only auto-cleans when vitest `globals` is enabled, and this
  // project's config leaves it off, so renders would otherwise stack up.
  cleanup();
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

describe('AuthGuard', () => {
  it('redirects to login when there is no session', async () => {
    authState.session = null;
    renderGuard();
    expect(await screen.findByText('LOGIN PAGE')).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders protected content for an onboarded user', async () => {
    authState.session = FAKE_SESSION;
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        profile: { has_completed_onboarding: true },
      })
    );
    renderGuard();
    expect(await screen.findByText('PROTECTED CONTENT')).toBeDefined();
  });

  it('redirects to onboarding when onboarding is incomplete', async () => {
    authState.session = FAKE_SESSION;
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        profile: { has_completed_onboarding: false },
      })
    );
    renderGuard();
    expect(await screen.findByText('ONBOARDING PAGE')).toBeDefined();
  });

  it('signs out and redirects to login when the backend rejects the token (401)', async () => {
    authState.session = FAKE_SESSION;
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: 'Authentication required' }, 401)
    );
    renderGuard();

    // Signing out clears the stale session, which is what stops /login from
    // bouncing straight back to / and re-triggering this request forever.
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('LOGIN PAGE')).toBeDefined();
  });

  it('does not sign the user out when the request is rate limited (429)', async () => {
    authState.session = FAKE_SESSION;
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: 'Too Many Requests' }, 429)
    );
    renderGuard();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(await screen.findByText(/couldn't reach/i)).toBeDefined();
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.queryByText('LOGIN PAGE')).toBeNull();
  });

  it('shows an error instead of redirecting when the request fails', async () => {
    authState.session = FAKE_SESSION;
    fetchMock.mockRejectedValue(new Error('network down'));
    renderGuard();

    expect(await screen.findByText(/couldn't reach/i)).toBeDefined();
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.queryByText('LOGIN PAGE')).toBeNull();
  });

  it('requests the profile only once per session rather than looping', async () => {
    authState.session = FAKE_SESSION;
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: 'Authentication required' }, 401)
    );
    renderGuard();

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
