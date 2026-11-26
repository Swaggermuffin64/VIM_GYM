import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const { fetchMe, fetchPlayerStats, saveShowcase } = await import('./profile');

describe('fetchMe', () => {
  it('maps the profile including showcased badges', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        profile: {
          id: 'u1',
          display_name: 'Ada',
          avatar_url: null,
          is_premium: true,
          has_completed_onboarding: true,
          created_at: '2026-01-02T00:00:00Z',
          showcased_badges: ['days_7', 'first_win'],
        },
      })
    );

    const me = await fetchMe('tok');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/user/me');
    expect((init as RequestInit).headers).toEqual({
      Authorization: 'Bearer tok',
    });
    expect(me).toEqual({
      id: 'u1',
      displayName: 'Ada',
      avatarUrl: null,
      isPremium: true,
      createdAt: '2026-01-02T00:00:00Z',
      showcasedBadges: ['days_7', 'first_win'],
    });
  });

  it('defaults showcasedBadges to [] when absent', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        profile: { id: 'u1', display_name: 'Ada', is_premium: false },
      })
    );
    const me = await fetchMe('tok');
    expect(me).toMatchObject({ showcasedBadges: [], avatarUrl: null });
  });

  it('returns the server error on a 404', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: 'Profile not found' }, 404)
    );
    expect(await fetchMe('tok')).toEqual({ error: 'Profile not found' });
  });

  it('returns an error on network failure', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const me = await fetchMe('tok');
    expect(me).toHaveProperty('error');
  });
});

describe('fetchPlayerStats', () => {
  it('maps the snake_case stats body to camelCase', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        stats: {
          races_played: 9,
          avg_race_ms: 40000,
          total_runs: 25,
          multiplayer: { races: 8, wins: 2, win_rate: 25 },
          activity: [{ day: '2026-11-20', runs: 3, multiplayer_wins: 1 }],
          race_time_weekly: [{ week_start: '2026-11-16', avg_ms: 39000 }],
          avg_race_ms_30d: 38000,
          avg_race_ms_prev_30d: null,
          recent_games: [
            {
              play_mode: 'quick_play',
              position: 1,
              finished: true,
              left_race: false,
              total_time_ms: 31000,
              started_at: '2026-11-20T10:00:00Z',
            },
          ],
        },
      })
    );

    const stats = await fetchPlayerStats('tok');

    expect(stats).toEqual({
      totalRuns: 25,
      avgRaceMs: 40000,
      avgRaceMs30d: 38000,
      avgRaceMsPrev30d: null,
      multiplayer: { races: 8, wins: 2, winRate: 25 },
      activity: [{ day: '2026-11-20', runs: 3, multiplayerWins: 1 }],
      raceTimeWeekly: [{ weekStart: '2026-11-16', avgMs: 39000 }],
      recentGames: [
        {
          playMode: 'quick_play',
          position: 1,
          finished: true,
          leftRace: false,
          totalTimeMs: 31000,
          startedAt: '2026-11-20T10:00:00Z',
        },
      ],
    });
  });

  it('falls back to empty values when fields are missing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, stats: {} }));
    expect(await fetchPlayerStats('tok')).toEqual({
      totalRuns: 0,
      avgRaceMs: null,
      avgRaceMs30d: null,
      avgRaceMsPrev30d: null,
      multiplayer: { races: 0, wins: 0, winRate: 0 },
      activity: [],
      raceTimeWeekly: [],
      recentGames: [],
    });
  });

  it('returns null when success is false', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false }));
    expect(await fetchPlayerStats('tok')).toBeNull();
  });

  it('returns null on an HTTP error or network failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false }, 500));
    expect(await fetchPlayerStats('tok')).toBeNull();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await fetchPlayerStats('tok')).toBeNull();
  });
});

describe('saveShowcase', () => {
  it('posts the ids and returns what the server saved', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, showcased_badges: ['days_7'] })
    );

    const result = await saveShowcase('tok', ['days_7']);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/user/showcase');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      showcased_badges: ['days_7'],
    });
    expect(result).toEqual({ ok: true, ids: ['days_7'] });
  });

  it('surfaces the server error on a 400', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: 'Unknown badge' }, 400)
    );
    expect(await saveShowcase('tok', ['nope'])).toEqual({
      ok: false,
      error: 'Unknown badge',
    });
  });

  it('returns an error on network failure', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const result = await saveShowcase('tok', []);
    expect(result.ok).toBe(false);
  });
});
