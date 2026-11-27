/**
 * The profile page's layout, shared by your own profile (pages/profile.tsx)
 * and another player's (pages/player.tsx): the player card on top of a
 * six-column grid of tiles (Race of the Day, activity calendar, avg race
 * time, multiplayer, recent games, trophy case), then a Back button.
 *
 * Purely presentational: the pages fetch the data and decide whether the
 * card is editable (by passing the save handlers) or read-only.
 */
import React, { useEffect, useState } from 'react';
import { SiteBanner } from '../SiteBanner';
import { colors } from '../../theme';
import type { DailyProfile } from '../../api/daily';
import type { PlayerStats, Profile } from '../../api/profile';
import { PlayerCard } from './PlayerCard';
import { RaceOfTheDayTile } from './RaceOfTheDayTile';
import { ActivityCalendar } from './ActivityCalendar';
import { RaceTimeChart } from './RaceTimeChart';
import { MultiplayerTile } from './MultiplayerTile';
import { RecentGames } from './RecentGames';
import { TrophyCase } from './TrophyCase';
import { TILE_GAP } from './tileStyles';

/** Below this width every tile takes the full row. */
const NARROW_QUERY = '(max-width: 639px)';

/** True while the viewport is narrower than 640px; false where matchMedia is missing. */
function useIsNarrow(): boolean {
  const query = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(NARROW_QUERY)
      : null;
  const [narrow, setNarrow] = useState(() => query()?.matches ?? false);

  useEffect(() => {
    const mql = query();
    if (!mql) return;
    const onChange = () => setNarrow(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return narrow;
}

/** Widest the profile column grows; wide enough that the bento tiles breathe. */
const PAGE_MAX_WIDTH = 1200;
/** Activity calendar weeks on a phone, where a full year's squares get too small. */
const NARROW_CALENDAR_WEEKS = 26;

/** Grid placement for a tile: `span` columns, optionally `rows` tall; full-width when narrow. */
function cell(
  narrow: boolean,
  span: number,
  rows?: number
): React.CSSProperties {
  return {
    gridColumn: narrow ? 'span 6' : `span ${span}`,
    gridRow: !narrow && rows ? `span ${rows}` : undefined,
    minWidth: 0,
  };
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: '#000000',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '"JetBrains Mono", monospace',
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '48px 20px',
    gap: `${TILE_GAP}px`,
  },
  column: {
    width: '100%',
    maxWidth: `${PAGE_MAX_WIDTH}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: `${TILE_GAP}px`,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
    gap: `${TILE_GAP}px`,
  },
  backButton: {
    width: '100%',
    maxWidth: `${PAGE_MAX_WIDTH}px`,
    padding: '16px 24px',
    fontSize: '17px',
    fontWeight: 500,
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    color: colors.textMuted,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
  message: {
    color: '#f87171',
    fontFamily: '"JetBrains Mono", monospace',
  },
};

/**
 * A profile page that couldn't load: the site banner over one line of red
 * text (the server's error, or "Player not found").
 */
export function ProfileMessage({ message }: { message: string }) {
  return (
    <div style={styles.container}>
      <SiteBanner />
      <div style={styles.mainContent}>
        <p style={styles.message}>{message}</p>
      </div>
    </div>
  );
}

/**
 * The full profile page. `stats` and `daily` are null when their fetch
 * failed; those tiles then show their empty states. Pass the save handlers
 * only for the viewer's own profile.
 */
export function ProfileBento({
  profile,
  stats,
  daily,
  today,
  onSaveName,
  onSaveShowcase,
  onBack,
}: {
  profile: Profile;
  stats: PlayerStats | null;
  daily: DailyProfile | null;
  /** Today's UTC date (YYYY-MM-DD), fixed for the page's lifetime. */
  today: string;
  onSaveName?: (name: string) => Promise<string | null>;
  onSaveShowcase?: (ids: string[]) => Promise<string | null>;
  onBack: () => void;
}) {
  const narrow = useIsNarrow();
  const showMultiplayer = (stats?.multiplayer.races ?? 0) > 0;

  return (
    <div style={styles.container}>
      <SiteBanner />
      <div style={styles.mainContent}>
        <div style={styles.column}>
          <PlayerCard
            profile={profile}
            stats={stats}
            daily={daily}
            onSaveName={onSaveName}
            onSaveShowcase={onSaveShowcase}
          />
          <div style={styles.grid}>
            <div style={cell(narrow, 2, 2)}>
              <RaceOfTheDayTile daily={daily} today={today} />
            </div>
            <div style={cell(narrow, 4)}>
              <ActivityCalendar
                activity={stats?.activity ?? []}
                winDates={daily?.winDates ?? []}
                today={today}
                weeks={narrow ? NARROW_CALENDAR_WEEKS : undefined}
              />
            </div>
            <div style={cell(narrow, 4)}>
              <RaceTimeChart
                avgRaceMs={stats?.avgRaceMs ?? null}
                weekly={stats?.raceTimeWeekly ?? []}
                avg30d={stats?.avgRaceMs30d ?? null}
                prev30d={stats?.avgRaceMsPrev30d ?? null}
                today={today}
              />
            </div>
            {showMultiplayer && stats && (
              <div style={cell(narrow, 2)}>
                <MultiplayerTile
                  races={stats.multiplayer.races}
                  wins={stats.multiplayer.wins}
                  winRate={stats.multiplayer.winRate}
                />
              </div>
            )}
            <div style={cell(narrow, showMultiplayer ? 4 : 6)}>
              <RecentGames
                games={stats?.recentGames ?? []}
                dailyRecent={daily?.recent ?? []}
                today={today}
              />
            </div>
            <div style={cell(narrow, 6)}>
              <TrophyCase daily={daily} />
            </div>
          </div>
        </div>
        <button style={styles.backButton} onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
