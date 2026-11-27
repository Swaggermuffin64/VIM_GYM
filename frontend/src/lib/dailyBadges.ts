/**
 * Display data for Race of the Day badges: the badge catalog (names, the
 * status-line segment each is drawn as, how to earn each, progress toward it)
 * and the leaderboard-row chips.
 *
 * Which badges a user has earned is decided by the server
 * (backend/daily/badges.ts); this module only describes them. Ids here must
 * match BADGE_IDS there.
 */
import type { BadgeChips, DailyProfile } from '../api/daily';
import { colors } from '../theme';

/**
 * What a badge is for; picks its segment colour. 'flawless' is the rare
 * perfect-run badge, drawn with a holographic finish (FLAWLESS_GRADIENT)
 * instead of one flat colour.
 */
export type BadgeKind =
  | 'days'
  | 'streak'
  | 'podium'
  | 'win'
  | 'eff'
  | 'flawless';

export const BADGE_KIND_COLORS: Record<BadgeKind, string> = {
  days: colors.textSecondary,
  streak: colors.warning,
  podium: colors.secondaryLight,
  win: colors.successLight,
  eff: colors.primaryLight,
  // The gradient's middle stop: tints the trophy plaque and glow.
  flawless: '#a78bfa',
};

/**
 * The Flawless badge's holographic foil: cyan through violet to pink, the
 * site's navigate and delete highlight colours meeting in the middle.
 */
export const FLAWLESS_GRADIENT = `linear-gradient(110deg, ${colors.primaryLight} 0%, #a78bfa 50%, ${colors.secondaryLight} 100%)`;

export interface BadgeInfo {
  id: string;
  kind: BadgeKind;
  /** Left segment text, e.g. "STREAK". */
  label: string;
  /** Right segment text, e.g. "30". */
  value: string;
  name: string;
  /** How to earn it, phrased as a goal. */
  goal: string;
  /** Progress toward the badge as [have, need], from the profile counters. */
  progress: (p: DailyProfile) => [number, number];
}

/** Every badge, in display order. */
export const BADGE_CATALOG: BadgeInfo[] = [
  {
    id: 'days_7',
    kind: 'days',
    label: 'DAYS',
    value: '7',
    name: 'Regular',
    goal: 'Race 7 days',
    progress: (p) => [p.counters.daysRaced, 7],
  },
  {
    id: 'days_30',
    kind: 'days',
    label: 'DAYS',
    value: '30',
    name: 'Devoted',
    goal: 'Race 30 days',
    progress: (p) => [p.counters.daysRaced, 30],
  },
  {
    id: 'days_100',
    kind: 'days',
    label: 'DAYS',
    value: '100',
    name: 'Centurion',
    goal: 'Race 100 days',
    progress: (p) => [p.counters.daysRaced, 100],
  },
  {
    id: 'streak_7',
    kind: 'streak',
    label: 'STREAK',
    value: '7',
    name: 'On Fire',
    goal: 'Race 7 days in a row',
    progress: (p) => [p.streaks.participation.longest, 7],
  },
  {
    id: 'streak_30',
    kind: 'streak',
    label: 'STREAK',
    value: '30',
    name: 'Unstoppable',
    goal: 'Race 30 days in a row',
    progress: (p) => [p.streaks.participation.longest, 30],
  },
  {
    id: 'podium_streak_3',
    kind: 'podium',
    label: 'TOP 3',
    value: '×3',
    name: 'Hat Trick',
    goal: 'Finish top 3 three days in a row',
    progress: (p) => [p.streaks.podium.longest, 3],
  },
  {
    id: 'podium_streak_7',
    kind: 'podium',
    label: 'TOP 3',
    value: '×7',
    name: 'Dynasty',
    goal: 'Finish top 3 seven days in a row',
    progress: (p) => [p.streaks.podium.longest, 7],
  },
  {
    id: 'first_win',
    kind: 'win',
    label: 'WIN',
    value: '1st',
    name: 'Champion',
    goal: 'Win a day on either board',
    progress: (p) => [p.counters.speedWins + p.counters.efficiencyWins, 1],
  },
  {
    id: 'first_perfect',
    kind: 'flawless',
    label: 'EFF',
    value: '100%',
    name: 'Flawless',
    goal: 'Finish a run at 100% efficiency',
    progress: (p) => [
      p.personalBests.mostEfficient?.efficiency === 1 ? 1 : 0,
      1,
    ],
  },
];

