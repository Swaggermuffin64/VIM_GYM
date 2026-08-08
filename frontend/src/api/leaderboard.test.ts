import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Task } from '../types/task';

const { submitPracticeSession } = await import('./leaderboard');

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
