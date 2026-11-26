/**
 * Profile page: a bento layout. The player card (avatar, editable name,
 * showcased badges, daily strip) sits on top of a six-column grid of tiles:
 * Race of the Day, activity calendar, avg race time, multiplayer, recent
 * games and the trophy case.
 *
 * Loads identity (/api/user/me), stats (/api/user/stats) and the daily
 * profile (/api/daily/profile) in parallel, once each. An identity failure
 * shows an error; a stats or daily failure just leaves those tiles empty.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { SiteBanner } from '../components/SiteBanner';
import { colors } from '../theme';
import { formatDuration, ordinal } from '../lib/format';
import { fetchDailyProfile } from '../api/daily';
import type { DailyProfile } from '../api/daily';
import { fetchMe, fetchPlayerStats, saveShowcase } from '../api/profile';
import type { PlayerStats, Profile } from '../api/profile';
import { PlayerCard } from '../components/profile/PlayerCard';
import { RaceOfTheDayTile } from '../components/profile/RaceOfTheDayTile';
import { ActivityCalendar } from '../components/profile/ActivityCalendar';
import { RaceTimeChart } from '../components/profile/RaceTimeChart';
import { MultiplayerTile } from '../components/profile/MultiplayerTile';
import { RecentGames } from '../components/profile/RecentGames';
import { TrophyCase } from '../components/profile/TrophyCase';
import { TILE_GAP } from '../components/profile/tileStyles';

export { formatDuration, ordinal };

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

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
};

/** The profile route's page component. */
export default function ProfilePage() {
  const navigate = useNavigate();
  const { session, applyProfileUpdate } = useAuth();
  const accessToken = session?.access_token ?? null;
  const narrow = useIsNarrow();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [daily, setDaily] = useState<DailyProfile | null>(null);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    Promise.all([
      fetchMe(accessToken),
      fetchPlayerStats(accessToken),
      fetchDailyProfile(accessToken),
    ]).then(([me, playerStats, dailyProfile]) => {
      if (cancelled) return;
      if ('error' in me) {
        setError(me.error);
        return;
      }
      setProfile(me);
      setStats(playerStats);
      setDaily(dailyProfile);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  /** Saves a new display name; resolves to an error message, or null on success. */
  const saveName = async (name: string): Promise<string | null> => {
    if (!accessToken) return 'Not signed in';
    try {
      const res = await fetch(`${BACKEND_URL}/api/user/profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ display_name: name }),
      });
      const data: {
        success: boolean;
        profile?: { display_name: string };
        error?: string;
      } = await res.json();
      if (data.success && data.profile) {
        const savedName = data.profile.display_name;
        setProfile((prev) =>
          prev ? { ...prev, displayName: savedName } : prev
        );
        // Sync the shared auth profile so the site banner shows the new name.
        // AuthContext expects the server's snake_case shape, so pass it as-is.
        applyProfileUpdate(
          data.profile as Parameters<typeof applyProfileUpdate>[0]
        );
        return null;
      }
      return data.error ?? 'Failed to save name';
    } catch {
      return 'Network error';
    }
  };

  /** Saves the showcased badges; resolves to an error message, or null on success. */
  const saveShowcaseBadges = async (ids: string[]): Promise<string | null> => {
    if (!accessToken) return 'Not signed in';
    const result = await saveShowcase(accessToken, ids);
    if (!result.ok) return result.error;
    setProfile((prev) =>
      prev ? { ...prev, showcasedBadges: result.ids } : prev
    );
    return null;
  };

  if (error) {
    return (
      <div style={styles.container}>
        <SiteBanner />
        <div style={styles.mainContent}>
          <p
            style={{
              color: '#f87171',
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={styles.container}>
        <SiteBanner />
      </div>
    );
  }

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
            onSaveName={saveName}
            onSaveShowcase={saveShowcaseBadges}
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
        <button style={styles.backButton} onClick={() => navigate('/')}>
          Back
        </button>
      </div>
    </div>
  );
}
