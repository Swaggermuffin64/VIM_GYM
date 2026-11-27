/**
 * The JSON shapes (snake_case) the profile page reads, shared by every route
 * that serves profile data: a player's own (GET /api/user/stats and
 * GET /api/daily/profile) and someone else's (GET /api/players/:id). Keeping
 * one mapping means the frontend parses both with the same code.
 */
import type { PlayerStats } from '../db/playerStats.js';
import type { DailySummary, EarnedBadge, Placing } from '../daily/badges.js';

/** A player's racing stats as the profile page's stat tiles read them. */
export function playerStatsToWire(stats: PlayerStats) {
  return {
    races_played: stats.racesPlayed,
    wins: stats.wins,
    win_rate: stats.racesPlayed > 0 ? stats.wins / stats.racesPlayed : 0,
    best_race_ms: stats.bestRaceMs,
    tasks_completed: stats.tasksCompleted,
    avg_task_ms: stats.avgTaskMs,
    avg_race_ms: stats.avgRaceMs,
    avg_task_efficiency: stats.avgTaskEfficiency,
    efficiency_sample: stats.efficiencySample,
    recent_games: stats.recentGames.map((g) => ({
      play_mode: g.playMode,
      position: g.position,
      finished: g.finished,
      left_race: g.leftRace,
      total_time_ms: g.totalTimeMs,
      started_at: g.startedAt,
      efficiency_rank: g.efficiencyRank,
    })),
    total_runs: stats.totalRuns,
    multiplayer: {
      races: stats.multiplayer.races,
      wins: stats.multiplayer.wins,
      win_rate:
        stats.multiplayer.races > 0
          ? stats.multiplayer.wins / stats.multiplayer.races
          : 0,
    },
    activity: stats.activity.map((a) => ({
      day: a.day,
      runs: a.runs,
      multiplayer_wins: a.multiplayerWins,
    })),
    race_time_weekly: stats.raceTimeWeekly.map((w) => ({
      week_start: w.weekStart,
      avg_ms: w.avgMs,
    })),
    avg_race_ms_30d: stats.avgRaceMs30d,
    avg_race_ms_prev_30d: stats.avgRaceMsPrev30d,
  };
}

/** An earned badge and the race date it was earned on. */
export function badgeToWire(b: EarnedBadge) {
  return { id: b.id, earned_on: b.earnedOn };
}

function placingToWire(p: Placing | null) {
  return p ? { rank: p.rank, racers: p.racers, race_date: p.raceDate } : null;
}

/**
 * A player's Race of the Day history: badges, streaks, counters, personal
 * bests, win dates and recent days. Leaves out which badges the player has
 * seen, which only their own route adds.
 */
export function dailySummaryToWire(summary: DailySummary) {
  const { personalBests: pb, streaks, counters } = summary;
  return {
    badges: summary.badges.map(badgeToWire),
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
    win_dates: summary.winDates,
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
}
