// @vitest-environment jsdom
/**
 * Tests for the ProfilePage identity header: display name rendering,
 * inline editing flow, premium badge, and member-since date.
 */
import type React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { formatDuration, ordinal } from './profile';

/** Render inside a router so the page's banner links (e.g. home) work. */
function render(ui: React.ReactElement) {
  return rtlRender(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('formatDuration', () => {
  it.each([
    [4120, '4.1s'],
    [59950, '1:00.0'],
    [61234, '1:01.2'],
    [119950, '2:00.0'],
    [500, '0.5s'],
    [0, '0.0s'],
  ])('formatDuration(%i) === "%s"', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
  ])('ordinal(%i) === "%s"', (n, expected) => {
    expect(ordinal(n)).toBe(expected);
  });
});

const applyProfileUpdate = vi.fn();
const authState = {
  session: { access_token: 'tok' } as Session,
  applyProfileUpdate,
};
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

beforeEach(() => {
  stubFetch();
  applyProfileUpdate.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ProfilePage site banner', () => {
  it('shows the site banner with a link back to the home menu', async () => {
    render(<ProfilePage />);
    await screen.findByText('zaphod'); // wait for profile load
    const homeLink = screen.getByRole('link', { name: 'VIM_GYM' });
    expect(homeLink.getAttribute('href')).toBe('/');
  });
});

describe('ProfilePage back button', () => {
  it('renders a Back button that navigates to the home menu', async () => {
    const user = userEvent.setup();
    rtlRender(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/" element={<div>HOME MENU</div>} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText('zaphod'); // wait for profile load
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('HOME MENU')).toBeTruthy();
  });
});

describe('ProfilePage identity header', () => {
  it('does not render an avatar image even when the profile has one', async () => {
    stubFetch({
      me: {
        success: true,
        profile: { ...PROFILE, avatar_url: 'https://example.com/a.png' },
      },
    });
    render(<ProfilePage />);
    await screen.findByText('zaphod'); // wait for profile load
    expect(screen.queryByRole('img')).toBeNull();
  });

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

  it('pushes the saved name into the auth context so the site banner updates', async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);
    await user.click(await screen.findByRole('button', { name: /edit name/i }));
    const input = screen.getByRole('textbox', { name: /display name/i });
    await user.clear(input);
    await user.type(input, 'ford');
    await user.click(screen.getByRole('button', { name: /save/i }));
    await screen.findByText('ford');
    expect(applyProfileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: 'ford' })
    );
  });

  it('does not touch the auth context when the save is rejected', async () => {
    stubFetch({ POST: { success: false, error: 'Name not allowed' } });
    const user = userEvent.setup();
    render(<ProfilePage />);
    await user.click(await screen.findByRole('button', { name: /edit name/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));
    await screen.findByText('Name not allowed');
    expect(applyProfileUpdate).not.toHaveBeenCalled();
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
    avg_race_ms: 75000,
    avg_task_efficiency: 0.87,
    efficiency_sample: 12,
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

  it('renders best race, avg race time, and efficiency tiles', async () => {
    stubFetch({ stats: STATS });
    render(<ProfilePage />);
    expect(await screen.findByText(/best race/i)).toBeTruthy();
    // 61234ms appears as both the best-race tile and a recent-game time
    expect(screen.getAllByText('1:01.2').length).toBe(2);
    expect(screen.getByText('1:15.0')).toBeTruthy(); // avg_race_ms 75000
    expect(screen.getByText('87%')).toBeTruthy(); // efficiency 0.87
  });

  it('hides the efficiency tile below the sample threshold', async () => {
    stubFetch({
      stats: {
        ...STATS,
        stats: { ...STATS.stats, efficiency_sample: 3 },
      },
    });
    render(<ProfilePage />);
    await screen.findByText('12'); // stats loaded
    expect(screen.queryByText('87%')).toBeNull();
  });

  it('hides the efficiency tile when no attempts qualify', async () => {
    stubFetch({
      stats: {
        ...STATS,
        stats: {
          ...STATS.stats,
          avg_task_efficiency: null,
          efficiency_sample: 0,
        },
      },
    });
    render(<ProfilePage />);
    await screen.findByText('12');
    expect(screen.queryByText(/efficiency/i)).toBeNull();
  });

  it('renders recent games with result and time, practice rows unranked', async () => {
    stubFetch({ stats: STATS });
    render(<ProfilePage />);
    expect(await screen.findByText('1st')).toBeTruthy();
    expect(screen.getByText('2nd')).toBeTruthy();
    // 61234ms: recent-game row plus the best-race tile
    expect(screen.getAllByText('1:01.2').length).toBeGreaterThan(0);
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
