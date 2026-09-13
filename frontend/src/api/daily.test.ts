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
  invalidateDailyLeaderboardCache();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

const {
  fetchDailyRace,
  fetchDailyRaceCached,
  getCachedDailyRace,
  invalidateDailyRaceCache,
  invalidateDailyLeaderboardCache,
  startDailyAttempt,
  completeDailyAttempt,
  fetchDailyLeaderboard,
  createDailyShareLink,
  fetchChallenge,
} = await import('./daily');

describe('fetchDailyRace', () => {
  it('maps snake_case response to DailyRaceInfo', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        race_date: '2026-08-16',
        tasks: [{ id: 't1', type: 'navigate' }],
        num_tasks: 1,
        attempts: [
          {
            attempt_number: 1,
            duration_ms: 4200,
            completed_at: '2026-08-16T12:00:00Z',
          },
        ],
        attempts_remaining: 2,
        best_ms: 4200,
      })
    );

    const result = await fetchDailyRace('tok');

    expect(result).toEqual({
      status: 'ok',
      info: {
        raceDate: '2026-08-16',
        tasks: [{ id: 't1', type: 'navigate' }],
        attempts: [{ attemptNumber: 1, durationMs: 4200 }],
        attemptsRemaining: 2,
        bestMs: 4200,
      },
    });
  });

  it('returns error on network failure', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const result = await fetchDailyRace('tok');

    expect(result).toEqual({ status: 'error' });
  });
});

describe('startDailyAttempt', () => {
  // Fastify rejects a Content-Type: application/json request with no body
  // (FST_ERR_CTP_EMPTY_JSON_BODY, 400) before the route handler runs.
  it('sends no Content-Type header since the request has no body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await startDailyAttempt('tok');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(init.headers).not.toHaveProperty('Content-Type');
  });

  it('maps a 403 out_of_attempts body to { status: "out_of_attempts" }', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: 'out_of_attempts' }, 403)
    );

    const result = await startDailyAttempt('tok');

    expect(result).toEqual({ status: 'out_of_attempts' });
  });

  it('returns started with camelCase fields on success', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        race_date: '2026-08-16',
        attempt_number: 2,
        game_id: 99,
        start_time: 1234567890,
      })
    );

    const result = await startDailyAttempt('tok');

    expect(result).toEqual({
      status: 'started',
      raceDate: '2026-08-16',
      attemptNumber: 2,
      gameId: 99,
    });
  });
});

describe('completeDailyAttempt', () => {
  it('sends Authorization header and { game_id, duration_ms } body', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        best_ms: 3000,
        rank: 1,
        total_racers: 5,
        attempts_remaining: 1,
      })
    );

    await completeDailyAttempt({
      accessToken: 'tok-abc',
      gameId: 42,
      durationMs: 3000,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/daily/attempt/complete'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer tok-abc',
        }),
      })
    );

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.game_id).toBe(42);
    expect(body.duration_ms).toBe(3000);
  });

  it('returns ok with placing on success', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        best_ms: 3000,
        rank: 2,
        total_racers: 10,
        attempts_remaining: 1,
      })
    );

    const result = await completeDailyAttempt({
      accessToken: 'tok',
      gameId: 42,
      durationMs: 3000,
    });

    expect(result).toEqual({
      status: 'ok',
      placing: {
        rank: 2,
        totalRacers: 10,
        bestMs: 3000,
        attemptsRemaining: 1,
      },
    });
  });
});

describe('fetchChallenge', () => {
  it('returns null on 404', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: 'not_found' }, 404)
    );

    const result = await fetchChallenge('abc1234567');

    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const result = await fetchChallenge('abc1234567');

    expect(result).toBeNull();
  });

  it('returns ChallengeInfo on success', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        display_name: 'Alice',
        rank: 3,
        total_racers: 20,
        best_ms: 42_500,
        race_date: '2026-08-16',
      })
    );

    const result = await fetchChallenge('abc1234567');

    expect(result).toEqual({
      displayName: 'Alice',
      rank: 3,
      totalRacers: 20,
      bestMs: 42_500,
      raceDate: '2026-08-16',
    });
  });
});

