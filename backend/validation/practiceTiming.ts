/**
 * Practice Session Timing Validation
 *
 * Guards the practice leaderboard against forged completion times. The client
 * reports how long a practice run took (`durationMs`), but that value alone is
 * trustless: anyone with a valid account could POST a 1ms time and claim the
 * top of the leaderboard.
 *
 * To harden this, the server anchors every eligible submission to a game
 * session it created itself in `/api/task/practice`, whose `started_at` is a
 * server clock the client cannot influence. This module holds the pure timing
 * rules; the database lookup that supplies `serverStartedAt` lives in the
 * `getPracticeGameForUser` helper in `db/stats.ts`.
 *
 * NOTE: These checks make a fast-time forgery hard (it must ride a real,
 * owned, unfinished session and stay above a plausible per-task floor) but not
 * impossible — a scripted client playing at floor speed could still post a
 * fake-fast time. Closing that fully requires server-side keystroke replay,
 * which is intentionally out of scope here.
 */

/** Minimum plausible wall-clock time a human needs per task, in milliseconds. */
export const MIN_PRACTICE_MS_PER_TASK = 250;

/**
 * Slack added to the server-measured window before rejecting an over-long
 * client duration. Covers clock skew and the network round-trip between the
 * client finishing and the submission arriving.
 */
export const TIMING_NETWORK_TOLERANCE_MS = 5_000;

export type PracticeTimingRejection =
  | 'duration_too_short'
  | 'duration_exceeds_server_window'
  | 'session_already_finished';

export type PracticeTimingResult =
  | { ok: true }
  | { ok: false; reason: PracticeTimingRejection };

/**
 * Decides whether a client-reported practice duration is consistent with the
 * server's own record of when the session started.
 *
 * @param durationMs      Client-reported run length.
 * @param taskCount       Number of tasks in the submitted run.
 * @param serverStartedAt Server timestamp (ms since epoch) from the game session.
 * @param now             Current server time (ms since epoch).
 * @param alreadyFinished Whether this session was already recorded as finished
 *                        (blocks replays and double-submissions).
 */
export function validatePracticeSubmissionTiming(params: {
  durationMs: number;
  taskCount: number;
  serverStartedAt: number;
  now: number;
  alreadyFinished: boolean;
}): PracticeTimingResult {
  const { durationMs, taskCount, serverStartedAt, now, alreadyFinished } =
    params;

  if (alreadyFinished) {
    return { ok: false, reason: 'session_already_finished' };
  }

  const floorMs = MIN_PRACTICE_MS_PER_TASK * Math.max(taskCount, 1);
  if (durationMs < floorMs) {
    return { ok: false, reason: 'duration_too_short' };
  }

  const serverWindowMs = now - serverStartedAt;
  if (durationMs > serverWindowMs + TIMING_NETWORK_TOLERANCE_MS) {
    return { ok: false, reason: 'duration_exceeds_server_window' };
  }

  return { ok: true };
}
