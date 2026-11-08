/**
 * Daily Race API routes (Fastify plugin).
 *
 * Provides HTTP endpoints for the "Race of the Day" feature: fetching today's
 * race and tasks, starting/completing attempts (capped at 3 per day),
 * viewing the speed and efficiency leaderboards, the user's daily badges and
 * placing history, and generating shareable result links.
 *
 * All endpoints require Supabase authentication. Handler logic stays thin:
 * persistence is delegated to `db/daily.ts`, timing validation to
 * `validation/practiceTiming.ts`, and game session bookkeeping to `db/stats.ts`.
 * Daily completions are intentionally excluded from `leaderboard_runs` to keep
 * the global practice board isolated from daily results.
 */
import type { FastifyInstance } from 'fastify';
import {
  requireSupabaseAuth,
  tryResolveSupabaseUser,
} from '../auth/httpAuth.js';
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
  queryDailyLastPlace,
  countDailyRacers,
  queryDailyPlacing,
  getOrCreateShareLink,
} from '../db/daily.js';
import {
  queryEfficiencyBoard,
  queryDailyHistory,
  getSeenBadges,
  addSeenBadges,
} from '../db/dailyResults.js';
import {
  chipsByUser,
  isBadgeId,
  summarizeDailyHistory,
  type EarnedBadge,
  type Placing,
} from '../daily/badges.js';

/** Rows returned by GET /api/daily/leaderboard when no limit is given. */
const DEFAULT_LEADERBOARD_LIMIT = 30;

/**
 * Most rows GET /api/daily/leaderboard will return. High enough for the
 * daily page's full-leaderboard dialog to fetch the whole field in one request.
 */
const MAX_LEADERBOARD_LIMIT = 1000;

/**
 * Drop the optimal-solution fields from a task before it goes over the wire.
 * The daily is a competitive race, and anything in this response is readable
 * in the browser's network tab — shipping the recommended key sequence would
 * hand out the answer. (This also means daily races have no in-race hint;
 * that is deliberate.) The stored race keeps the full tasks: task hashing and
 * completion validation are all server-side.
 */
function withoutSolutionHints<
  T extends { recommendedSequence?: unknown; recommendedWeight?: unknown },
>(task: T): Omit<T, 'recommendedSequence' | 'recommendedWeight'> {
  const { recommendedSequence, recommendedWeight, ...rest } = task;
  void recommendedSequence;
  void recommendedWeight;
  return rest;
}

/** One leaderboard row before wire mapping, from either board. */
interface BoardRow {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** Speed board: the racer's best time. Efficiency board: that attempt's time. */
  bestMs: number;
  rank: number;
  /** Efficiency board only, 0..1. */
  efficiency?: number;
  /** Efficiency board only: that attempt's optimal and actual key totals. */
  optimalKeys?: number;
  actualKeys?: number;
}

/** The rows one leaderboard response shows: top slice plus extras. */
interface BoardSlice {
  entries: BoardRow[];
  /** The viewer's rank±1 rows when they fall outside `entries`. */
  neighborhood: BoardRow[] | null;
  /** The last-ranked racer when the field runs past `entries`. */
  lastPlace: BoardRow | null;
  totalRacers: number;
}

/** The speed board's slice, from the per-view queries in db/daily.ts. */
async function speedBoardSlice(
  raceDate: string,
  limit: number,
  userId: string | null
): Promise<BoardSlice> {
  const entries = await queryDailyLeaderboard(raceDate, limit);
  const totalRacers = await countDailyRacers(raceDate);

  // The user's rank+-1 rows, so a mid-pack racer still sees themself
  // (and their rival) when they fall outside the top entries.
  const userInTop = !userId || entries.some((e) => e.userId === userId);
  const neighborhood = userInTop
    ? null
    : await queryDailyNeighborhood(userId, raceDate);

  // The slowest racer, so the client can close a top-N list with last
  // place. Redundant when the entries already reach the end of the field.
  const lastPlace =
    totalRacers > entries.length ? await queryDailyLastPlace(raceDate) : null;

  return { entries, neighborhood, lastPlace, totalRacers };
}

