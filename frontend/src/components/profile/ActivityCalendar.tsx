/**
 * The activity heatmap tile: 26 weeks of 10px squares (columns are weeks,
 * rows Monday to Sunday), shaded cyan by how many runs happened that UTC day
 * and green when the day had a win. Includes a header summary and a legend.
 * Presentational; the grid and summary come from lib/profileView.
 */
import React from 'react';
import type { PlayerStats } from '../../api/profile';
import {
  activityGrid,
  activityLevel,
  activitySummary,
} from '../../lib/profileView';
import type { ActivityCell } from '../../lib/profileView';
import { colors } from '../../theme';
import { meta, sectionLabel, tile } from './tileStyles';

/** Square colours for run levels 0 to 3 (none to many). */
const LEVEL_COLORS = ['#1a1f2b', '#164e63', '#0891b2', colors.primaryLight];
const SQUARE = 10;
const SQUARE_GAP = 3;

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', gap: '12px' },
  grid: {
    display: 'grid',
    gridTemplateRows: `repeat(7, ${SQUARE}px)`,
    gridAutoFlow: 'column',
    gridAutoColumns: `${SQUARE}px`,
    gap: `${SQUARE_GAP}px`,
    marginTop: '12px',
    overflowX: 'auto',
  },
  legend: {
    ...meta,
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
    marginTop: '10px',
  },
};

/** "2026-11-20: 3 runs, won" — the accessible description of one square. */
function cellLabel(cell: ActivityCell): string {
  const runs = `${cell.runs} ${cell.runs === 1 ? 'run' : 'runs'}`;
  return `${cell.day}: ${runs}${cell.won ? ', won' : ''}`;
}

/** Fill colour for a square: green if won, else the cyan shade for its runs. */
function cellColor(cell: ActivityCell): string {
  return cell.won
    ? colors.successLight
    : LEVEL_COLORS[activityLevel(cell.runs)];
}

/** A legend swatch. */
function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: SQUARE,
        height: SQUARE,
        borderRadius: 2,
        background: color,
        display: 'inline-block',
      }}
    />
  );
}

/**
 * Renders the activity calendar for the last 26 weeks ending at `today`.
 * `winDates` are the daily-win days, merged with multiplayer wins in `activity`.
 */
export function ActivityCalendar({
  activity,
  winDates,
  today,
}: {
  activity: PlayerStats['activity'];
  winDates: string[];
  today: string;
}) {
  const weeks = activityGrid(activity, winDates, today);
  const { daysActive, wins } = activitySummary(activity, winDates);

  return (
    <div style={tile}>
      <div style={styles.header}>
        <p style={sectionLabel}>Activity</p>
        <p style={meta}>{`${daysActive} days raced · ${wins} wins`}</p>
      </div>
      <div style={styles.grid}>
        {weeks.flatMap((week) =>
          week.map((cell) =>
            cell.future ? (
              <span key={cell.day} aria-hidden="true" />
            ) : (
              <span
                key={cell.day}
                aria-label={cellLabel(cell)}
                role="img"
                style={{
                  borderRadius: 2,
                  background: cellColor(cell),
                }}
              />
            )
          )
        )}
      </div>
      <div style={styles.legend}>
        less{' '}
        {LEVEL_COLORS.map((c) => (
          <Swatch key={c} color={c} />
        ))}{' '}
        more · <Swatch color={colors.successLight} /> won
      </div>
    </div>
  );
}
