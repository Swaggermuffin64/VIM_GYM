/**
 * Daily Race API routes (Fastify plugin).
 *
 * Provides HTTP endpoints for the "Race of the Day" feature: fetching today's
 * race and tasks, starting/completing attempts (capped at 3 per day),
 * viewing the daily leaderboard, and generating shareable result links.
 *
 * All endpoints require Supabase authentication. Handler logic stays thin:
 * persistence is delegated to `db/daily.ts`, timing validation to
 * `validation/practiceTiming.ts`, and game session bookkeeping to `db/stats.ts`.
 * Daily completions are intentionally excluded from `leaderboard_runs` to keep
 * the global practice board isolated from daily results.
 */
import type { FastifyInstance } from 'fastify';
import { requireSupabaseAuth } from '../auth/httpAuth.js';
import { utcDateKey } from '../daily/dailyDate.js';
import { pickTasksFromCache } from '../taskPool.js';
import { createGameSession, finishGameSession } from '../db/stats.js';
import { validatePracticeSubmissionTiming } from '../validation/practiceTiming.js';
import { SHARE_LINK_BASE_URL } from '../config.js';
import {
  MAX_DAILY_ATTEMPTS,
  getOrCreateDailyRace,
  getDailyAttempts,
  claimDailyAttempt,
  attachGameToDailyAttempt,
  getDailyGameForUser,
  completeDailyAttempt,
  queryDailyLeaderboard,
  queryDailyNeighborhood,
  countDailyRacers,
  queryDailyPlacing,
  getOrCreateShareLink,
} from '../db/daily.js';

/**
 * Registers all `/api/daily/*` routes on the given Fastify instance.
 * Intended to be called via `fastify.register(registerDailyRoutes)` in
 * the server entrypoint before `fastify.listen`.
 */