/** Most rows a neighborhood can hold (rank ties can widen rank±1). */
const NEIGHBORHOOD_MAX_ROWS = 5;

/**
 * The efficiency board's slice. The whole field comes back in one query, so
 * the same three views the speed board queries separately are cut from it.
 */
async function efficiencyBoardSlice(
  raceDate: string,
  limit: number,
  userId: string | null
): Promise<BoardSlice> {
  const field = (await queryEfficiencyBoard(raceDate)).map(
    (r): BoardRow => ({
      userId: r.userId,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      bestMs: r.durationMs,
      rank: r.rank,
      efficiency: r.efficiency,
      optimalKeys: r.optimalKeys,
      actualKeys: r.actualKeys,
    })
  );
  const entries = field.slice(0, limit);

  let neighborhood: BoardRow[] | null = null;
  const own = userId ? field.find((r) => r.userId === userId) : undefined;
  if (own && !entries.includes(own)) {
    neighborhood = field
      .filter((r) => Math.abs(r.rank - own.rank) <= 1)
      .slice(0, NEIGHBORHOOD_MAX_ROWS);
  }

  // Matches queryDailyLastPlace: among racers tied for last, the lowest id.
  const lastRank = field[field.length - 1]?.rank;
  const lastPlace =
    field.length > entries.length
      ? field.find((r) => r.rank === lastRank)!
      : null;

  return { entries, neighborhood, lastPlace, totalRacers: field.length };
}

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
  // Public: the page is a landing target for share links, so visitors see
  // today's race and the board before signing in. Without a token the
  // response carries no attempts (a visitor has none); starting one still
  // requires auth.
  fastify.get('/api/daily', async (request, reply) => {
    const user = await tryResolveSupabaseUser(request);

    const raceDate = utcDateKey(new Date());
    const race = await getOrCreateDailyRace(raceDate, pickTasksFromCache);
    if (!race) {
      return reply
        .status(503)
        .send({ success: false, error: 'daily_unavailable' });
    }

    // A slot is spent once a playable game was handed out for it, even if the
    // race was abandoned (forfeit) — otherwise exiting mid-race would grant a
    // free restart with a fresh timer. Slots with no game attached are failed
    // starts (server error, lost response before attach): the start route
    // reuses them, so they are neither shown to the client nor counted.
    const attempts = user ? await getDailyAttempts(user.id, raceDate) : [];
    const spent = attempts.filter(
      (a) => a.gameId !== null || a.durationMs !== null
    );
    const finished = spent.filter((a) => a.durationMs !== null);
    const bestMs =
      finished.length > 0
        ? Math.min(...finished.map((a) => a.durationMs as number))
        : null;

    return {
      success: true,
      race_date: raceDate,
      tasks: race.tasks.map(withoutSolutionHints),
      num_tasks: race.tasks.length,
      // Forfeited attempts appear with a null duration so the client can show
      // the slot as used.
      attempts: spent.map((a) => ({
        attempt_number: a.attemptNumber,
        duration_ms: a.durationMs,
        completed_at: a.completedAt,
      })),
      attempts_remaining: MAX_DAILY_ATTEMPTS - spent.length,
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

    // Reuse a slot that never received a game (server error or lost response
    // during a previous start) before burning a fresh one. Slots that did get
    // a game are spent even without a finish time: abandoning a race mid-run
    // forfeits the attempt, so exiting early can't buy a free restart with a
    // fresh timer.
    const attempts = await getDailyAttempts(user.id, raceDate);
    const unraced = attempts.find(
      (a) => a.durationMs === null && a.gameId === null
    );

    let attemptNumber: number;
    if (unraced) {
      attemptNumber = unraced.attemptNumber;
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

    // A response with no playable game is not a success: fail loudly so the
    // client can retry (the claimed slot is reusable, so nothing is burned).
    if (gameId === null) {
      return reply
        .status(500)
        .send({ success: false, error: 'game_creation_failed' });
    }

    const attached = await attachGameToDailyAttempt({
      userId: user.id,
      raceDate,
      attemptNumber,
      gameId,
    });
    if (!attached) {
      // An unattached game can never be completed (completeDailyAttempt
      // matches on game_id), so handing it out would strand the run.
      return reply.status(500).send({ success: false, error: 'attach_failed' });
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
      // GET /api/daily, every slot that received a game counts against the
      // cap (finished or forfeited); only never-attached slots are free.
      const placing = await queryDailyPlacing(user.id, completed.raceDate);
      const attempts = await getDailyAttempts(user.id, completed.raceDate);
      const spentCount = attempts.filter(
        (a) => a.gameId !== null || a.durationMs !== null
      ).length;

      return {
        success: true,
        attempt_duration_ms: Math.round(duration_ms),
        best_ms: placing?.bestMs ?? Math.round(duration_ms),
        rank: placing?.rank ?? 1,
        total_racers: placing?.totalRacers ?? 1,
        attempts_remaining: MAX_DAILY_ATTEMPTS - spentCount,
      };
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/daily/leaderboard — top finishers for a given date
  // -------------------------------------------------------------------------
  // `board=speed` (default) ranks each racer's best time; `board=efficiency`
  // ranks each racer's most keystroke-efficient attempt (db/dailyResults.ts).
  // The board only picks the order: every row carries both the racer's best
  // time and their most efficient attempt (efficiency, key totals, and that
  // attempt's time), plus their badge chips (streak, podium streak, wins).
  fastify.get<{
    Querystring: { date?: string; limit?: string; board?: string };
  }>('/api/daily/leaderboard', async (request, reply) => {
    // Public for the same reason as GET /api/daily. The neighborhood rows
    // are the one per-user part, and a visitor simply has none.
    const user = await tryResolveSupabaseUser(request);

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

    const board = request.query.board ?? 'speed';
    if (board !== 'speed' && board !== 'efficiency') {
      return reply.status(400).send({ success: false, error: 'invalid_board' });
    }

    const limitRaw =
      request.query.limit !== undefined
        ? Number(request.query.limit)
        : DEFAULT_LEADERBOARD_LIMIT;
    const limit = Math.max(
      1,
      Math.min(
        MAX_LEADERBOARD_LIMIT,
        Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LEADERBOARD_LIMIT
      )
    );

    const slice =
      board === 'speed'
        ? await speedBoardSlice(raceDate, limit, user?.id ?? null)
        : await efficiencyBoardSlice(raceDate, limit, user?.id ?? null);

    // Chips are computed only for the racers on the returned rows.
    const shown = [
      ...slice.entries,
      ...(slice.neighborhood ?? []),
      ...(slice.lastPlace ? [slice.lastPlace] : []),
    ];
    const history = await queryDailyHistory([
      ...new Set(shown.map((e) => e.userId)),
    ]);
    const chips = chipsByUser(history, utcDateKey(new Date()));
    // Each shown racer's result for this race: fills in the metric the
    // board's own query doesn't carry.
    const dayResult = new Map(
      history.filter((d) => d.raceDate === raceDate).map((d) => [d.userId, d])
    );

    const toWire = (e: BoardRow) => {
      const c = chips.get(e.userId);
      const day = dayResult.get(e.userId);
      // On the efficiency board e.bestMs is the efficient attempt's time.
      const effMs = e.efficiency !== undefined ? e.bestMs : null;
      return {
        user_id: e.userId,
        display_name: e.displayName,
        avatar_url: e.avatarUrl,
        best_ms: day?.bestMs ?? e.bestMs,
        rank: e.rank,
        efficiency: e.efficiency ?? day?.efficiency ?? null,
        optimal_keys: e.optimalKeys ?? day?.optimalKeys ?? null,
        actual_keys: e.actualKeys ?? day?.actualKeys ?? null,
        efficiency_ms: effMs ?? day?.efficiencyMs ?? null,
        badges: c
          ? { streak: c.streak, podium_streak: c.podiumStreak, wins: c.wins }
          : null,
      };
    };

    return {
      success: true,
      race_date: raceDate,
      board,
      total_racers: slice.totalRacers,
      entries: slice.entries.map(toWire),
      neighborhood:
        slice.neighborhood && slice.neighborhood.length > 0
          ? slice.neighborhood.map(toWire)
          : null,
      last_place: slice.lastPlace ? toWire(slice.lastPlace) : null,
    };
  });

  // -------------------------------------------------------------------------
  // GET /api/daily/profile — the user's daily badges, streaks, and placings
  // -------------------------------------------------------------------------
  fastify.get('/api/daily/profile', async (request, reply) => {
    const user = await requireSupabaseAuth(request, reply);
    if (!user) return;

    const [history, seen] = await Promise.all([
      queryDailyHistory([user.id]),
      getSeenBadges(user.id),
    ]);
    const summary = summarizeDailyHistory(history, utcDateKey(new Date()));
    // Unknown seen state (db error) shows nothing as new rather than
    // re-announcing every badge.
    const unseen =
      seen === null ? [] : summary.badges.filter((b) => !seen.includes(b.id));

    const badgeToWire = (b: EarnedBadge) => ({
      id: b.id,
      earned_on: b.earnedOn,
    });
    const placingToWire = (p: Placing | null) =>
      p ? { rank: p.rank, racers: p.racers, race_date: p.raceDate } : null;
    const { personalBests: pb, streaks, counters } = summary;

    return {
      success: true,
      badges: summary.badges.map(badgeToWire),
      unseen_badges: unseen.map(badgeToWire),
      streaks: {
        participation: streaks.participation,
        podium: streaks.podium,
      },
      counters: {
        days_raced: counters.daysRaced,
        speed_wins: counters.speedWins,
        efficiency_wins: counters.efficiencyWins,
        podiums: counters.podiums,
      },
      personal_bests: {
        best_speed_placing: placingToWire(pb.bestSpeedPlacing),
        best_efficiency_placing: placingToWire(pb.bestEfficiencyPlacing),
        fastest: pb.fastest
          ? { ms: pb.fastest.ms, race_date: pb.fastest.raceDate }
          : null,
        most_efficient: pb.mostEfficient
          ? {
              efficiency: pb.mostEfficient.efficiency,
              race_date: pb.mostEfficient.raceDate,
            }
          : null,
      },
      recent: summary.recent.map((d) => ({
        race_date: d.raceDate,
        best_ms: d.bestMs,
        speed_rank: d.speedRank,
        racers: d.racers,
        efficiency: d.efficiency,
        efficiency_rank: d.efficiencyRank,
        efficiency_racers: d.efficiencyRacers,
      })),
    };
  });

  // -------------------------------------------------------------------------
  // POST /api/daily/badges/seen — acknowledge badges shown in the toast
  // -------------------------------------------------------------------------
  fastify.post<{ Body: { badge_ids?: unknown } | null }>(
    '/api/daily/badges/seen',
    async (request, reply) => {
      const user = await requireSupabaseAuth(request, reply);
      if (!user) return;

      const ids = request.body?.badge_ids;
      if (!Array.isArray(ids) || ids.length === 0 || !ids.every(isBadgeId)) {
        return reply
          .status(400)
          .send({ success: false, error: 'invalid_badge_ids' });
      }

      const ok = await addSeenBadges(user.id, ids);
      if (!ok) {
        return reply.status(500).send({ success: false, error: 'db_error' });
      }
      return { success: true };
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
