// @vitest-environment jsdom
/**
 * Tests for the ProfilePage identity header: display name rendering,
 * inline editing flow, premium badge, and member-since date.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';

const authState = { session: { access_token: 'tok' } as Session };
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }));

const ProfilePage = (await import('./profile')).default;

const PROFILE = {
  id: 'u1',
  display_name: 'zaphod',
  avatar_url: null,
  is_premium: true,
  has_completed_onboarding: true,
  created_at: '2026-05-15T12:00:00Z',
};

/** fetch stub keyed by URL substring; posts recorded for assertions. */
let posts: Array<{ url: string; body: unknown }>;
function stubFetch(overrides: Record<string, unknown> = {}) {
  posts = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        const override = overrides['POST'];
        return {
          json: async () =>
            override ?? {
              success: true,
              profile: { ...PROFILE, display_name: 'ford' },
            },
        };
      }
      if (url.includes('/api/user/me')) {
        return {
          json: async () =>
            overrides['me'] ?? { success: true, profile: PROFILE },
        };
      }
      if (url.includes('/api/user/stats')) {
        return { json: async () => overrides['stats'] ?? { success: false } };
      }
      throw new Error(`unexpected fetch ${url}`);
    })
  );
}

beforeEach(() => stubFetch());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ProfilePage identity header', () => {
  it('shows name, premium badge, and member-since date', async () => {
    render(<ProfilePage />);
    expect(await screen.findByText('zaphod')).toBeTruthy();
    expect(screen.getByText('Premium')).toBeTruthy();
    expect(screen.getByText(/member since may 2026/i)).toBeTruthy();
    expect(screen.queryByText('u1')).toBeNull(); // raw user id removed
  });

  it('edits the display name via the inline form', async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);
    await user.click(await screen.findByRole('button', { name: /edit name/i }));
    const input = screen.getByRole('textbox', { name: /display name/i });
    await user.clear(input);
    await user.type(input, 'ford');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText('ford')).toBeTruthy();
    expect(posts[0]!.body).toEqual({ display_name: 'ford' });
  });

  it('shows the server validation error and keeps the old name', async () => {
    stubFetch({ POST: { success: false, error: 'Name not allowed' } });
    const user = userEvent.setup();
    render(<ProfilePage />);
    await user.click(await screen.findByRole('button', { name: /edit name/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText('Name not allowed')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /display name/i })).toBeTruthy();
  });
});
