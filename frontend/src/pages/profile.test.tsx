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

const STATS = {
  success: true,
  stats: {
    races_played: 12,
    wins: 5,
    win_rate: 5 / 12,
    best_race_ms: 61234,
    tasks_completed: 348,
    avg_task_ms: 4120,
    recent_games: [
      {
        play_mode: 'quick_play',
        position: 1,
        finished: true,
        left_race: false,
        total_time_ms: 61234,
        started_at: '2026-08-08T10:00:00Z',
      },
      {
        play_mode: 'practice',
        position: null,
        finished: false,
        left_race: false,
        total_time_ms: null,
        started_at: '2026-08-07T10:00:00Z',
      },
      {
        play_mode: 'quick_play',
        position: 2,
        finished: true,
        left_race: false,
        total_time_ms: 84000,
        started_at: '2026-08-06T10:00:00Z',
      },
    ],
  },
};

describe('ProfilePage stats', () => {
  it('renders the four stat tiles', async () => {
    stubFetch({ stats: STATS });
    render(<ProfilePage />);
    expect(await screen.findByText('12')).toBeTruthy(); // races
    expect(screen.getByText('5')).toBeTruthy(); // wins
    expect(screen.getByText('42%')).toBeTruthy(); // win rate
    expect(screen.getByText('348')).toBeTruthy(); // tasks
    expect(screen.getByText(/avg 4\.1s/i)).toBeTruthy(); // avg task time
  });

  it('renders recent games with result and time, practice rows unranked', async () => {
    stubFetch({ stats: STATS });
    render(<ProfilePage />);
    expect(await screen.findByText('1st')).toBeTruthy();
    expect(screen.getByText('2nd')).toBeTruthy();
    expect(screen.getByText('1:01.2')).toBeTruthy(); // 61234ms
    expect(screen.getAllByText(/practice/i).length).toBeGreaterThan(0);
  });

  it('degrades to identity-only when the stats fetch fails', async () => {
    stubFetch({ stats: { success: false, error: 'boom' } });
    render(<ProfilePage />);
    expect(await screen.findByText('zaphod')).toBeTruthy();
    expect(screen.queryByText(/win rate/i)).toBeNull();
    expect(screen.queryByText('boom')).toBeNull(); // no error banner
  });
});
