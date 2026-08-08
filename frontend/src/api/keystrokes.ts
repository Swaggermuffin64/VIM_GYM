import type { TaskKeystrokeSubmission } from '../types/keystroke';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

/**
 * Submit a completed task's keystrokes to the backend.
 *
 * Always records to the server's in-memory replay store. When an access token
 * is provided the backend ALSO persists the attempt to the stats tables —
 * without the Authorization header the request counts as anonymous and stats
 * are silently skipped, so callers with a signed-in session must pass it.
 *
 * Fire-and-forget: failures are logged, never thrown — keystroke telemetry
 * must not disrupt gameplay.
 */
export async function submitTaskKeystrokes(params: {
  payload: TaskKeystrokeSubmission;
  accessToken?: string | null;
  /** Stats session id (games.id); omit when unknown (e.g. multiplayer, replays). */
  gameId?: number | null;
  /** The task's content hash; required for the attempt to be persisted. */
  taskHash?: string;
}): Promise<void> {
  const { payload, accessToken, gameId, taskHash } = params;
  try {
    await fetch(`${API_BASE}/api/task/keystrokes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        ...payload,
        ...(gameId != null ? { gameId } : {}),
        ...(taskHash ? { taskHash } : {}),
      }),
    });
  } catch (error) {
    console.error('Failed to submit task keystrokes:', error);
  }
}
