/**
 * The "Avg race time" tile: the all-modes average as a headline, a 30-day
 * change badge, and an area sparkline of weekly averages drawn as inline SVG
 * (no chart library). Presentational; the page supplies the numbers from
 * /api/user/stats.
 */
import React from 'react';
import type { PlayerStats } from '../../api/profile';
import { formatDuration } from '../../lib/format';
import { raceTimeDelta } from '../../lib/profileView';
import { colors } from '../../theme';
import { meta, sectionLabel, tile } from './tileStyles';

const CHART_WIDTH = 300;
const CHART_HEIGHT = 50;
const CHART_PADDING = 4;

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', gap: '12px' },
  headline: { fontSize: '24px', fontWeight: 800 },
  svg: { width: '100%', height: '52px', marginTop: '8px', display: 'block' },
};

/**
 * Line and area path strings for the weekly averages, scaled to the chart.
 * Faster (lower) weeks sit lower, so an improving player's line trends down,
 * as in the mockup.
 */
function sparklinePaths(weekly: PlayerStats['raceTimeWeekly']): {
  line: string;
  area: string;
} {
  const values = weekly.map((w) => w.avgMs);
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const usable = CHART_HEIGHT - CHART_PADDING * 2;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * CHART_WIDTH;
    const y = CHART_PADDING + usable - ((v - min) / range) * usable;
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const line = `M${points.join(' L')}`;
  return {
    line,
    area: `${line} L${CHART_WIDTH} ${CHART_HEIGHT} L0 ${CHART_HEIGHT}Z`,
  };
}

/**
 * Renders the average race time tile. `weekly` are weekly means, oldest first;
 * with fewer than two points no line is drawn. The delta compares the last
 * 30 days with the 30 before and is hidden when either is unknown.
 */
export function RaceTimeChart({
  avgRaceMs,
  weekly,
  avg30d,
  prev30d,
}: {
  avgRaceMs: number | null;
  weekly: PlayerStats['raceTimeWeekly'];
  avg30d: number | null;
  prev30d: number | null;
}) {
  const delta = raceTimeDelta(avg30d, prev30d);
  const paths = weekly.length >= 2 ? sparklinePaths(weekly) : null;

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
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
    </div>
  );
}
