/**
 * The amber "Race of the Day" tile on the profile page: current streak, the
 * last seven days as weekday-labelled ticks, and the daily personal bests
 * (fastest, most efficient, podiums) pinned to the bottom so the tile fills
 * its grid row. Shows an invitation instead when the player has never
 * finished a daily. Purely presentational; the page passes in the daily
 * profile and today's UTC date key.
 */
import React from 'react';
import type { DailyProfile } from '../../api/daily';
import { formatEfficiency } from '../../lib/dailyBadges';
import { formatDuration } from '../../lib/format';
import { weekTicks } from '../../lib/profileView';
import { colors } from '../../theme';
import { meta, sectionLabel, tile } from './tileStyles';

const EMPTY_MESSAGE =
  'Finish a Race of the Day to start earning streaks and badges.';

/** Two-letter weekday names, indexed by `Date.getUTCDay()` (0 = Sunday). */
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_MS = 86_400_000;

const styles: Record<string, React.CSSProperties> = {
  // A flex column so the personal bests sit at the bottom and the tile has
  // no dead space when the grid row makes it taller than its content.
  tile: {
    ...tile,
    display: 'flex',
    flexDirection: 'column',
    background: `linear-gradient(160deg, rgba(251, 191, 36, 0.18), ${colors.bgCard} 55%)`,
    borderColor: 'rgba(251, 191, 36, 0.4)',
  },
  label: { ...sectionLabel, color: colors.warning },
  streakRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'baseline',
    marginTop: '14px',
  },
  streak: {
    fontSize: '64px',
    fontWeight: 800,
    lineHeight: 1,
    color: colors.warning,
    textShadow: '0 0 24px rgba(251, 191, 36, 0.45)',
  },
  streakUnit: { fontSize: '16px', color: colors.textSecondary },
  week: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    gap: '6px',
    marginTop: '18px',
  },
  weekday: {
    fontSize: '12px',
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: '6px',
  },
  open: {
    margin: '10px 0 0',
    fontSize: '14px',
    color: colors.warning,
  },
  bests: { marginTop: 'auto', paddingTop: '24px' },
  bestsLabel: { ...sectionLabel, margin: '0 0 4px' },
  bestRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    padding: '12px 0',
    borderTop: `1px solid ${colors.border}`,
    fontSize: '16px',
  },
  bestLabel: { color: colors.textSecondary },
  bestValue: { fontSize: '17px', fontWeight: 700 },
  empty: { ...meta, fontSize: '15px', marginTop: '10px' },
};

/** Weekday names for the seven days ending `today` (a UTC date key), oldest first. */
function lastSevenWeekdays(today: string): string[] {
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  return Array.from(
    { length: 7 },
    (_, i) => WEEKDAYS[new Date(todayMs - (6 - i) * DAY_MS).getUTCDay()]!
  );
}

/** One of the seven day ticks: solid when raced, dashed outline when open. */
function tickStyle(kind: 'raced' | 'missed' | 'open'): React.CSSProperties {
  const base: React.CSSProperties = { height: '10px', borderRadius: 3 };
  if (kind === 'raced') return { ...base, background: colors.warning };
  if (kind === 'open') {
    return { ...base, border: `1px dashed ${colors.warning}`, opacity: 0.7 };
  }
  return { ...base, background: '#1e293b' };
}

/** A personal-best row: label on the left, bold value on the right, divided above. */
function BestRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <p style={{ ...styles.bestRow, margin: 0 }}>
      <span style={styles.bestLabel}>{label}</span>
      <span style={{ ...styles.bestValue, color: color ?? colors.textPrimary }}>
        {value}
      </span>
    </p>
  );
}

/**
 * Renders the Race of the Day tile. `daily` is null while the daily profile
 * is unavailable; both that and zero days raced show the empty message.
 */
export function RaceOfTheDayTile({
  daily,
  today,
}: {
  daily: DailyProfile | null;
  today: string;
}) {
  if (!daily || daily.counters.daysRaced === 0) {
    return (
      <div style={styles.tile}>
        <p style={styles.label}>Race of the Day</p>
        <p style={styles.empty}>{EMPTY_MESSAGE}</p>
      </div>
    );
  }

  const ticks = weekTicks(daily.recent, today);
  const weekdays = lastSevenWeekdays(today);
  const { fastest, mostEfficient } = daily.personalBests;

  return (
    <div style={styles.tile}>
      <p style={styles.label}>Race of the Day</p>
      <div style={styles.streakRow}>
        <span style={styles.streak}>{daily.streaks.participation.current}</span>
        <span style={styles.streakUnit}>day streak</span>
      </div>
      <div style={styles.week} aria-hidden="true">
        {ticks.map((kind, i) => (
          <div key={i}>
            <div style={tickStyle(kind)} />
            <div data-testid="tick-weekday" style={styles.weekday}>
              {weekdays[i]}
            </div>
          </div>
        ))}
      </div>
      {ticks[ticks.length - 1] === 'open' && (
        <p style={styles.open}>{"today's still open →"}</p>
      )}
      <div style={styles.bests}>
        <p style={styles.bestsLabel}>Personal bests</p>
        <BestRow
          label="Fastest daily"
          value={fastest ? formatDuration(fastest.ms) : '—'}
        />
        <BestRow
          label="Most efficient"
          value={
            mostEfficient ? formatEfficiency(mostEfficient.efficiency) : '—'
          }
          color={colors.primaryLight}
        />
        <BestRow
          label="Podiums"
          value={String(daily.counters.podiums)}
          color={colors.secondaryLight}
        />
      </div>
    </div>
  );
}
