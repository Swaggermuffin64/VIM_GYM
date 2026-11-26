/**
 * HTTP client for the profile page's data: the signed-in user's profile
 * (GET /api/user/me), their stats (GET /api/user/stats) and the showcased
 * badge selection (POST /api/user/showcase). Backend routes live in
 * backend/index.ts.
 *
 * Every function is reject-proof: network and HTTP errors are caught and
 * returned as an error-shaped value (never thrown). Response keys are mapped
 * from the backend's snake_case to camelCase, with defaults for missing fields.
 */
import { asRecord, authHeaders, safeParseJson } from './daily';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

/** The signed-in user's profile row. */
export interface Profile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  isPremium: boolean;
  createdAt?: string;
  /** Badge ids the user pinned to their profile, in display order. */
  showcasedBadges: string[];
}

/** One finished-or-abandoned game on the recent-games list (any mode). */
export interface RecentGame {
  playMode: string;
  position: number | null;
  finished: boolean;
  leftRace: boolean;
  totalTimeMs: number | null;
  startedAt: string;
}

/** The numbers behind the profile's stat tiles, charts and calendar. */
export interface PlayerStats {
  /** Runs across every mode (practice, daily, multiplayer). */
  totalRuns: number;
  avgRaceMs: number | null;
  avgRaceMs30d: number | null;
  avgRaceMsPrev30d: number | null;
  /** Multiplayer only (quick play + private match). */
  multiplayer: { races: number; wins: number; winRate: number };
  /** Per UTC day. */
  activity: { day: string; runs: number; multiplayerWins: number }[];
  raceTimeWeekly: { weekStart: string; avgMs: number }[];
  recentGames: RecentGame[];
}

/** `raw` as an array of records; empty for anything else. */
function asRecordArray(raw: unknown): Record<string, unknown>[] {
  return Array.isArray(raw) ? raw.map(asRecord) : [];
}

/** `raw` if it is a number, otherwise null (absent or malformed field). */
function numberOrNull(raw: unknown): number | null {
  return typeof raw === 'number' ? raw : null;
}

/** `raw` if it is a number, otherwise 0 (absent or malformed counter). */
function numberOrZero(raw: unknown): number {
  return typeof raw === 'number' ? raw : 0;
}

/** The string entries of `raw`; empty for anything that is not an array. */
function stringArray(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === 'string')
    : [];
}

/**
 * Fetch the signed-in user's profile. Returns `{ error }` (the server's
 * message when it sent one) on any failure, so the page can show it.
 */
export async function fetchMe(
  accessToken: string
): Promise<Profile | { error: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/user/me`, {
      headers: authHeaders(accessToken),
    });
    const body = asRecord(safeParseJson(await res.text()));
    if (!res.ok || !body.profile) {
      console.error('[profile] fetchMe HTTP error', res.status, body);
      return {
        error: typeof body.error === 'string' ? body.error : 'Request failed',
      };
    }
    const p = asRecord(body.profile);
    return {
      id: p.id as string,
      displayName: p.display_name as string,
      avatarUrl: typeof p.avatar_url === 'string' ? p.avatar_url : null,
      isPremium: p.is_premium === true,
      createdAt: typeof p.created_at === 'string' ? p.created_at : undefined,
      showcasedBadges: stringArray(p.showcased_badges),
    };
  } catch (err) {
    console.error('[profile] fetchMe network error:', err);
    return { error: 'Network error' };
  }
}

/** Fetch the signed-in user's stats. Returns null on any error. */
export async function fetchPlayerStats(
  accessToken: string
): Promise<PlayerStats | null> {
  try {
    const res = await fetch(`${API_BASE}/api/user/stats`, {
      headers: authHeaders(accessToken),
    });
    const body = asRecord(safeParseJson(await res.text()));
    if (!res.ok || body.success !== true || !body.stats) {
      console.error('[profile] fetchPlayerStats HTTP error', res.status, body);
      return null;
    }
    const s = asRecord(body.stats);
    const mp = asRecord(s.multiplayer);
    return {
      totalRuns: numberOrZero(s.total_runs),
      avgRaceMs: numberOrNull(s.avg_race_ms),
      avgRaceMs30d: numberOrNull(s.avg_race_ms_30d),
      avgRaceMsPrev30d: numberOrNull(s.avg_race_ms_prev_30d),
      multiplayer: {
        races: numberOrZero(mp.races),
        wins: numberOrZero(mp.wins),
        winRate: numberOrZero(mp.win_rate),
      },
      activity: asRecordArray(s.activity).map((a) => ({
        day: a.day as string,
        runs: numberOrZero(a.runs),
        multiplayerWins: numberOrZero(a.multiplayer_wins),
      })),
      raceTimeWeekly: asRecordArray(s.race_time_weekly).map((w) => ({
        weekStart: w.week_start as string,
        avgMs: numberOrZero(w.avg_ms),
      })),
      recentGames: asRecordArray(s.recent_games).map((g) => ({
        playMode: g.play_mode as string,
        position: numberOrNull(g.position),
        finished: g.finished === true,
        leftRace: g.left_race === true,
        totalTimeMs: numberOrNull(g.total_time_ms),
        startedAt: g.started_at as string,
      })),
    };
  } catch (err) {
    console.error('[profile] fetchPlayerStats network error:', err);
    return null;
  }
}

/**
 * Save which badges the user showcases on their profile. Resolves with the
 * ids the server stored, or the server's error message on failure.
 */
export async function saveShowcase(
  accessToken: string,
  ids: string[]
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/user/showcase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(accessToken),
      },
      body: JSON.stringify({ showcased_badges: ids }),
    });
    const body = asRecord(safeParseJson(await res.text()));
    if (!res.ok || body.success !== true) {
      console.error('[profile] saveShowcase HTTP error', res.status, body);
      return {
        ok: false,
        error: typeof body.error === 'string' ? body.error : 'Request failed',
      };
    }
    return { ok: true, ids: stringArray(body.showcased_badges) };
  } catch (err) {
    console.error('[profile] saveShowcase network error:', err);
    return { ok: false, error: 'Network error' };
  }
}
