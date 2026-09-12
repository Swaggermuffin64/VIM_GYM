/**
 * HTTP client for the Race of the Day endpoints (backend/routes/daily.ts and share.ts).
 *
 * Every function is reject-proof: network and HTTP errors are caught and
 * returned as an error-shaped value (never thrown). Response keys are mapped
 * from the backend's snake_case to camelCase for frontend consumption.
 */
import type { Task } from '../types/task';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Summary of today's daily race returned by GET /api/daily. */
export interface DailyRaceInfo {
  raceDate: string;
  tasks: Task[];
  attempts: Array<{ attemptNumber: number; durationMs: number | null }>;
  attemptsRemaining: number;
  bestMs: number | null;
}

export type FetchDailyResult =
  | { status: 'ok'; info: DailyRaceInfo }
  | { status: 'error' };

export type StartAttemptResult =
  | {
      status: 'started';
      raceDate: string;
      attemptNumber: number;
      gameId: number | null;
    }
  | { status: 'out_of_attempts' }
  | { status: 'error' };

/** Placing info returned after completing a daily attempt. */
export interface DailyPlacing {
  rank: number;
  totalRacers: number;
  bestMs: number;
  attemptsRemaining: number;
}

export type CompleteAttemptResult =
  | { status: 'ok'; placing: DailyPlacing }
  | { status: 'error' };

/** A single row in the daily leaderboard. */
export interface DailyLeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bestMs: number;
}

export type ShareLinkResult =
  | { status: 'ok'; url: string }
  | { status: 'error' };

/** Public challenge info shown on the login taunt screen. */
export interface ChallengeInfo {
  displayName: string;
  rank: number;
  totalRacers: number;
  /** The sharer's best finish time for the day, in milliseconds. */
  bestMs: number;
  raceDate: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse response text as JSON defensively. Returns null if parsing fails.
 */
function safeParseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Today's-race cache
// ---------------------------------------------------------------------------

/**
 * Last successful GET /api/daily response. Today's race is fixed for the whole
 * UTC day and only the user's own attempts change it, so callers that just
 * want to display it (the home page) can reuse this instead of refetching on
 * every navigation. Starting or completing an attempt drops it.
 */
let cachedRace: DailyRaceInfo | null = null;

/** Today's date in UTC, in the same YYYY-MM-DD form the server returns. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Today's race, served from memory when it was already fetched today. A cached
 * entry from a previous UTC day is ignored, so the page rolls over on its own
 * without anyone having to clear it.
 */
export async function fetchDailyRaceCached(
  accessToken: string
): Promise<FetchDailyResult> {
  if (cachedRace && cachedRace.raceDate === todayUtc()) {
    return { status: 'ok', info: cachedRace };
  }
  const result = await fetchDailyRace(accessToken);
  if (result.status === 'ok') cachedRace = result.info;
  return result;
}

/**
 * Forget the cached race. Called automatically when an attempt is started or
 * completed; exported for tests and for anywhere that needs a hard refresh.
 */
export function invalidateDailyRaceCache(): void {
  cachedRace = null;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Fetch today's daily race info and the current user's attempts.
 * Maps the backend's snake_case keys to the camelCase DailyRaceInfo shape.
 * Always hits the network — see fetchDailyRaceCached for the display path.
 */
export async function fetchDailyRace(
  accessToken: string
): Promise<FetchDailyResult> {
  try {
    const res = await fetch(`${API_BASE}/api/daily`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const body = safeParseJson(await res.text());

    if (!res.ok || !body || typeof body !== 'object') {
      console.error('[daily] fetchDailyRace HTTP error', res.status, body);
      return { status: 'error' };
    }

    const b = body as Record<string, unknown>;
    const rawAttempts = Array.isArray(b.attempts) ? b.attempts : [];

    return {
      status: 'ok',
      info: {
        raceDate: b.race_date as string,
        tasks: b.tasks as Task[],
        attempts: rawAttempts.map((a: Record<string, unknown>) => ({
          attemptNumber: a.attempt_number as number,
          durationMs: (a.duration_ms as number | null) ?? null,
        })),
        attemptsRemaining: b.attempts_remaining as number,
        bestMs: (b.best_ms as number | null) ?? null,
      },
    };
  } catch (err) {
    console.error('[daily] fetchDailyRace network error:', err);
    return { status: 'error' };
  }
}

/**
 * Claim the next daily attempt slot and create a game session.
 * Returns 'out_of_attempts' when the user has used all 3 daily attempts.
 */
export async function startDailyAttempt(
  accessToken: string
): Promise<StartAttemptResult> {
  // Claiming a slot changes the attempt counts the cache is holding.
  invalidateDailyRaceCache();
  try {
    // No body, so no Content-Type: Fastify 400s (FST_ERR_CTP_EMPTY_JSON_BODY)
    // on an application/json request with an empty body.
    const res = await fetch(`${API_BASE}/api/daily/attempt/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const body = safeParseJson(await res.text());

    if (!res.ok) {
      if (
        body &&
        typeof body === 'object' &&
        (body as Record<string, unknown>).error === 'out_of_attempts'
      ) {
        return { status: 'out_of_attempts' };
      }
      console.error('[daily] startDailyAttempt HTTP error', res.status, body);
      return { status: 'error' };
    }

    const b = body as Record<string, unknown>;
    return {
      status: 'started',
      raceDate: b.race_date as string,
      attemptNumber: b.attempt_number as number,
      gameId: (b.game_id as number | null) ?? null,
    };
  } catch (err) {
    console.error('[daily] startDailyAttempt network error:', err);
    return { status: 'error' };
  }
}

/**
 * Finalize a daily attempt with the game ID and elapsed time.
 * Sends snake_case keys ({ game_id, duration_ms }) in the request body.
 */
export async function completeDailyAttempt(params: {
  accessToken: string;
  gameId: number;
  durationMs: number;
}): Promise<CompleteAttemptResult> {
  // A finished attempt adds a time and spends a slot.
  invalidateDailyRaceCache();
  try {
    const res = await fetch(`${API_BASE}/api/daily/attempt/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify({
        game_id: params.gameId,
        duration_ms: params.durationMs,
      }),
    });

    const body = safeParseJson(await res.text());

    if (!res.ok || !body || typeof body !== 'object') {
      console.error(
        '[daily] completeDailyAttempt HTTP error',
        res.status,
        body
      );
      return { status: 'error' };
    }

    const b = body as Record<string, unknown>;
    return {
      status: 'ok',
      placing: {
        rank: b.rank as number,
        totalRacers: b.total_racers as number,
        bestMs: b.best_ms as number,
        attemptsRemaining: b.attempts_remaining as number,
      },
    };
  } catch (err) {
    console.error('[daily] completeDailyAttempt network error:', err);
    return { status: 'error' };
  }
}

/**
 * Fetch the daily leaderboard for a given date (defaults to today).
 * Returns an empty array on any error.
 */
export interface DailyLeaderboardData {
  entries: DailyLeaderboardEntry[];
  /** The user's rank±1 rows when they fall outside `entries`, else null. */
  neighborhood: DailyLeaderboardEntry[] | null;
  /** Total finishers today — `entries` is only the top slice. */
  totalRacers: number;
}

const EMPTY_LEADERBOARD: DailyLeaderboardData = {
  entries: [],
  neighborhood: null,
  totalRacers: 0,
};

function mapLeaderboardEntries(raw: unknown): DailyLeaderboardEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e: Record<string, unknown>) => ({
    rank: e.rank as number,
    userId: e.user_id as string,
    displayName: e.display_name as string,
    avatarUrl: (e.avatar_url as string | null) ?? null,
    bestMs: e.best_ms as number,
  }));
}

