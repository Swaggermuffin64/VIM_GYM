/**
 * How many top racers the daily page's leaderboard rail shows. Shared with
 * the home page, which pre-fetches the same slice so clicking through to the
 * daily page hits the leaderboard cache instead of waiting on the network.
 */
export const DAILY_RAIL_RACER_COUNT = 3;
