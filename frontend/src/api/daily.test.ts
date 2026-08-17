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
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

const {
  fetchDailyRace,
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
        race_date: '2026-08-16',
      })
    );

    const result = await fetchChallenge('abc1234567');

    expect(result).toEqual({
      displayName: 'Alice',
      rank: 3,
      totalRacers: 20,
      raceDate: '2026-08-16',
    });
  });
});

describe('fetchDailyLeaderboard', () => {
  it('returns [] on HTTP 500', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: 'internal' }, 500)
    );

    const result = await fetchDailyLeaderboard('tok');

    expect(result).toEqual([]);
  });

  it('maps snake_case entries to DailyLeaderboardEntry[]', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        race_date: '2026-08-16',
        entries: [
          {
            user_id: 'u1',
            display_name: 'Bob',
            avatar_url: 'https://img.example.com/bob.png',
            best_ms: 2500,
            rank: 1,
          },
        ],
      })
    );

    const result = await fetchDailyLeaderboard('tok', '2026-08-16');

    expect(result).toEqual([
      {
        rank: 1,
        userId: 'u1',
        displayName: 'Bob',
        avatarUrl: 'https://img.example.com/bob.png',
        bestMs: 2500,
      },
    ]);
  });
});

describe('createDailyShareLink', () => {
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
