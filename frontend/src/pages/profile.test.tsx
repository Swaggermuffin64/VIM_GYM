// @vitest-environment jsdom
/**
 * Tests for the bento ProfilePage: player card (name editing, premium,
 * member since, showcase, daily strip), the stat tiles, and how the page
 * degrades when stats or daily data fail to load.
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
  showcased_badges: [],
};

const ZERO_STATS = {
  success: true,
  stats: {
    total_runs: 0,
    avg_race_ms: null,
    avg_race_ms_30d: null,
    avg_race_ms_prev_30d: null,
    multiplayer: { races: 0, wins: 0, win_rate: 0 },
    activity: [],
    race_time_weekly: [],
    recent_games: [],
  },
};

const STATS = {
  success: true,
  stats: {
    ...ZERO_STATS.stats,
    total_runs: 12,
    avg_race_ms: 75000,
    multiplayer: { races: 12, wins: 5, win_rate: 5 / 12 },
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
      // Solo daily: completed, but position is always null in solo modes.
      {
        play_mode: 'daily',
        position: null,
        finished: true,
        left_race: false,
        total_time_ms: 17200,
        started_at: '2026-08-05T10:00:00Z',
      },
      {
        play_mode: 'quick_play',
        position: null,
        finished: false,
        left_race: true,
        total_time_ms: null,
        started_at: '2026-08-04T10:00:00Z',
      },
    ],
  },
};

/** A /api/daily/profile body with the given badges and counters. */
function dailyBody(
  badges: Array<{ id: string; earned_on: string }>,
  daysRaced: number
) {
  return {
    badges,
    unseen_badges: [],
    streaks: {
      participation: { current: 0, longest: 0 },
      podium: { current: 0, longest: 0 },
    },
    counters: {
      days_raced: daysRaced,
      speed_wins: 2,
      efficiency_wins: 1,
      podiums: 3,
    },
    personal_bests: {
      best_speed_placing: { rank: 4, racers: 44, race_date: '2026-08-01' },
      best_efficiency_placing: null,
      fastest: null,
      most_efficient: null,
    },
    recent: [],
    win_dates: [],
  };
}

const EMPTY_DAILY = dailyBody([], 0);