describe('fetchDailyLeaderboard', () => {
  it('returns an empty board on HTTP 500', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: 'internal' }, 500)
    );

    const result = await fetchDailyLeaderboard('tok');

    expect(result).toEqual({ entries: [], neighborhood: null, totalRacers: 0 });
  });

  it('maps snake_case entries, neighborhood, and total_racers', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        race_date: '2026-08-16',
        total_racers: 312,
        entries: [
          {
            user_id: 'u1',
            display_name: 'Bob',
            avatar_url: 'https://img.example.com/bob.png',
            best_ms: 2500,
            rank: 1,
          },
        ],
        neighborhood: [
          {
            user_id: 'me',
            display_name: 'You',
            avatar_url: null,
            best_ms: 9000,
            rank: 47,
          },
        ],
      })
    );

    const result = await fetchDailyLeaderboard('tok', '2026-08-16');

    expect(result).toEqual({
      totalRacers: 312,
      entries: [
        {
          rank: 1,
          userId: 'u1',
          displayName: 'Bob',
          avatarUrl: 'https://img.example.com/bob.png',
          bestMs: 2500,
        },
      ],
      neighborhood: [
        {
          rank: 47,
          userId: 'me',
          displayName: 'You',
          avatarUrl: null,
          bestMs: 9000,
        },
      ],
    });
  });

  it('passes the row limit as a query param', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, entries: [], total_racers: 0 })
    );

    await fetchDailyLeaderboard('tok', undefined, 8);

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('limit=8');
  });

  it('serves a repeat call for the same slice from cache', async () => {
    // A fresh Response per call — a Response body can only be read once.
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({ success: true, entries: [], total_racers: 3 })
      )
    );

    const first = await fetchDailyLeaderboard('tok', '2026-08-16', 8);
    const second = await fetchDailyLeaderboard('tok', '2026-08-16', 8);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('fetches again for a different date or limit', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({ success: true, entries: [], total_racers: 0 })
      )
    );

    await fetchDailyLeaderboard('tok', '2026-08-16', 8);
    await fetchDailyLeaderboard('tok', '2026-08-17', 8);
    await fetchDailyLeaderboard('tok', '2026-08-16', 30);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not cache an error response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, error: 'internal' }, 500)
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, entries: [], total_racers: 5 })
    );

    await fetchDailyLeaderboard('tok');
    const second = await fetchDailyLeaderboard('tok');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(second.totalRacers).toBe(5);
  });

  it('is invalidated when a daily attempt completes', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({ success: true, entries: [], total_racers: 1 })
      )
    );

    await fetchDailyLeaderboard('tok');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        best_ms: 3000,
        rank: 1,
        total_racers: 2,
        attempts_remaining: 1,
      })
    );
    await completeDailyAttempt({
      accessToken: 'tok',
      gameId: 42,
      durationMs: 3000,
    });
    await fetchDailyLeaderboard('tok');

    // One leaderboard fetch, one completion, then a fresh leaderboard fetch.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('createDailyShareLink', () => {
  // Same FST_ERR_CTP_EMPTY_JSON_BODY hazard as startDailyAttempt.
  it('sends no Content-Type header since the request has no body', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, url: 'https://vimgym.app/s/abc' })
    );

    await createDailyShareLink('tok');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(init.headers).not.toHaveProperty('Content-Type');
  });

  // A race finished at 23:59 UTC shared at 00:01 must share against the day
  // it was raced on, so the loaded race's date rides along in the body.
  it('sends the race date in the body when given', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, url: 'https://vimgym.app/s/abc' })
    );

    await createDailyShareLink('tok', '2026-08-15');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers).toHaveProperty('Content-Type', 'application/json');
    expect(JSON.parse(init.body)).toEqual({ race_date: '2026-08-15' });
  });

  it('returns ok with url on success', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        slug: 'abcdef1234',
        url: 'https://vimgym.app/s/abcdef1234',
      })
    );

    const result = await createDailyShareLink('tok');

    expect(result).toEqual({
      status: 'ok',
      url: 'https://vimgym.app/s/abcdef1234',
    });
  });

  it('returns error on non-ok response', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: 'no_finished_attempt' }, 403)
    );

    const result = await createDailyShareLink('tok');

    expect(result).toEqual({ status: 'error' });
  });
});

describe('fetchDailyRaceCached', () => {
  /** A GET /api/daily body for the given UTC race date. */
  function raceBody(raceDate: string) {
    return {
      success: true,
      race_date: raceDate,
      tasks: [],
      attempts: [],
      attempts_remaining: 3,
      best_ms: null,
    };
  }

  const TODAY = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    invalidateDailyRaceCache();
  });

  it('getCachedDailyRace peeks the cache without fetching', async () => {
    expect(getCachedDailyRace()).toBeNull();

    fetchMock.mockResolvedValue(jsonResponse(raceBody(TODAY)));
    await fetchDailyRaceCached('tok');

    expect(getCachedDailyRace()).toEqual(
      expect.objectContaining({ raceDate: TODAY })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    invalidateDailyRaceCache();
    expect(getCachedDailyRace()).toBeNull();
  });

  it('fetches once and serves later reads from memory', async () => {
    fetchMock.mockResolvedValue(jsonResponse(raceBody(TODAY)));

    const first = await fetchDailyRaceCached('tok');
    const second = await fetchDailyRaceCached('tok');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('does not cache a failed request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false }, 500));
    expect(await fetchDailyRaceCached('tok')).toEqual({ status: 'error' });

    fetchMock.mockResolvedValueOnce(jsonResponse(raceBody(TODAY)));
    expect((await fetchDailyRaceCached('tok')).status).toBe('ok');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // Yesterday's race is never today's answer, so a stale entry is ignored
  // without anyone having to clear it at midnight.
  it('ignores an entry cached on an earlier UTC day', async () => {
    fetchMock.mockResolvedValue(jsonResponse(raceBody('2020-01-01')));
    await fetchDailyRaceCached('tok');

    fetchMock.mockResolvedValue(jsonResponse(raceBody(TODAY)));
    const result = await fetchDailyRaceCached('tok');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      status: 'ok',
      info: expect.objectContaining({ raceDate: TODAY }),
    });
  });

  it('refetches after an attempt is started', async () => {
    fetchMock.mockResolvedValue(jsonResponse(raceBody(TODAY)));
    await fetchDailyRaceCached('tok');

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ race_date: TODAY, attempt_number: 1, game_id: 7 })
    );
    await startDailyAttempt('tok');

    fetchMock.mockResolvedValue(jsonResponse(raceBody(TODAY)));
    await fetchDailyRaceCached('tok');

    // initial read + start + post-start read
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('refetches after an attempt is completed', async () => {
    fetchMock.mockResolvedValue(jsonResponse(raceBody(TODAY)));
    await fetchDailyRaceCached('tok');

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        placing: {
          rank: 1,
          total_racers: 1,
          best_ms: 5000,
          attempts_remaining: 2,
        },
      })
    );
    await completeDailyAttempt({
      accessToken: 'tok',
      gameId: 7,
      durationMs: 5000,
    });

    fetchMock.mockResolvedValue(jsonResponse(raceBody(TODAY)));
    await fetchDailyRaceCached('tok');

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
