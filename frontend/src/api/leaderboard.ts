import type { LeaderboardRanks } from '../types/multiplayer';
import type { Task } from '../types/task';
import { TtlCache } from './ttlCache';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
export const LEADERBOARD_TASK_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Main (practice/multiplayer) leaderboard
// ---------------------------------------------------------------------------

/** One row of GET /api/leaderboard, in the backend's wire shape. */
export interface MainLeaderboardEntry {
  id: string;
  play_mode: string;
  duration_ms: number;
  display_name: string | null;
  achieved_at: string;
  has_tasks: boolean;
}

export type MainLeaderboardPlayModeFilter =
  | 'all'
  | 'practice'
  | 'quick_play'
  | 'private_match';

export type MainLeaderboardTimeRange = 'all_time' | 'week' | 'month';

export type FetchMainLeaderboardResult =
  | {
      status: 'ok';
      entries: MainLeaderboardEntry[];
      databaseConfigured: boolean;
    }
  | { status: 'error'; message: string };

/**
 * Recently fetched leaderboard slices, keyed by limit+filter+range. The board
 * only moves when someone records a run, so a short TTL keeps navigating back
 * to the home page from re-querying while still picking up other players'
 * runs within a minute. The user's own submissions invalidate it immediately.
 */
const mainLeaderboardCache = new TtlCache<
  Extract<FetchMainLeaderboardResult, { status: 'ok' }>
>(60_000);

/**
 * Forget all cached leaderboard slices. Called automatically when the user
 * records a practice session; exported for tests.
 */
export function invalidateMainLeaderboardCache(): void {
  mainLeaderboardCache.clear();
}

/**
 * Fetch a slice of the main leaderboard, serving repeats of the same slice
 * from a 60-second in-memory cache. Error responses are not cached.
 */
export async function fetchMainLeaderboard(
  limit: number,
  playMode: MainLeaderboardPlayModeFilter,
  timeRange: MainLeaderboardTimeRange
): Promise<FetchMainLeaderboardResult> {
  const cacheKey = `${limit}|${playMode}|${timeRange}`;
  const cached = mainLeaderboardCache.get(cacheKey);
  if (cached) return cached;

  try {
    const q = new URLSearchParams({
      limit: String(limit),
      play_mode: playMode,
      time_range: timeRange,
    });
    const res = await fetch(`${API_BASE}/api/leaderboard?${q}`);
    const data = (await res.json()) as {
      success?: boolean;
      error?: string;
      entries?: MainLeaderboardEntry[];
      databaseConfigured?: boolean;
    };
    if (!res.ok || !data.success) {
      return {
        status: 'error',
        message: data.error || `Failed to load (${res.status})`,
      };
    }
    const result = {
      status: 'ok' as const,
      entries: data.entries ?? [],
      databaseConfigured: data.databaseConfigured !== false,
    };
    mainLeaderboardCache.set(cacheKey, result);
    return result;
  } catch (e) {
    return {
      status: 'error',
      message: e instanceof Error ? e.message : 'Network error',
    };
  }
}

// ---------------------------------------------------------------------------
// Practice session submission
// ---------------------------------------------------------------------------

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
    // The new run may appear on the board, so cached slices are stale.
    invalidateMainLeaderboardCache();
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
