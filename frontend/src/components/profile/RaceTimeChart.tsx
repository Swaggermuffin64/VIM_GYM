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
  root: { ...tile, display: 'flex', flexDirection: 'column' },
  /** Grows to fill whatever height the grid row gives the tile. */
  svg: {
    width: '100%',
    flex: 1,
    minHeight: '52px',
    marginTop: '8px',
    display: 'block',
  },
};

interface ChartPoint {
  /** Position of the point's week on the axis (0 = oldest week). */
  weekIndex: number;
  x: number;
  y: number;
}

/**
 * Path strings for the weekly averages on a fixed axis of `RACE_TIME_WEEKS`
 * weeks ending this week, drawn as one connected line:
 * - `line`: solid segments between points in neighbouring weeks;
 * - `gaps`: dashed segments that bridge weeks with no finished runs, so a
 *   quiet week reads as "no data" instead of breaking the line apart;
 * - `area`: the fill under the whole line, first point to last.
 * Faster (lower) weeks sit lower, so an improving player's line trends down.
 * Null when fewer than two weeks have data.
 */
function sparklinePaths(
  weekly: PlayerStats['raceTimeWeekly'],
  today: string
): { line: string; gaps: string; area: string } | null {
  const axis = weekStartAxis(today, RACE_TIME_WEEKS);
  const avgByWeek = new Map(weekly.map((w) => [w.weekStart, w.avgMs]));
  const known = axis.flatMap((week, weekIndex) => {
    const avgMs = avgByWeek.get(week);
    return avgMs === undefined ? [] : [{ weekIndex, avgMs }];
  });
  if (known.length < 2) return null;

  const times = known.map((k) => k.avgMs);
  const min = Math.min(...times);
  const range = Math.max(...times) - min || 1;
  const usable = CHART_HEIGHT - CHART_PADDING * 2;
  const points: ChartPoint[] = known.map(({ weekIndex, avgMs }) => ({
    weekIndex,
    x: (weekIndex / (RACE_TIME_WEEKS - 1)) * CHART_WIDTH,
    y: CHART_PADDING + usable - ((avgMs - min) / range) * usable,
  }));

  const fmt = (p: ChartPoint) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  const solid: string[] = [];
  const dashed: string[] = [];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]!;
    const to = points[i]!;
    const segment = `M${fmt(from)} L${fmt(to)}`;
    if (to.weekIndex - from.weekIndex === 1) solid.push(segment);
    else dashed.push(segment);
  }

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const area = `M${points.map(fmt).join(' L')} L${last.x.toFixed(1)} ${CHART_HEIGHT} L${first.x.toFixed(1)} ${CHART_HEIGHT}Z`;
  return { line: solid.join(' '), gaps: dashed.join(' '), area };
}

/**
 * Renders the average race time tile. `weekly` are weekly means keyed by UTC
 * Monday; they are placed on a 12-week axis ending at `today`'s week, weeks
 * with none are bridged by a dashed segment, and with fewer than two points
 * no line is drawn. The chart grows to fill the tile's height. The delta
 * compares the last 30 days with the 30 before and is hidden when either is
 * unknown.
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
    <div style={styles.root}>
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
            {paths.line && (
              <path
                data-testid="race-time-line"
                d={paths.line}
                fill="none"
                stroke={colors.primaryLight}
                strokeWidth="2"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {paths.gaps && (
              <path
                data-testid="race-time-gap"
                d={paths.gaps}
                fill="none"
                stroke={colors.primaryLight}
                strokeOpacity=".6"
                strokeWidth="2"
                strokeDasharray="4 5"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </>
        )}
      </svg>
    </div>
  );
}