export async function registerDailyRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /api/daily — today's race info + user's attempts
  // -------------------------------------------------------------------------
  fastify.get('/api/daily', async (request, reply) => {
    const user = await requireSupabaseAuth(request, reply);
    if (!user) return;

    const raceDate = utcDateKey(new Date());
    const race = await getOrCreateDailyRace(raceDate, pickTasksFromCache);
    if (!race) {
      return reply
        .status(503)
        .send({ success: false, error: 'daily_unavailable' });
    }

    // Unfinished rows are claimed-but-never-raced slots (double click, lost
    // response, closed tab). The start route reuses them, so they are neither
    // shown to the client nor counted against the cap.
    const attempts = await getDailyAttempts(user.id, raceDate);
    const finished = attempts.filter((a) => a.durationMs !== null);
    const bestMs =
      finished.length > 0
        ? Math.min(...finished.map((a) => a.durationMs as number))
        : null;

    return {
      success: true,
      race_date: raceDate,
      tasks: race.tasks,
      num_tasks: race.tasks.length,
      attempts: finished.map((a) => ({
        attempt_number: a.attemptNumber,
        duration_ms: a.durationMs,
        completed_at: a.completedAt,
      })),
      attempts_remaining: MAX_DAILY_ATTEMPTS - finished.length,
      best_ms: bestMs,
    };
  });

  // -------------------------------------------------------------------------
  // POST /api/daily/attempt/start — claim next attempt slot + create game
  // -------------------------------------------------------------------------
  fastify.post('/api/daily/attempt/start', async (request, reply) => {
    const user = await requireSupabaseAuth(request, reply);
    if (!user) return;

    const raceDate = utcDateKey(new Date());

    // Ensure the race exists before claiming an attempt.
    const race = await getOrCreateDailyRace(raceDate, pickTasksFromCache);
    if (!race) {
      return reply
        .status(503)
        .send({ success: false, error: 'daily_unavailable' });
    }

    // Reuse a claimed-but-unraced slot (double click, lost response, closed
    // tab) before burning a fresh one. The day's tasks are public via
    // GET /api/daily before any claim, so an abandoned slot grants no preview
    // advantage; attaching a fresh game session below restarts the timing
    // window, which only widens the server-side duration check.
    const attempts = await getDailyAttempts(user.id, raceDate);
    const unfinished = attempts.find((a) => a.durationMs === null);

    let attemptNumber: number;
    if (unfinished) {
      attemptNumber = unfinished.attemptNumber;
    } else {
      const claim = await claimDailyAttempt(user.id, raceDate);
      if (claim.status === 'out_of_attempts') {
        return reply
          .status(403)
          .send({ success: false, error: 'out_of_attempts' });
      }
      if (claim.status === 'error') {
        return reply
          .status(500)
          .send({ success: false, error: 'claim_failed' });
      }
      attemptNumber = claim.attemptNumber;
    }

    const gameId = await createGameSession({
      playMode: 'daily',
      taskHashes: race.taskHashes,
      startedAt: new Date(),
      userIds: [user.id],
    });

    if (gameId !== null) {
      await attachGameToDailyAttempt({
        userId: user.id,
        raceDate,
        attemptNumber,
        gameId,
      });
    }

    return {
      success: true,
      race_date: raceDate,
      attempt_number: attemptNumber,
      game_id: gameId,
      start_time: Date.now(),
    };
  });

  // -------------------------------------------------------------------------
  // POST /api/daily/attempt/complete — finalize an attempt with timing check
  // -------------------------------------------------------------------------
  fastify.post<{ Body: { game_id?: unknown; duration_ms?: unknown } }>(
    '/api/daily/attempt/complete',
    async (request, reply) => {
      const user = await requireSupabaseAuth(request, reply);
      if (!user) return;

      const { game_id, duration_ms } = request.body;

      // Validate body fields.
      if (
        typeof game_id !== 'number' ||
        !Number.isInteger(game_id) ||
        game_id <= 0
      ) {
        return reply
          .status(400)
          .send({ success: false, error: 'invalid_game_id' });
      }
      if (
        typeof duration_ms !== 'number' ||
        !Number.isFinite(duration_ms) ||
        duration_ms < 1
      ) {
        return reply
          .status(400)
          .send({ success: false, error: 'invalid_duration' });
      }

      // Look up the game session for this user.
      const gameSession = await getDailyGameForUser(game_id, user.id);
      if (!gameSession) {
        return reply
          .status(404)
          .send({ success: false, error: 'unknown_game_session' });
      }

      // Server-side timing validation (same validator as practice mode).
      const timing = validatePracticeSubmissionTiming({
        durationMs: duration_ms,
        taskCount: gameSession.taskCount,
        serverStartedAt: gameSession.startedAt.getTime(),
        now: Date.now(),
        alreadyFinished: gameSession.finishedAt !== null,
      });
      if (!timing.ok) {
        return reply.status(400).send({ success: false, error: timing.reason });
      }

      // Mark the daily attempt as complete.
      const completed = await completeDailyAttempt({
        userId: user.id,
        gameId: game_id,
        durationMs: duration_ms,
      });
      if (!completed) {
        return reply
          .status(409)
          .send({ success: false, error: 'attempt_already_completed' });
      }

      // Mark the game session as finished (no leaderboard_runs insert).
      void finishGameSession({
        gameId: game_id,
        finishedAt: new Date(),
        results: [
          {
            userId: user.id,
            position: null,
            totalTimeMs: Math.round(duration_ms),
            finished: true,
            leftRace: false,
          },
        ],
      });

      // Fetch placing and remaining attempts for the response. As in
      // GET /api/daily, unfinished slots are reusable, so only finished
      // attempts count against the cap.
      const placing = await queryDailyPlacing(user.id, completed.raceDate);
      const attempts = await getDailyAttempts(user.id, completed.raceDate);
      const finishedCount = attempts.filter(
        (a) => a.durationMs !== null
      ).length;

      return {
        success: true,
        attempt_duration_ms: Math.round(duration_ms),
        best_ms: placing?.bestMs ?? Math.round(duration_ms),
        rank: placing?.rank ?? 1,
        total_racers: placing?.totalRacers ?? 1,
        attempts_remaining: MAX_DAILY_ATTEMPTS - finishedCount,
      };
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/daily/leaderboard — top finishers for a given date
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: { date?: string; limit?: string } }>(
    '/api/daily/leaderboard',
    async (request, reply) => {
      const user = await requireSupabaseAuth(request, reply);
      if (!user) return;

      const dateParam = request.query.date;
      let raceDate: string;
      if (dateParam !== undefined) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
          return reply
            .status(400)
            .send({ success: false, error: 'invalid_date_format' });
        }
        raceDate = dateParam;
      } else {
        raceDate = utcDateKey(new Date());
      }

      const limitRaw =
        request.query.limit !== undefined ? Number(request.query.limit) : 30;
      const limit = Math.max(
        1,
        Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 30)
      );

      const entries = await queryDailyLeaderboard(raceDate, limit);
      const totalRacers = await countDailyRacers(raceDate);

      // The user's rank+-1 rows, so a mid-pack racer still sees themself
      // (and their rival) when they fall outside the top entries.
      const userInTop = entries.some((e) => e.userId === user.id);
      const neighbors = userInTop
        ? []
        : await queryDailyNeighborhood(user.id, raceDate);

      const toWire = (e: (typeof entries)[number]) => ({
        user_id: e.userId,
        display_name: e.displayName,
        avatar_url: e.avatarUrl,
        best_ms: e.bestMs,
        rank: e.rank,
      });

      return {
        success: true,
        race_date: raceDate,
        total_racers: totalRacers,
        entries: entries.map(toWire),
        neighborhood: neighbors.length > 0 ? neighbors.map(toWire) : null,
      };
    }
  );

  // -------------------------------------------------------------------------
  // POST /api/daily/share — generate or retrieve a shareable result link
  // -------------------------------------------------------------------------
  fastify.post<{ Body: { race_date?: unknown } | null }>(
    '/api/daily/share',
    async (request, reply) => {
      const user = await requireSupabaseAuth(request, reply);
      if (!user) return;

      // The client passes the race_date it is sharing so a race finished just
      // after UTC midnight still shares against the day it was raced on.
      // Omitting it falls back to today (older clients, direct API use).
      const dateParam = request.body?.race_date;
      let raceDate: string;
      if (dateParam !== undefined) {
        if (
          typeof dateParam !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ) {
          return reply
            .status(400)
            .send({ success: false, error: 'invalid_date_format' });
        }
        raceDate = dateParam;
      } else {
        raceDate = utcDateKey(new Date());
      }

      const placing = await queryDailyPlacing(user.id, raceDate);
      if (!placing) {
        return reply
          .status(403)
          .send({ success: false, error: 'no_finished_attempt' });
      }

      const slug = await getOrCreateShareLink(user.id, raceDate);
      if (!slug) {
        return reply
          .status(500)
          .send({ success: false, error: 'share_link_failed' });
      }

      return {
        success: true,
        slug,
        url: `${SHARE_LINK_BASE_URL}/s/${slug}`,
      };
    }
  );
}