/** fetch stub keyed by URL substring; posts recorded for assertions. */
let posts: Array<{ url: string; body: unknown }>;
let fetchedUrls: string[];
interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}
function jsonResponse(body: unknown): FakeResponse {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}
function stubFetch(overrides: Record<string, unknown> = {}) {
  posts = [];
  fetchedUrls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit): Promise<FakeResponse> => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        if (url.includes('/api/user/showcase')) {
          return jsonResponse(
            overrides['showcase'] ?? {
              success: true,
              showcased_badges: (init.body as string).includes('first_win')
                ? ['first_win']
                : [],
            }
          );
        }
        return jsonResponse(
          overrides['POST'] ?? {
            success: true,
            profile: { ...PROFILE, display_name: 'ford' },
          }
        );
      }
      fetchedUrls.push(url);
      if (url.includes('/api/user/me')) {
        return jsonResponse(
          overrides['me'] ?? { success: true, profile: PROFILE }
        );
      }
      if (url.includes('/api/user/stats')) {
        return jsonResponse(overrides['stats'] ?? ZERO_STATS);
      }
      if (url.includes('/api/daily/profile')) {
        const daily = overrides['daily'];
        if (daily === null) {
          return { ...jsonResponse({}), ok: false, status: 500 };
        }
        return jsonResponse(daily ?? EMPTY_DAILY);
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

/** The value shown above a player-card strip label, e.g. "Total runs". */
function stripValue(label: string): string {
  return screen.getByText(label).parentElement!.firstElementChild!.textContent!;
}

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

describe('ProfilePage loading', () => {
  it('fetches me, stats and daily profile exactly once each', async () => {
    render(<ProfilePage />);
    await screen.findByText('zaphod');
    await screen.findByText('Trophy case');
    const count = (part: string) =>
      fetchedUrls.filter((u) => u.includes(part)).length;
    expect(count('/api/user/me')).toBe(1);
    expect(count('/api/user/stats')).toBe(1);
    expect(count('/api/daily/profile')).toBe(1);
  });

  it('shows the branded loading spinner until the profile arrives', async () => {
    render(<ProfilePage />);
    expect(screen.getByTestId('branded-loading-spinner')).toBeTruthy();
    await screen.findByText('zaphod');
    expect(screen.queryByTestId('branded-loading-spinner')).toBeNull();
  });

  it('shows the identity error when /me fails', async () => {
    stubFetch({ me: { success: false, error: 'Nope' } });
    render(<ProfilePage />);
    expect(await screen.findByText('Nope')).toBeTruthy();
  });
});

describe('ProfilePage player card', () => {
  it('shows no avatar, even when the profile has an avatar url', async () => {
    stubFetch({
      me: {
        success: true,
        profile: { ...PROFILE, avatar_url: 'https://example.com/a.png' },
      },
    });
    const { container } = render(<ProfilePage />);
    await screen.findByText('zaphod');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByText('Z')).toBeNull();
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

  it('shows the server validation error and keeps the editor open', async () => {
    stubFetch({ POST: { success: false, error: 'Name not allowed' } });
    const user = userEvent.setup();
    render(<ProfilePage />);
    await user.click(await screen.findByRole('button', { name: /edit name/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText('Name not allowed')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /display name/i })).toBeTruthy();
  });
});

describe('ProfilePage daily strip', () => {
  it('shows days raced, daily wins, best finish as rank/racers, and total runs', async () => {
    stubFetch({ stats: STATS, daily: dailyBody([], 41) });
    render(<ProfilePage />);
    await screen.findByText('zaphod');
    await vi.waitFor(() => expect(stripValue('Days raced')).toBe('41'));
    expect(stripValue('Daily wins')).toBe('3'); // speed 2 + efficiency 1
    expect(stripValue('Best finish')).toBe('4/44');
    expect(stripValue('Total runs')).toBe('12');
  });

  it('brand-new user renders zeros and hides multiplayer', async () => {
    render(<ProfilePage />); // zero stats, daysRaced 0
    await screen.findByText('zaphod');
    await screen.findByText('Trophy case');
    expect(stripValue('Total runs')).toBe('0');
    expect(stripValue('Days raced')).toBe('—');
    expect(stripValue('Daily wins')).toBe('—');
    expect(stripValue('Best finish')).toBe('—');
    expect(screen.queryByText(/win rate/i)).toBeNull();
    expect(screen.getByText('/ 9').parentElement!.textContent).toBe('0 / 9');
  });

  it('practice-only player sees total runs and the empty race-of-the-day message', async () => {
    stubFetch({
      stats: { ...ZERO_STATS, stats: { ...ZERO_STATS.stats, total_runs: 12 } },
      daily: dailyBody([], 0), // real practice-only shape: 200 with days_raced 0
    });
    render(<ProfilePage />);
    await screen.findByText('zaphod');
    await vi.waitFor(() => expect(stripValue('Total runs')).toBe('12'));
    expect(stripValue('Days raced')).toBe('—');
    expect(screen.getByText(/finish a race of the day/i)).toBeTruthy();
  });
});

describe('ProfilePage daily fetch failure', () => {
  it('still renders identity and total runs when the daily fetch 500s', async () => {
    stubFetch({
      stats: { ...ZERO_STATS, stats: { ...ZERO_STATS.stats, total_runs: 12 } },
      daily: null,
    });
    render(<ProfilePage />);
    await screen.findByText('zaphod');
    await vi.waitFor(() => expect(stripValue('Total runs')).toBe('12'));
    expect(stripValue('Days raced')).toBe('—');
  });
});

describe('ProfilePage showcase', () => {
  const TWO_BADGES = dailyBody(
    [
      { id: 'first_win', earned_on: '2026-08-02' },
      { id: 'days_7', earned_on: '2026-08-01' },
    ],
    8
  );

  it('falls back to the most recent earned badges when none are showcased', async () => {
    stubFetch({ daily: TWO_BADGES });
    render(<ProfilePage />);
    await screen.findByText('zaphod');
    const row = await screen.findByLabelText('Showcased badges');
    expect(row.textContent).toContain('WIN');
    expect(row.textContent).toContain('DAYS');
  });

  it('hides the showcase row when nothing is earned', async () => {
    render(<ProfilePage />);
    await screen.findByText('zaphod');
    await screen.findByText('Trophy case');
    expect(screen.queryByLabelText('Showcased badges')).toBeNull();
  });

  it('saving showcase posts ids', async () => {
    stubFetch({ daily: TWO_BADGES });
    const user = userEvent.setup();
    render(<ProfilePage />);
    await user.click(await screen.findByRole('button', { name: /showcase/i }));
    // Both earned badges start selected (the fallback); drop Regular.
    await user.click(screen.getByRole('button', { name: /regular/i }));
    await user.click(screen.getByRole('button', { name: /^save showcase$/i }));
    await vi.waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0]!.url).toContain('/api/user/showcase');
    expect(JSON.stringify(posts[0]!.body)).toBe(
      '{"showcased_badges":["first_win"]}'
    );
    // After saving, the row shows only the saved badge.
    await vi.waitFor(() => {
      const row = screen.getByLabelText('Showcased badges');
      expect(row.textContent).toContain('WIN');
      expect(row.textContent).not.toContain('DAYS');
    });
  });
});

