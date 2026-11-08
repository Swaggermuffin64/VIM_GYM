/**
 * Race of the Day section of the profile page: streaks and win counts,
 * badges (earned and in progress), personal bests, and recent daily placings
 * (spec: docs/superpowers/specs/2026-10-19-daily-efficiency-badges-replays-design.md).
 *
 * Fetches GET /api/daily/profile itself. Renders nothing until it loads, and
 * nothing at all if the fetch fails — the rest of the profile stands alone.
 */
import React, { useEffect, useState } from 'react';
import { fetchDailyProfile } from '../api/daily';
import type { DailyHistoryDay, DailyProfile, EarnedBadge } from '../api/daily';
import {
  BADGE_CATALOG,
  BADGE_KIND_COLORS,
  formatEfficiency,
} from '../lib/dailyBadges';
import type { BadgeKind } from '../lib/dailyBadges';
import { StatusSegment } from './StatusSegment';
import { formatDuration, ordinal } from '../lib/format';
import { colors } from '../theme';

/** "2026-10-08" -> "Oct 8". Race dates are UTC days, so format in UTC. */
function formatRaceDate(raceDate: string): string {
  const d = new Date(`${raceDate}T00:00:00Z`);
  if (isNaN(d.getTime())) return raceDate;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Today's UTC date key, the same form race dates come in. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "3 days" / "1 day". */
function days(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

/** "4th of 44". */
function placingText(rank: number, racers: number): string {
  return `${ordinal(rank)} of ${racers}`;
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    width: '100%',
    maxWidth: '640px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  sectionTitle: {
    fontSize: '14px',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: '12px 0 0',
    fontWeight: 700,
  },
  card: {
    padding: '20px 24px',
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    background: colors.bgCard,
  },
  cardHeading: {
    fontSize: '14px',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: '0 0 14px',
    fontWeight: 700,
  },
  tileRow: { display: 'flex', gap: '12px', flexWrap: 'wrap' },
  tile: {
    flex: '1 1 120px',
    padding: '16px 12px',
    textAlign: 'center',
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    background: colors.bgCard,
  },
  tileValue: {
    fontSize: '28px',
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
  },
  tileLabel: {
    fontSize: '13px',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: '4px 0 0',
  },
  tileSub: { fontSize: '13px', color: colors.textMuted, margin: '4px 0 0' },
  badgeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
    gap: '10px',
  },
  badge: {
    padding: '14px',
    borderRadius: '10px',
    border: `1px solid ${colors.border}`,
    background: colors.bgDark,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '4px',
  },
  badgeLocked: {
    border: `1px dashed ${colors.borderLight}`,
    background: 'transparent',
  },
  badgeSegment: { marginBottom: '6px' },
  badgeName: { fontSize: '15px', fontWeight: 700, color: colors.textPrimary },
  badgeGoal: { fontSize: '12px', color: colors.textSecondary },
  badgeMeta: { fontSize: '12px', color: colors.textMuted },
  bests: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    columnGap: '16px',
    rowGap: '10px',
    fontSize: '15px',
  },
  bestLabel: { color: colors.textSecondary },
  bestValue: { justifySelf: 'end', color: colors.textPrimary },
  bestDate: { color: colors.textMuted },
  // One grid for the whole list so columns line up down the card (same
  // reasoning as the profile's recent-games list).
  recent: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    columnGap: '16px',
    rowGap: '10px',
    fontSize: '15px',
    alignItems: 'baseline',
  },
  recentHead: {
    fontSize: '12px',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  recentDate: { color: colors.textMuted, whiteSpace: 'nowrap' },
  recentSpeed: { color: colors.textPrimary },
  recentEff: { justifySelf: 'end', color: colors.textPrimary },
  recentSub: { color: colors.textMuted, fontSize: '13px' },
  podium: { color: colors.successLight, fontWeight: 700 },
  empty: { color: colors.textMuted, fontSize: '15px', margin: 0 },
};

function Tile({
  label,
  value,
  sub,
  kind,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Colours the value like the matching badges. */
  kind?: BadgeKind;
}) {
  return (
    <div style={styles.tile}>
      <p
        style={
          kind
            ? { ...styles.tileValue, color: BADGE_KIND_COLORS[kind] }
            : styles.tileValue
        }
      >
        {value}
      </p>
      <p style={styles.tileLabel}>{label}</p>
      {sub && <p style={styles.tileSub}>{sub}</p>}
    </div>
  );
}

/** Rank text, highlighted when it's a podium finish. */
function Rank({ rank, racers }: { rank: number; racers: number }) {
  return (
    <span style={rank <= 3 ? styles.podium : undefined}>
      {placingText(rank, racers)}
    </span>
  );
}

