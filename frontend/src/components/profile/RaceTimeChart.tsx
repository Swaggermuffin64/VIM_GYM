/**
 * The "Avg race time" tile: the all-modes average as a headline, a 30-day
 * change badge, and an area sparkline of weekly averages drawn as inline SVG
 * (no chart library). Presentational; the page supplies the numbers from
 * /api/user/stats.
 */
import React from 'react';
import type { PlayerStats } from '../../api/profile';
import { formatDuration } from '../../lib/format';
import { raceTimeDelta, weekStartAxis } from '../../lib/profileView';
import { colors } from '../../theme';
import { meta, sectionLabel, tile } from './tileStyles';

const CHART_WIDTH = 300;
const CHART_HEIGHT = 50;
const CHART_PADDING = 4;
/** Weeks on the chart's x-axis; matches the backend's RACE_TIME_WEEKS. */
const RACE_TIME_WEEKS = 12;

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', gap: '12px' },
  headline: { fontSize: '24px', fontWeight: 800 },
  svg: { width: '100%', height: '52px', marginTop: '8px', display: 'block' },
};

/**
 * Line and area path strings for the weekly averages on a fixed axis of
 * `RACE_TIME_WEEKS` weeks ending this week. A week with no entry is a gap:
 * the line restarts (a new `M` sub-path) after it instead of joining across.
 * Faster (lower) weeks sit lower, so an improving player's line trends down.
 * Null when fewer than two weeks have data.
 */
function sparklinePaths(
  weekly: PlayerStats['raceTimeWeekly'],
  today: string
): { line: string; area: string } | null {
  const axis = weekStartAxis(today, RACE_TIME_WEEKS);
  const avgByWeek = new Map(weekly.map((w) => [w.weekStart, w.avgMs]));
  const known = axis.flatMap((week) => {
    const v = avgByWeek.get(week);
    return v === undefined ? [] : [v];
  });
  if (known.length < 2) return null;

  const min = Math.min(...known);
  const range = Math.max(...known) - min || 1;
  const usable = CHART_HEIGHT - CHART_PADDING * 2;

  // Consecutive weeks with data, as lists of "x y" points.
  const runs: { x: number; y: number }[][] = [[]];
  axis.forEach((week, i) => {
    const v = avgByWeek.get(week);
    if (v === undefined) {
      if (runs[runs.length - 1]!.length > 0) runs.push([]);
      return;
    }
    runs[runs.length - 1]!.push({
      x: (i / (RACE_TIME_WEEKS - 1)) * CHART_WIDTH,
      y: CHART_PADDING + usable - ((v - min) / range) * usable,
    });
  });
  const segments = runs.filter((run) => run.length > 0);
  const fmt = (p: { x: number; y: number }) =>
    `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;

  // A lone week is a zero-length segment; the round line cap draws it as a dot.
  const line = segments
    .map((run) =>
      run.length === 1
        ? `M${fmt(run[0]!)} L${fmt(run[0]!)}`
        : `M${run.map(fmt).join(' L')}`
    )
    .join(' ');
  const area = segments
    .filter((run) => run.length > 1)
    .map((run) => {
      const first = run[0]!;
      const last = run[run.length - 1]!;
      return `M${run.map(fmt).join(' L')} L${last.x.toFixed(1)} ${CHART_HEIGHT} L${first.x.toFixed(1)} ${CHART_HEIGHT}Z`;
    })
    .join(' ');
  return { line, area };
}

/**
 * Renders the average race time tile. `weekly` are weekly means keyed by UTC
 * Monday; they are placed on a 12-week axis ending at `today`'s week, weeks
 * with none leave a gap, and with fewer than two points no line is drawn. The delta compares the last
 * 30 days with the 30 before and is hidden when either is unknown.
 */
export function RaceTimeChart({
  avgRaceMs,
  weekly,
  avg30d,
  prev30d,
  today,
}: {
  avgRaceMs: number | null;
  weekly: PlayerStats['raceTimeWeekly'];
  avg30d: number | null;
  prev30d: number | null;
  today: string;
}) {
  const delta = raceTimeDelta(avg30d, prev30d);
  const paths = sparklinePaths(weekly, today);

  return (
    <div style={tile}>
      <div style={styles.header}>
        <div>
          <p style={sectionLabel}>Avg race time</p>
          <p style={{ ...meta, marginTop: '3px' }}>all modes</p>
        </div>
        <p style={{ margin: 0, textAlign: 'right' }}>
          <span style={styles.headline}>
            {avgRaceMs === null ? '—' : formatDuration(avgRaceMs)}
          </span>
          {delta && (
            <>
              {' '}
              <span
                style={{
                  fontSize: '13px',
                  color: delta.faster ? colors.successLight : colors.textMuted,
                }}
              >
                {`${delta.faster ? '▼' : '▲'} ${formatDuration(delta.ms)} / 30d`}
              </span>
            </>
          )}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        style={styles.svg}
        aria-hidden="true"
      >
        {paths && (
          <>
            <defs>
              <linearGradient id="raceTimeFill" x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="0"
                  stopColor={colors.primaryLight}
                  stopOpacity=".35"
                />
                <stop
                  offset="1"
                  stopColor={colors.primaryLight}
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>
            <path d={paths.area} fill="url(#raceTimeFill)" />
            <path
              d={paths.line}
              fill="none"
              stroke={colors.primaryLight}
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
    </div>
  );
}
