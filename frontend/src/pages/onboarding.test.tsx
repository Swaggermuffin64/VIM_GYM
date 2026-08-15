// @vitest-environment jsdom
/**
 * Onboarding flow tests. The critical path: after saving a display name the
 * user lands on home and STAYS there — the shared auth profile must learn
 * has_completed_onboarding=true, or AuthGuard bounces every new user
 * straight back to /onboarding forever.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
} from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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

const { AuthProvider } = await import('../contexts/AuthContext');
const { AuthGuard } = await import('../components/AuthGuard');
const { default: Onboarding } = await import('./onboarding');

const FAKE_SESSION = {
  access_token: 'token-abc',
  user: { id: 'u1', user_metadata: {} },
} as unknown as Session;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  getSession.mockResolvedValue({ data: { session: FAKE_SESSION } });
  onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: () => {} } },
  });
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

function renderApp() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/onboarding']}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/login" element={<div>LOGIN</div>} />
          <Route
            path="/"
            element={
              <AuthGuard>
                <div>HOME</div>
              </AuthGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe('onboarding completion', () => {
  it('lands on home (not back on onboarding) after saving a display name', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/api/user/me')) {
        return jsonResponse({
          success: true,
          profile: {
            id: 'u1',
            display_name: 'placeholder',
            avatar_url: null,
            is_premium: false,
            has_completed_onboarding: false,
          },
        });
      }
      if (
        String(url).endsWith('/api/user/profile') &&
        init?.method === 'POST'
      ) {
        return jsonResponse({
          success: true,
          profile: {
            id: 'u1',
            display_name: 'speedy',
            avatar_url: null,
            is_premium: false,
            has_completed_onboarding: true,
          },
        });
      }
      throw new Error(`unexpected fetch: ${String(url)}`);
    });

    renderApp();
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'speedy' } });
    fireEvent.submit(input.closest('form')!);

    // AuthGuard must see the updated profile; a stale
    // has_completed_onboarding=false would redirect back to /onboarding.
    await waitFor(() => expect(screen.getByText('HOME')).toBeTruthy());
  });

  it('shows the server error and stays on onboarding when the save fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/api/user/me')) {
        return jsonResponse({
          success: true,
          profile: {
            id: 'u1',
            display_name: 'placeholder',
            avatar_url: null,
            is_premium: false,
            has_completed_onboarding: false,
          },
        });
      }
      if (
        String(url).endsWith('/api/user/profile') &&
        init?.method === 'POST'
      ) {
        return jsonResponse(
          {
            success: false,
            error: 'Display name contains inappropriate language',
          },
          400
        );
      }
      throw new Error(`unexpected fetch: ${String(url)}`);
    });

    renderApp();
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'badword' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() =>
      expect(
        screen.getByText('Display name contains inappropriate language')
      ).toBeTruthy()
    );
    expect(screen.queryByText('HOME')).toBeNull();
  });
});