export async function fetchDailyLeaderboard(
  accessToken: string,
  date?: string,
  limit?: number
): Promise<DailyLeaderboardData> {
  try {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (limit !== undefined) params.set('limit', String(limit));
    const query = params.size > 0 ? `?${params.toString()}` : '';
    const res = await fetch(`${API_BASE}/api/daily/leaderboard${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const body = safeParseJson(await res.text());

    if (!res.ok || !body || typeof body !== 'object') {
      console.error(
        '[daily] fetchDailyLeaderboard HTTP error',
        res.status,
        body
      );
      return EMPTY_LEADERBOARD;
    }

    const b = body as Record<string, unknown>;
    const neighborhood = Array.isArray(b.neighborhood)
      ? mapLeaderboardEntries(b.neighborhood)
      : null;

    return {
      entries: mapLeaderboardEntries(b.entries),
      neighborhood,
      totalRacers: typeof b.total_racers === 'number' ? b.total_racers : 0,
    };
  } catch (err) {
    console.error('[daily] fetchDailyLeaderboard network error:', err);
    return EMPTY_LEADERBOARD;
  }
}

/**
 * Generate (or retrieve) a shareable link for a daily result.
 * Requires at least one completed attempt.
 *
 * Pass the raceDate of the race being shared (from DailyRaceInfo) so a race
 * finished just after UTC midnight still shares against the day it was raced
 * on; omitting it lets the server assume "today".
 */
export async function createDailyShareLink(
  accessToken: string,
  raceDate?: string
): Promise<ShareLinkResult> {
  try {
    // Without a raceDate there is no body, so no Content-Type either
    // (see startDailyAttempt).
    const res = await fetch(`${API_BASE}/api/daily/share`, {
      method: 'POST',
      headers: raceDate
        ? {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          }
        : { Authorization: `Bearer ${accessToken}` },
      ...(raceDate ? { body: JSON.stringify({ race_date: raceDate }) } : {}),
    });

    const body = safeParseJson(await res.text());

    if (!res.ok || !body || typeof body !== 'object') {
      console.error(
        '[daily] createDailyShareLink HTTP error',
        res.status,
        body
      );
      return { status: 'error' };
    }

    const b = body as Record<string, unknown>;
    return { status: 'ok', url: b.url as string };
  } catch (err) {
    console.error('[daily] createDailyShareLink network error:', err);
    return { status: 'error' };
  }
}

/**
 * Fetch public challenge info for a share slug (no auth required).
 * Returns null on 404 or any error -- the caller treats null as "not found".
 */
export async function fetchChallenge(
  slug: string
): Promise<ChallengeInfo | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/challenge/${encodeURIComponent(slug)}`
    );

    if (!res.ok) {
      return null;
    }

    const body = safeParseJson(await res.text());

    if (!body || typeof body !== 'object') {
      return null;
    }

    const b = body as Record<string, unknown>;
    return {
      displayName: b.display_name as string,
      rank: b.rank as number,
      totalRacers: b.total_racers as number,
      bestMs: b.best_ms as number,
      raceDate: b.race_date as string,
    };
  } catch {
    return null;
  }
}