const CATALOG_BY_ID = new Map(BADGE_CATALOG.map((b) => [b.id, b]));

/** The win badge, whose value is the player's live win count once earned. */
const WIN_BADGE_ID = 'first_win';

/** A player's daily wins on each board, for the win badge's counts. */
export interface DailyWins {
  speed: number;
  efficiency: number;
}

/** A player's daily wins per board; null when their daily profile didn't load. */
export function dailyWins(daily: DailyProfile | null): DailyWins | null {
  return daily
    ? {
        speed: daily.counters.speedWins,
        efficiency: daily.counters.efficiencyWins,
      }
    : null;
}

/**
 * Colours for the win badge's per-board counts (`S3 | E2`): amber for the
 * speed board, cyan for the efficiency board (the site's efficiency colour).
 */
export const WIN_SPLIT_COLORS = {
  speed: colors.warning,
  efficiency: colors.primaryLight,
};

/**
 * The per-board win counts a badge shows in place of its catalog value:
 * only the win badge, and only once the player has a win. Null for every
 * other badge, and for the win badge with no wins or unknown counts (it then
 * shows its catalog value, `WIN ▸ 1st`). Drawn by components/BadgeValue.tsx.
 */
export function winSplit(
  info: BadgeInfo,
  wins: DailyWins | null
): DailyWins | null {
  return info.id === WIN_BADGE_ID && wins && wins.speed + wins.efficiency > 0
    ? wins
    : null;
}

/**
 * The tooltip for a badge: its name, plus the win split spelled out for the
 * win badge, since S / E alone don't spell out which board is which.
 */
export function badgeTitle(info: BadgeInfo, wins: DailyWins | null): string {
  const split = winSplit(info, wins);
  if (split) {
    return `${info.name}: ${split.speed} speed, ${split.efficiency} efficiency ${
      split.speed + split.efficiency === 1 ? 'win' : 'wins'
    }`;
  }
  return info.name;
}

/** Catalog entry for a badge id, or undefined for an id this build lacks. */
export function badgeInfo(id: string): BadgeInfo | undefined {
  return CATALOG_BY_ID.get(id);
}

/** One chip beside a leaderboard name. */
export interface Chip {
  key: 'streak' | 'podium' | 'wins';
  kind: BadgeKind;
  /** Left segment text, e.g. "STRK". */
  label: string;
  /** Right segment text, the count. */
  value: string;
  /** Full description for the tooltip and screen readers. */
  title: string;
}

/** Most chips a row shows; they sit on their own line under the name. */
export const MAX_CHIPS = 3;

/**
 * The chips to show for a racer, rarest first: total wins, then a podium
 * streak of 2+ days, then an active streak of 3+ days.
 */
export function chipsFor(badges: BadgeChips | null): Chip[] {
  if (!badges) return [];
  const chips: Chip[] = [];
  if (badges.wins >= 1) {
    chips.push({
      key: 'wins',
      kind: 'win',
      label: 'WIN',
      value: String(badges.wins),
      title: `${badges.wins} daily ${badges.wins === 1 ? 'win' : 'wins'}`,
    });
  }
  if (badges.podiumStreak >= 2) {
    chips.push({
      key: 'podium',
      kind: 'podium',
      label: 'TOP3',
      value: String(badges.podiumStreak),
      title: `Top 3 for ${badges.podiumStreak} days running`,
    });
  }
  if (badges.streak >= 3) {
    chips.push({
      key: 'streak',
      kind: 'streak',
      label: 'STRK',
      value: String(badges.streak),
      title: `${badges.streak}-day streak`,
    });
  }
  return chips.slice(0, MAX_CHIPS);
}

/**
 * 0.974 -> "97.4%"; 1 -> "100%". Only a perfect run reads 100%: anything
 * short of it tops out at 99.9% rather than rounding up.
 */
export function formatEfficiency(efficiency: number): string {
  const rounded = Math.round(efficiency * 1000) / 10;
  const pct = efficiency < 1 ? Math.min(rounded, 99.9) : rounded;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}
