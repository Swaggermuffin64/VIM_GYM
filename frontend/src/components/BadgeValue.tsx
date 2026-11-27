/**
 * The value half of a badge's status-line segment (the `30` in
 * `STREAK ▸ 30`), for StatusSegment's `value` prop.
 *
 * Most badges show their fixed catalog value. The earned win badge instead
 * splits the player's wins by board, each count in its board's colour:
 * `S3 | E2` with S3 amber (speed) and E2 cyan (efficiency), see
 * WIN_SPLIT_COLORS and winSplit in lib/dailyBadges.ts.
 */
import React from 'react';
import { WIN_SPLIT_COLORS, winSplit } from '../lib/dailyBadges';
import type { BadgeInfo, DailyWins } from '../lib/dailyBadges';
import { colors } from '../theme';

export function BadgeValue({
  info,
  wins,
}: {
  info: BadgeInfo;
  /** The player's daily wins per board; null when unknown. */
  wins: DailyWins | null;
}) {
  const split = winSplit(info, wins);
  if (!split) return <>{info.value}</>;
  return (
    <>
      <span style={{ color: WIN_SPLIT_COLORS.speed }}>S{split.speed}</span>
      <span style={styles.divider}>|</span>
      <span style={{ color: WIN_SPLIT_COLORS.efficiency }}>
        E{split.efficiency}
      </span>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  // Quieter than the counts, with room either side like the old ` | `.
  divider: { color: colors.textMuted, margin: '0 0.5ch' },
};
