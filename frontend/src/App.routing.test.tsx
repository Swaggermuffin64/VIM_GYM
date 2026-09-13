// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import type { Profile, ProfileStatus } from './contexts/AuthContext';

/* ------------------------------------------------------------------ */
/*  Auth mock — controls what every component sees for session state   */
/* ------------------------------------------------------------------ */

const authState: {
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  profileStatus: ProfileStatus;
} = {
  session: null,
  loading: false,
  profile: null,
  profileStatus: 'ready',
};
vi.mock('./contexts/AuthContext', () => ({ useAuth: () => authState }));

/* ------------------------------------------------------------------ */
/*  Gated page stubs                                                  */
/*                                                                    */
/*  These pages are never the subject of this suite — they live behind */
/*  AuthGuard in App.tsx. Stubbing them avoids transforming their full */
/*  module trees (daily.tsx starts a live countdown, profile.tsx and   */
/*  login.tsx touch the network, PracticeEditor and MultiplayerGame   */
/*  pull in CodeMirror / socket.io). The redirect assertions check    */
/*  window.location.pathname, so stubs do not weaken them.            */
/* ------------------------------------------------------------------ */

vi.mock('./pages/daily', () => ({ default: () => <div>DAILY PAGE</div> }));
vi.mock('./pages/profile', () => ({ default: () => <div>PROFILE PAGE</div> }));
vi.mock('./pages/onboarding', () => ({
  default: () => <div>ONBOARDING PAGE</div>,
}));
vi.mock('./pages/login', () => ({ default: () => <div>LOGIN PAGE</div> }));

// The gated components are heavy (CodeMirror, sockets); stub them so this
// suite tests routing decisions, not editor internals.
vi.mock('./pages/practice/PracticeEditor', () => ({
  default: () => <div>PRACTICE EDITOR</div>,
  RaceSessionPage: () => <div>RACE SESSION</div>,
}));
vi.mock('./pages/multiplayer/MultiplayerGame', () => ({
  default: () => <div>MULTIPLAYER GAME</div>,
}));

// Network-touching utilities used by the public pages.
vi.mock('./components/LeaderboardTable', () => ({
  LeaderboardTable: () => <div>LEADERBOARD</div>,
}));
vi.mock('./api/daily', () => ({
  fetchDailyRaceCached: vi.fn().mockResolvedValue({ status: 'error' }),
  fetchChallenge: vi.fn().mockResolvedValue(null),
  invalidateDailyRaceCache: vi.fn(),
}));

/* ------------------------------------------------------------------ */
/*  Import App after mocks are in place                               */
/* ------------------------------------------------------------------ */

const { default: App } = await import('./App');

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const FAKE_SESSION = { access_token: 'token-abc' } as Session;
const READY_PROFILE: Profile = {
  id: 'u1',
  display_name: 'zaphod',
  avatar_url: null,
  is_premium: false,
  has_completed_onboarding: true,
};

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

beforeEach(() => {
  authState.session = null;
  authState.loading = false;
  authState.profile = null;
  authState.profileStatus = 'ready';
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(cleanup);

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

const PUBLIC_PATHS = ['/', '/about', '/practice', '/multiplayer'];

describe('public routes when logged out', () => {
  it.each(PUBLIC_PATHS)(
    'renders %s without redirecting to login',
    async (path) => {
      renderAt(path);
      await waitFor(() => {
        expect(screen.queryByText(/sign in with google/i)).toBeNull();
      });
      expect(window.location.pathname).toBe(path);
    }
  );

  it('never renders the editor without a session', async () => {
    renderAt('/practice');
    await waitFor(() => {
      expect(screen.queryByText('PRACTICE EDITOR')).toBeNull();
    });
    // The public view must be rendered, not a blank page.
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Practice Vim motions solo',
      })
    ).toBeDefined();
  });

  it('never renders the game without a session', async () => {
    renderAt('/multiplayer');
    await waitFor(() => {
      expect(screen.queryByText('MULTIPLAYER GAME')).toBeNull();
    });
    // The public view must be rendered, not a blank page.
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Race other developers in Vim',
      })
    ).toBeDefined();
  });
});

describe('public routes when logged in', () => {
  beforeEach(() => {
    authState.session = FAKE_SESSION;
    authState.profile = READY_PROFILE;
    authState.profileStatus = 'ready';
  });

  it('renders the editor at /practice', async () => {
    renderAt('/practice');
    expect(await screen.findByText('PRACTICE EDITOR')).toBeDefined();
  });

  it('renders the game at /multiplayer', async () => {
    renderAt('/multiplayer');
    expect(await screen.findByText('MULTIPLAYER GAME')).toBeDefined();
  });
});

// These must behave exactly as they did before the refactor.
describe('gated routes remain gated', () => {
  it.each(['/daily', '/profile'])(
    'redirects %s to /login when logged out',
    async (path) => {
      renderAt(path);
      await waitFor(() => {
        expect(window.location.pathname).toBe('/login');
      });
    }
  );

  it('redirects to onboarding when it is incomplete', async () => {
    authState.session = FAKE_SESSION;
    authState.profile = { ...READY_PROFILE, has_completed_onboarding: false };
    authState.profileStatus = 'ready';
    renderAt('/practice');
    await waitFor(() => {
      expect(window.location.pathname).toBe('/onboarding');
    });
  });

  it('sends a rejected profile back to login', async () => {
    authState.session = FAKE_SESSION;
    authState.profileStatus = 'rejected';
    renderAt('/practice');
    await waitFor(() => {
      expect(window.location.pathname).toBe('/login');
    });
  });
});

// Regression guard: challenge links land on '/' after OAuth and must still be
// forwarded to the daily race. See AuthGuard.tsx and lib/challengeRedirect.
describe('challenge link forwarding', () => {
  it('forwards a signed-in visitor with a stashed slug from / to /daily', async () => {
    const { stashChallengeSlug } = await import('./lib/challengeRedirect');
    stashChallengeSlug('abc1234567');
    authState.session = FAKE_SESSION;
    authState.profile = READY_PROFILE;
    authState.profileStatus = 'ready';
    renderAt('/');
    await waitFor(() => {
      expect(window.location.pathname).toBe('/daily');
    });
  });
});
