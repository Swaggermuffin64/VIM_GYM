/**
 * GET /api/players/:id — another player's public profile, for the read-only
 * profile page the daily leaderboard links to (/players/:id on the frontend).
 *
 * Signed-in users only. Returns the same stats and daily-history shapes as
 * the viewer's own profile routes (see profileWire.ts), plus the player's
 * name, avatar, showcased badges and join date. Private fields stay out:
 * premium status, onboarding state, and which badges they have seen.
 */
import type { FastifyInstance } from 'fastify';
import { requireSupabaseAuth } from '../auth/httpAuth.js';
import { getProfile } from '../db/profiles.js';
import { getPlayerStats } from '../db/playerStats.js';
import { queryDailyHistory } from '../db/dailyResults.js';
import { summarizeDailyHistory } from '../daily/badges.js';
import { utcDateKey } from '../daily/dailyDate.js';
import { dailySummaryToWire, playerStatsToWire } from './profileWire.js';

/** Supabase user ids are UUIDs; anything else can't be a player. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function registerPlayerRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { id: string } }>(
    '/api/players/:id',
    async (request, reply) => {
      const user = await requireSupabaseAuth(request, reply);
      if (!user) return;

      const { id } = request.params;
      // Checked before querying, so a malformed id is a 404 rather than a
      // Postgres cast error.
      const profile = UUID_PATTERN.test(id) ? await getProfile(id) : null;
      if (!profile) {
        return reply
          .status(404)
          .send({ success: false, error: 'Player not found' });
      }

      const [stats, history] = await Promise.all([
        getPlayerStats(id),
        queryDailyHistory([id]),
      ]);
      const summary = summarizeDailyHistory(history, utcDateKey(new Date()));

      return {
        success: true,
        player: {
          id: profile.id,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          showcased_badges: profile.showcased_badges,
          created_at: profile.created_at,
        },
        stats: playerStatsToWire(stats),
        daily: dailySummaryToWire(summary),
      };
    }
  );
}