function BadgeGrid({ profile }: { profile: DailyProfile }) {
  const earned = new Map<string, EarnedBadge>(
    profile.badges.map((b) => [b.id, b])
  );
  return (
    <div style={styles.badgeGrid}>
      {BADGE_CATALOG.map((info) => {
        const got = earned.get(info.id);
        const [have, need] = info.progress(profile);
        return (
          <div
            key={info.id}
            style={
              got ? styles.badge : { ...styles.badge, ...styles.badgeLocked }
            }
            aria-label={`${info.name}: ${info.goal}${got ? ', earned' : ''}`}
          >
            <span style={styles.badgeSegment} aria-hidden="true">
              <StatusSegment
                kind={info.kind}
                label={info.label}
                value={info.value}
                locked={!got}
              />
            </span>
            <span style={styles.badgeName}>{info.name}</span>
            <span style={styles.badgeGoal}>{info.goal}</span>
            <span style={styles.badgeMeta}>
              {got
                ? `Earned ${formatRaceDate(got.earnedOn)}`
                : need > 1
                  ? `${Math.min(have, need)} / ${need}`
                  : 'Not yet'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PersonalBests({ profile }: { profile: DailyProfile }) {
  const pb = profile.personalBests;
  const rows: Array<[string, React.ReactNode, string]> = [];
  if (pb.bestSpeedPlacing) {
    const p = pb.bestSpeedPlacing;
    rows.push([
      'Best speed finish',
      <Rank key="speed" rank={p.rank} racers={p.racers} />,
      p.raceDate,
    ]);
  }
  if (pb.bestEfficiencyPlacing) {
    const p = pb.bestEfficiencyPlacing;
    rows.push([
      'Best efficiency finish',
      <Rank key="efficiency" rank={p.rank} racers={p.racers} />,
      p.raceDate,
    ]);
  }
  if (pb.fastest) {
    rows.push([
      'Fastest time',
      formatDuration(pb.fastest.ms),
      pb.fastest.raceDate,
    ]);
  }
  if (pb.mostEfficient) {
    rows.push([
      'Most efficient run',
      formatEfficiency(pb.mostEfficient.efficiency),
      pb.mostEfficient.raceDate,
    ]);
  }
  if (rows.length === 0) return null;
  return (
    <div style={styles.card}>
      <p style={styles.cardHeading}>Personal bests</p>
      <div style={styles.bests}>
        {rows.map(([label, value, date]) => (
          <React.Fragment key={label}>
            <span style={styles.bestLabel}>
              {label}{' '}
              <span style={styles.bestDate}>· {formatRaceDate(date)}</span>
            </span>
            <span style={styles.bestValue}>{value}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function RecentPlacings({ recent }: { recent: DailyHistoryDay[] }) {
  const today = todayUtc();
  return (
    <div style={styles.card}>
      <p style={styles.cardHeading}>Recent placings</p>
      <div style={styles.recent}>
        <span style={styles.recentHead}>Day</span>
        <span style={styles.recentHead}>Speed</span>
        <span style={{ ...styles.recentHead, justifySelf: 'end' }}>
          Efficiency
        </span>
        {recent.map((d) => (
          <React.Fragment key={d.raceDate}>
            <span style={styles.recentDate}>
              {d.raceDate === today ? 'Today' : formatRaceDate(d.raceDate)}
            </span>
            <span style={styles.recentSpeed}>
              <Rank rank={d.speedRank} racers={d.racers} />{' '}
              <span style={styles.recentSub}>{formatDuration(d.bestMs)}</span>
            </span>
            <span style={styles.recentEff}>
              {d.efficiencyRank !== null &&
              d.efficiencyRacers !== null &&
              d.efficiency !== null ? (
                <>
                  <Rank rank={d.efficiencyRank} racers={d.efficiencyRacers} />{' '}
                  <span style={styles.recentSub}>
                    {formatEfficiency(d.efficiency)}
                  </span>
                </>
              ) : (
                <span style={styles.recentSub}>—</span>
              )}
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export function DailyProfileSection({ accessToken }: { accessToken: string }) {
  const [profile, setProfile] = useState<DailyProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchDailyProfile(accessToken).then((p) => {
      if (!cancelled) setProfile(p);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (!profile) return null;

  const { streaks, counters } = profile;
  const wins = counters.speedWins + counters.efficiencyWins;

  return (
    <section style={styles.section} aria-label="Race of the Day">
      <p style={styles.sectionTitle}>Race of the Day</p>
      {counters.daysRaced === 0 ? (
        <div style={styles.card}>
          <p style={styles.empty}>
            Finish a Race of the Day to start earning streaks and badges.
          </p>
        </div>
      ) : (
        <>
          <div style={styles.tileRow}>
            <Tile
              label="Streak"
              value={String(streaks.participation.current)}
              kind="streak"
              sub={`longest ${days(streaks.participation.longest)}`}
            />
            <Tile
              label="Podium streak"
              value={String(streaks.podium.current)}
              kind="podium"
              sub={`longest ${days(streaks.podium.longest)}`}
            />
            <Tile
              label="Wins"
              value={String(wins)}
              kind="win"
              sub={`${counters.speedWins} speed · ${counters.efficiencyWins} eff.`}
            />
            <Tile
              label="Days raced"
              value={String(counters.daysRaced)}
              sub={`${counters.podiums} podiums`}
            />
          </div>
          <PersonalBests profile={profile} />
          {profile.recent.length > 0 && (
            <RecentPlacings recent={profile.recent} />
          )}
        </>
      )}
      <div style={styles.card}>
        <p style={styles.cardHeading}>Badges</p>
        <BadgeGrid profile={profile} />
      </div>
    </section>
  );
}
