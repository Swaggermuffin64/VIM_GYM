/**
 * The amber "Race of the Day" tile on the profile page: current streak, the
 * last seven days as ticks, and the daily personal bests (fastest, most
 * efficient, podiums). Shows an invitation instead when the player has never
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

const styles: Record<string, React.CSSProperties> = {
  tile: {
    ...tile,
    background: `linear-gradient(160deg, rgba(251, 191, 36, 0.18), ${colors.bgCard} 55%)`,
    borderColor: 'rgba(251, 191, 36, 0.4)',
  },
  label: { ...sectionLabel, color: colors.warning },
  streakRow: {
    display: 'flex',
    gap: '10px',
    alignItems: 'baseline',
    marginTop: '10px',
  },
  streak: {
    fontSize: '48px',
    fontWeight: 800,
    lineHeight: 1,
    color: colors.warning,
    textShadow: '0 0 24px rgba(251, 191, 36, 0.45)',
  },
  ticks: { display: 'flex', gap: '4px', margin: '12px 0 6px' },
  open: { margin: 0, fontSize: '13px', color: colors.warning },
  bestsLabel: { ...sectionLabel, margin: '18px 0 6px' },
  bestRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '3px 0',
  },
  empty: { ...meta, fontSize: '15px', marginTop: '10px' },
};

/** One of the seven day ticks: solid when raced, dashed outline when open. */
function tickStyle(kind: 'raced' | 'missed' | 'open'): React.CSSProperties {
  const base: React.CSSProperties = { flex: 1, height: '8px', borderRadius: 2 };
  if (kind === 'raced') return { ...base, background: colors.warning };
  if (kind === 'open') {
    return { ...base, border: `1px dashed ${colors.warning}`, opacity: 0.7 };
  }
  return { ...base, background: '#1e293b' };
}

/** A personal-best row: muted label on the left, value on the right. */
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
      <span style={{ color: colors.textMuted }}>{label}</span>
      <span style={color ? { color } : undefined}>{value}</span>
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
  const { fastest, mostEfficient } = daily.personalBests;

  return (
    <div style={styles.tile}>
      <p style={styles.label}>Race of the Day</p>
      <div style={styles.streakRow}>
        <span style={styles.streak}>{daily.streaks.participation.current}</span>
        <span style={meta}>day streak</span>
      </div>
      <div style={styles.ticks} aria-hidden="true">
        {ticks.map((kind, i) => (
          <span key={i} style={tickStyle(kind)} />
        ))}
      </div>
      {ticks[ticks.length - 1] === 'open' && (
        <p style={styles.open}>{"today's still open →"}</p>
      )}
      <p style={styles.bestsLabel}>Personal bests</p>
      <BestRow
        label="Fastest daily"
        value={fastest ? formatDuration(fastest.ms) : '—'}
      />
      <BestRow
        label="Most efficient"
        value={mostEfficient ? formatEfficiency(mostEfficient.efficiency) : '—'}
        color={colors.primaryLight}
      />
      <BestRow
        label="Podiums"
        value={String(daily.counters.podiums)}
        color={colors.secondaryLight}
      />
    </div>
  );
}
