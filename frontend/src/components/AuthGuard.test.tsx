// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import type { Profile, ProfileStatus } from '../contexts/AuthContext';

const authState: {
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  profileStatus: ProfileStatus;
} = {
  session: null,
  loading: false,
  profile: null,
  profileStatus: 'loading',
};
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

const { AuthGuard } = await import('./AuthGuard');

const FAKE_SESSION = { access_token: 'token-abc' } as Session;

const READY_PROFILE: Profile = {
  id: 'u1',
  display_name: 'zaphod',
  avatar_url: null,
  is_premium: false,
  has_completed_onboarding: true,
};

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

beforeEach(() => {
  authState.session = null;
  authState.loading = false;
  authState.profile = null;
  authState.profileStatus = 'loading';
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AuthGuard', () => {
  it('redirects to login when there is no session', async () => {
    authState.session = null;
    authState.profileStatus = 'rejected';
    renderGuard();
    expect(await screen.findByText('LOGIN PAGE')).toBeDefined();
  });

  it('renders protected content for an onboarded user', async () => {
    authState.session = FAKE_SESSION;
    authState.profile = READY_PROFILE;
    authState.profileStatus = 'ready';
    renderGuard();
    expect(await screen.findByText('PROTECTED CONTENT')).toBeDefined();
  });

  it('redirects to onboarding when onboarding is incomplete', async () => {
    authState.session = FAKE_SESSION;
    authState.profile = { ...READY_PROFILE, has_completed_onboarding: false };
    authState.profileStatus = 'ready';
    renderGuard();
    expect(await screen.findByText('ONBOARDING PAGE')).toBeDefined();
  });

  it('redirects to login when the profile fetch was rejected (401)', async () => {
    authState.session = FAKE_SESSION;
    authState.profileStatus = 'rejected';
    renderGuard();
    expect(await screen.findByText('LOGIN PAGE')).toBeDefined();
  });

  it('shows a retry screen when the backend is unreachable', async () => {
    authState.session = FAKE_SESSION;
    authState.profileStatus = 'unreachable';
    renderGuard();
    expect(await screen.findByText(/couldn't reach/i)).toBeDefined();
    expect(screen.queryByText('LOGIN PAGE')).toBeNull();
  });

  it('renders nothing while the profile is loading', () => {
    authState.session = FAKE_SESSION;
    authState.profileStatus = 'loading';
    renderGuard();
    expect(screen.queryByText('PROTECTED CONTENT')).toBeNull();
    expect(screen.queryByText('LOGIN PAGE')).toBeNull();
  });
});