describe('ProfilePage stats', () => {
  it('renders multiplayer win rate and avg race time', async () => {
    stubFetch({ stats: STATS });
    render(<ProfilePage />);
    expect(await screen.findByText('42%')).toBeTruthy(); // 5/12
    expect(screen.getByText('1:15.0')).toBeTruthy(); // avg_race_ms 75000
  });

  it('shows a dash for avg race when no session has finished', async () => {
    render(<ProfilePage />);
    const label = await screen.findByText('Avg race time');
    expect(label.closest('div')!.parentElement!.textContent).toContain('—');
  });

  it('drops the retired tiles', async () => {
    stubFetch({ stats: STATS });
    render(<ProfilePage />);
    await screen.findByText('42%');
    expect(screen.queryByText(/best race/i)).toBeNull();
    expect(screen.queryByText('348')).toBeNull();
  });

  it('renders recent games with placing and time', async () => {
    stubFetch({ stats: STATS });
    render(<ProfilePage />);
    // The locked first-win badge in the trophy case also reads "1st".
    expect((await screen.findAllByText('1st')).length).toBeGreaterThan(0);
    expect(screen.getByText('2nd')).toBeTruthy();
    expect(screen.getByText('1:01.2')).toBeTruthy(); // recent-game row time
    expect(screen.getAllByText(/practice/i).length).toBeGreaterThan(0);
  });

  it('lists Race of the Day by day from the daily results, not per attempt', async () => {
    // STATS has a single daily attempt (17.2s) but the daily profile reports
    // no raced days, so there is no daily row to show — attempts never get a
    // row of their own (that is what used to leave placings blank).
    stubFetch({ stats: STATS });
    render(<ProfilePage />);
    await screen.findByText('Recent games');
    expect(screen.queryByText('17.2s')).toBeNull();
    expect(
      screen.queryByText('Race of the Day', { selector: 'span' })
    ).toBeNull();
  });

  it('shows abandoned runs without a DNF or left label', async () => {
    stubFetch({ stats: STATS });
    render(<ProfilePage />);
    await screen.findByText('Recent games');
    expect(screen.queryByText('left')).toBeNull();
    expect(screen.queryByText('DNF')).toBeNull();
  });

  it('stats fetch failure still renders identity', async () => {
    stubFetch({ stats: { success: false, error: 'boom' } });
    render(<ProfilePage />);
    expect(await screen.findByText('zaphod')).toBeTruthy();
    expect(screen.queryByText(/win rate/i)).toBeNull();
    expect(screen.queryByText('boom')).toBeNull(); // no error banner
    expect(screen.getByText('Trophy case')).toBeTruthy();
  });
});
