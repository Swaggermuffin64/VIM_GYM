import type { LeaderboardRanks } from '../types/multiplayer';
import type { Task } from '../types/task';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
export const LEADERBOARD_TASK_SCHEMA_VERSION = 1;

export type SubmitPracticeSessionResult =
  | { status: 'recorded'; ranks: LeaderboardRanks | null }
  | { status: 'not_persisted' }
  | { status: 'error' };

/**
 * Submit a finished practice session for leaderboard recording.
 * Requires an authenticated access token — the server derives the
 * player's display name from their profile, not from this request.
 */
export async function submitPracticeSession(params: {
  accessToken: string;
  durationMs: number;
  tasks: Task[];
  gameId?: number | null;
}): Promise<SubmitPracticeSessionResult> {
  try {
    const res = await fetch(`${API_BASE}/api/leaderboard/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify({
        play_mode: 'practice',
        duration_ms: params.durationMs,
        tasks: params.tasks,
        task_schema_version: LEADERBOARD_TASK_SCHEMA_VERSION,
        ...(params.gameId != null ? { game_id: params.gameId } : {}),
      }),
    });

    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    if (!res.ok) {
      console.error(
        '[leaderboard] session record HTTP error',
        res.status,
        body
      );
      return { status: 'error' };
    }

    if (
      body &&
      typeof body === 'object' &&
      'persisted' in body &&
      (body as { persisted?: boolean }).persisted === false
    ) {
      console.warn('[leaderboard] session not persisted', body);
      return { status: 'not_persisted' };
    }

    console.info('[leaderboard] session recorded', body);
    const ranks =
      body && typeof body === 'object' && 'ranks' in body
        ? ((body as { ranks?: LeaderboardRanks }).ranks ?? null)
        : null;
    return { status: 'recorded', ranks };
  } catch (err) {
    console.error('[leaderboard] session record network error:', err);
    return { status: 'error' };
  }
}
