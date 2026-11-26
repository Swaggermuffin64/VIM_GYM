/**
 * The full-width "Trophy case" tile: every Race of the Day badge as a plaque
 * in a responsive auto-fill grid (200px minimum column), earned ones first (tinted, with the earned date) then
 * locked ones (dashed, with a progress bar). A header shows earned / total
 * and a completion meter bar (no percentage label). Plaques are equal-height
 * flex columns with the
 * date or progress pinned to the bottom so rows line up whatever the goal
 * length. Presentational; the ordering and progress come from `trophyCase()`.
 */
import React from 'react';
import type { DailyProfile } from '../../api/daily';
import { BADGE_CATALOG, BADGE_KIND_COLORS } from '../../lib/dailyBadges';
import { trophyCase } from '../../lib/profileView';
import type { TrophyEntry } from '../../lib/profileView';
import { colors } from '../../theme';
import { StatusSegment } from '../StatusSegment';
import { sectionLabel, tile, TILE_GAP } from './tileStyles';

const TRACK = '#1e293b';
const GOAL_COLOR = '#cbd5e1';

/** A profile with nothing done, used to read each badge's target. */
const EMPTY_PROFILE: DailyProfile = {
  badges: [],
  unseenBadges: [],
  streaks: {
    participation: { current: 0, longest: 0 },
    podium: { current: 0, longest: 0 },
  },
  counters: { daysRaced: 0, speedWins: 0, efficiencyWins: 0, podiums: 0 },
  personalBests: {
    bestSpeedPlacing: null,
    bestEfficiencyPlacing: null,
    fastest: null,
    mostEfficient: null,
  },
  recent: [],
  winDates: [],
};

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: '14px',
  },
  count: { fontSize: '14px', color: colors.textMuted },
  meter: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '14px',
  },
  track: {
    flex: 1,
    height: '6px',
    borderRadius: 3,
    background: TRACK,
    overflow: 'hidden',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: `${TILE_GAP}px`,
    alignItems: 'stretch',
  },
  plaque: {
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '22px 16px 18px',
    borderRadius: '12px',
    textAlign: 'center',
  },
  name: { margin: '8px 0 0', fontSize: '18px', fontWeight: 800 },
  goal: { margin: 0, fontSize: '14px', color: GOAL_COLOR, lineHeight: 1.4 },
  bottom: {
    margin: 0,
    marginTop: 'auto',
    paddingTop: '4px',
    fontSize: '13px',
    color: colors.textSecondary,
  },
  bar: {
    width: '80%',
    height: '7px',
    borderRadius: 4,
    background: TRACK,
    overflow: 'hidden',
    marginTop: 'auto',
  },
};

/** "2026-10-21" -> "Oct 21" (UTC days). */
function formatEarnedDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Every badge as locked with `0 / need`, for a player with no daily data. */
function lockedEntries(): TrophyEntry[] {
  return BADGE_CATALOG.map((info) => {
    const need = info.progress(EMPTY_PROFILE)[1];
    return {
      info,
      earnedOn: null,
      have: 0,
      need,
      fraction: 0,
      progressText: `0 / ${need}`,
    };
  });
}

/** One badge plaque, earned (tinted, dated) or locked (dashed, progress). */
function Plaque({ entry }: { entry: TrophyEntry }) {
  const { info, earnedOn } = entry;
  const color = BADGE_KIND_COLORS[info.kind];

  if (earnedOn !== null) {
    return (
      <div
        style={{
          ...styles.plaque,
          background: `linear-gradient(180deg, ${color}24 0%, ${colors.bgCard} 70%)`,
          border: `1px solid ${color}66`,
        }}
        role="group"
        aria-label={`${info.name}: ${info.goal}, earned`}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: color,
          }}
        />
        <StatusSegment
          kind={info.kind}
          label={info.label}
          value={info.value}
          size="xl"
        />
        <p style={styles.name}>{info.name}</p>
        <p style={styles.goal}>{info.goal}</p>
        <p style={styles.bottom}>{formatEarnedDate(earnedOn)}</p>
      </div>
    );
  }

  const showBar = entry.progressText !== 'Not yet';
  return (
    <div
      style={{ ...styles.plaque, border: `1px dashed ${colors.borderLight}` }}
      role="group"
      aria-label={`${info.name}: ${info.goal}`}
    >
      <StatusSegment
        kind={info.kind}
        label={info.label}
        value={info.value}
        size="xl"
        locked
      />
      <p style={{ ...styles.name, color: colors.textSecondary }}>{info.name}</p>
      <p style={styles.goal}>{info.goal}</p>
      {showBar && (
        <div style={styles.bar}>
          <div
            style={{
              width: `${Math.round(entry.fraction * 100)}%`,
              height: '100%',
              borderRadius: 4,
              background: color,
            }}
          />
        </div>
      )}
      <p style={showBar ? { ...styles.bottom, marginTop: 0 } : styles.bottom}>
        {entry.progressText}
      </p>
    </div>
  );
}

/**
 * Renders the trophy case. With `daily` null every badge shows locked at
 * `0 / need`.
 */
export function TrophyCase({ daily }: { daily: DailyProfile | null }) {
  const entries = daily ? trophyCase(daily) : lockedEntries();
  const earned = entries.filter((e) => e.earnedOn !== null).length;
  const percent = Math.round((earned / entries.length) * 100);

  return (
    <div style={tile}>
      <div style={styles.header}>
        <p style={sectionLabel}>Trophy case</p>
        <p style={{ ...styles.count, margin: 0 }}>
          <span style={{ color: colors.textPrimary, fontWeight: 800 }}>
            {earned}
          </span>{' '}
          <span>/ {entries.length}</span>
        </p>
      </div>
      <div style={styles.meter} aria-hidden="true">
        <div style={styles.track}>
          <div
            style={{
              width: `${percent}%`,
              height: '100%',
              borderRadius: 3,
              background: `linear-gradient(90deg, ${BADGE_KIND_COLORS.days}, ${BADGE_KIND_COLORS.streak}, ${BADGE_KIND_COLORS.podium}, ${BADGE_KIND_COLORS.win})`,
            }}
          />
        </div>
      </div>
      <div style={styles.grid}>
        {entries.map((entry) => (
          <Plaque key={entry.info.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}
