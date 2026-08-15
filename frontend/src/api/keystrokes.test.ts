import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitTaskKeystrokes } from './keystrokes';
import type { TaskKeystrokeSubmission } from '../types/keystroke';

const payload: TaskKeystrokeSubmission = {
  source: 'practice',
  taskId: 'task-1',
  taskType: 'navigate',
  startedAt: 1000,
  completedAt: 4000,
  events: [
    {
      key: 'j',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      repeat: false,
      dtMs: 0,
    },
  ],
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);
});

function sentBody(): Record<string, unknown> {
  return JSON.parse(
    (fetchMock.mock.calls[0][1] as RequestInit).body as string
  ) as Record<string, unknown>;
}

function sentHeaders(): Record<string, string> {
  return (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<
    string,
    string
  >;
}

describe('submitTaskKeystrokes', () => {
  it('sends the Authorization header when an access token is provided', async () => {
    // Regression: without this header the backend treats the submission as
    // anonymous and silently skips stats persistence.
    await submitTaskKeystrokes({
      payload,
      accessToken: 'token-abc',
      gameId: 7,
      taskHash: 'a'.repeat(64),
    });
    expect(sentHeaders().Authorization).toBe('Bearer token-abc');
  });

  it('omits the Authorization header when signed out', async () => {
    await submitTaskKeystrokes({ payload });
    expect(sentHeaders().Authorization).toBeUndefined();
  });

  it('includes gameId and taskHash only when provided', async () => {
    await submitTaskKeystrokes({
      payload,
      accessToken: 't',
      gameId: 42,
      taskHash: 'b'.repeat(64),
    });
    expect(sentBody().gameId).toBe(42);
    expect(sentBody().taskHash).toBe('b'.repeat(64));
  });

  it('omits gameId and taskHash when absent (replays, multiplayer)', async () => {
    await submitTaskKeystrokes({ payload, accessToken: 't', gameId: null });
    expect(sentBody()).not.toHaveProperty('gameId');
    expect(sentBody()).not.toHaveProperty('taskHash');
  });

  it('never throws on network failure', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(
      submitTaskKeystrokes({ payload, accessToken: 't' })
    ).resolves.toBeUndefined();
  });
});
