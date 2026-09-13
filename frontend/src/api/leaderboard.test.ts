import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Task } from '../types/task';

const {
  submitPracticeSession,
  fetchMainLeaderboard,
  invalidateMainLeaderboardCache,
} = await import('./leaderboard');

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const TASKS: Task[] = [{ id: 't1', type: 'navigate' } as Task];

let fetchMock: ReturnType<typeof vi.fn>;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  invalidateMainLeaderboardCache();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

describe('submitPracticeSession', () => {
  it('sends an Authorization header with the access token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, ranks: null }));

    await submitPracticeSession({
      accessToken: 'token-abc',
      durationMs: 4200,
      tasks: TASKS,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/leaderboard/session'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-abc',
        }),
      })
    );
  });

  it('does not send a display_name field — the server derives it from the profile', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, ranks: null }));

    await submitPracticeSession({
      accessToken: 'token-abc',
      durationMs: 4200,
      tasks: TASKS,
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.display_name).toBeUndefined();
    expect(body.play_mode).toBe('practice');
    expect(body.duration_ms).toBe(4200);
  });

  it('returns recorded with ranks on success', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        ranks: { weekly: 3, monthly: null, allTime: null },
      })
    );

    const result = await submitPracticeSession({
      accessToken: 'token-abc',
      durationMs: 4200,
      tasks: TASKS,
    });

    expect(result).toEqual({
      status: 'recorded',
      ranks: { weekly: 3, monthly: null, allTime: null },
    });
  });

  it('returns error on a non-ok response (e.g. missing/invalid auth)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: 'Authentication required' }, 401)
    );

    const result = await submitPracticeSession({
      accessToken: 'bad-token',
      durationMs: 4200,
      tasks: TASKS,
    });

    expect(result).toEqual({ status: 'error' });
  });

  it('returns not_persisted when the server reports persisted: false', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, persisted: false })
    );

    const result = await submitPracticeSession({
      accessToken: 'token-abc',
      durationMs: 4200,
      tasks: TASKS,
    });

    expect(result).toEqual({ status: 'not_persisted' });
  });

  it('returns error on a network failure', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const result = await submitPracticeSession({
      accessToken: 'token-abc',
      durationMs: 4200,
      tasks: TASKS,
    });

    expect(result).toEqual({ status: 'error' });
  });

  it('includes game_id in the session payload when provided', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, ranks: null }));

    await submitPracticeSession({
      accessToken: 'token-abc',
      durationMs: 4200,
      tasks: TASKS,
      gameId: 42,
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.game_id).toBe(42);
  });

  it('omits game_id from the session payload when not provided', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, ranks: null }));

    await submitPracticeSession({
      accessToken: 'token-abc',
      durationMs: 4200,
      tasks: TASKS,
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.game_id).toBeUndefined();
  });
});

const ENTRY = {
  id: 'run-1',
  play_mode: 'practice',
  duration_ms: 4200,
  display_name: 'Bob',
  achieved_at: '2026-09-13T00:00:00Z',
  has_tasks: true,
};

describe('fetchMainLeaderboard', () => {
  it('requests the slice as query params and returns entries', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        entries: [ENTRY],
        databaseConfigured: true,
      })
    );

    const result = await fetchMainLeaderboard(5, 'all', 'week');

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('limit=5');
    expect(String(url)).toContain('play_mode=all');
    expect(String(url)).toContain('time_range=week');
    expect(result).toEqual({
      status: 'ok',
      entries: [ENTRY],
      databaseConfigured: true,
    });
  });

  it('serves a repeat call for the same slice from cache', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ success: true, entries: [ENTRY] }))
    );

    const first = await fetchMainLeaderboard(5, 'all', 'all_time');
    const second = await fetchMainLeaderboard(5, 'all', 'all_time');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('fetches again for a different slice', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ success: true, entries: [] }))
    );

    await fetchMainLeaderboard(5, 'all', 'all_time');
    await fetchMainLeaderboard(30, 'all', 'all_time');
    await fetchMainLeaderboard(5, 'all', 'week');

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns an error result without caching it', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, error: 'boom' }, 500)
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, entries: [ENTRY] })
    );

    const first = await fetchMainLeaderboard(5, 'all', 'all_time');
    const second = await fetchMainLeaderboard(5, 'all', 'all_time');

    expect(first.status).toBe('error');
    expect(second.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('is invalidated when a practice session is recorded', async () => {
    // A fresh Response per call — a Response body can only be read once.
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ success: true, entries: [], ranks: null }))
    );

    await fetchMainLeaderboard(5, 'all', 'all_time');
    await submitPracticeSession({
      accessToken: 'tok',
      durationMs: 4200,
      tasks: TASKS,
    });
    await fetchMainLeaderboard(5, 'all', 'all_time');

    // One board fetch, one submission, then a fresh board fetch.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
