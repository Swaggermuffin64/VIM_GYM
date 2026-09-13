/**
 * Profile page: identity header (inline-editable display name,
 * premium badge, member-since) plus three headline stats and recent games
 * (spec: docs/superpowers/specs/2026-08-08-profile-page-revamp-design.md).
 *
 * Fetches /api/user/me for identity and /api/user/stats for the stats
 * sections; a stats failure degrades to identity-only.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { SiteBanner } from '../components/SiteBanner';
import { colors } from '../theme';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

interface RecentGame {
  play_mode: string;
  position: number | null;
  finished: boolean;
  left_race: boolean;
  total_time_ms: number | null;
  started_at: string;
}

/**
 * The slice of /api/user/stats the page displays. The endpoint returns more
 * (best race, task counts, keystroke efficiency); the profile deliberately
 * shows only the three headline numbers — how much you play, how often you
 * win, and how fast you are.
 */
interface PlayerStats {
  races_played: number;
  win_rate: number;
  /** Mean finished-session time across ALL modes, practice included. */
  avg_race_ms: number | null;
  recent_games: RecentGame[];
}

/** 61234 -> "1:01.2"; 4120 -> "4.1s". Race times get m:ss.t, short times s.t. */
export function formatDuration(ms: number): string {
  const tenths = Math.round(ms / 100); // deciseconds, rounded once
  const totalSec = Math.floor(tenths / 10);
  const frac = tenths % 10;
  if (totalSec < 60) return `${totalSec}.${frac}s`;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec - minutes * 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${frac}`;
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 11 -> "11th", 21 -> "21st". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  const suffix =
    mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/** ISO date -> "Aug 8" style short label in the viewer's locale. */
function formatGameDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Result label for a recent-game row.
 *
 * Only multiplayer races carry a finishing position; solo modes (daily,
 * practice) always store position null. A completed solo run needs no
 * label — the recorded time already says it finished — so the `finished`
 * check returns an empty cell rather than falling through to DNF.
 */
function gameResultLabel(g: RecentGame): string {
  if (g.position !== null) return ordinal(g.position);
  if (g.finished) return '';
  if (g.left_race) return 'left';
  return 'DNF';
}

/** One tile in the profile stat row: big value, small uppercase label. */
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.tile}>
      <p style={styles.tileValue}>{value}</p>
      <p style={styles.tileLabel}>{label}</p>
    </div>
  );
}

interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_premium: boolean;
  has_completed_onboarding: boolean;
  created_at?: string;
}

/** "2026-05-01T..." -> "May 2026"; empty string when absent/invalid. */
function formatMemberSince(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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
    padding: '64px 32px',
    gap: '16px',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '40px',
    border: `1px solid ${colors.border}`,
    borderRadius: '16px',
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    minWidth: '360px',
    maxWidth: '640px',
    width: '100%',
  },
  name: {
    fontSize: '32px',
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
  },
  nameInput: {
    fontSize: '26px',
    fontWeight: 700,
    color: colors.textPrimary,
    background: colors.bgCard,
    border: `1px solid ${colors.borderLight}`,
    borderRadius: '8px',
    padding: '6px 10px',
    fontFamily: 'inherit',
    width: '280px',
  },
  smallButton: {
    fontSize: '15px',
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    background: colors.primary,
    color: '#000',
    fontWeight: 700,
    fontFamily: 'inherit',
  },
  smallButtonMuted: {
    fontSize: '15px',
    padding: '8px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    background: 'transparent',
    color: colors.textSecondary,
    border: `1px solid ${colors.border}`,
    fontFamily: 'inherit',
  },
  iconButton: {
    background: 'transparent',
    border: 'none',
    color: colors.textMuted,
    cursor: 'pointer',
    fontSize: '20px',
    padding: '4px',
  },
  memberSince: {
    fontSize: '15px',
    color: colors.textMuted,
    margin: '4px 0 0',
  },
  editError: {
    fontSize: '15px',
    color: '#f87171',
    margin: '4px 0 0',
  },
  tileGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    width: '100%',
    maxWidth: '640px',
  },
  tileRow: {
    display: 'flex',
    gap: '12px',
    width: '100%',
    flexWrap: 'wrap' as const,
  },
  tile: {
    flex: '1 1 120px',
    padding: '20px 16px',
    textAlign: 'center' as const,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    background: colors.bgCard,
  },
  tileValue: {
    fontSize: '36px',
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
  },
  tileLabel: {
    fontSize: '14px',
    color: colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    margin: '4px 0 0',
  },
  /**
   * The recent-games list is a single four-column grid (mode / result /
   * time / date) so every row shares the same column widths. Rows are
   * plain cells, not nested grids — see the render for why.
   */
  recentCard: {
    width: '100%',
    maxWidth: '640px',
    padding: '20px 24px',
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    background: colors.bgCard,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto auto',
    columnGap: '20px',
    rowGap: '10px',
    fontSize: '16px',
    alignItems: 'center',
  },
  /** Section heading, spanning all four columns of the grid above. */
  recentHeading: {
    gridColumn: '1 / -1',
    fontSize: '14px',
    color: colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    margin: 0,
    fontWeight: 700,
  },
  gameMode: { textTransform: 'capitalize' as const },
  // The three trailing columns are right-aligned so their ragged-length
  // values ("1st"/"DNF", "4.1s"/"1:15.0", "Sep 8"/"Sep 12") end flush.
  gameResult: { justifySelf: 'end' as const },
  gameTime: { justifySelf: 'end' as const },
  gameDate: { justifySelf: 'end' as const, color: colors.textMuted },
  backButton: {
    width: '100%',
    maxWidth: '640px',
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
  premiumBadge: {
    marginLeft: 'auto',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    background: `${colors.primary}20`,
    color: colors.primaryLight,
    border: `1px solid ${colors.primary}40`,
  },
};

export default function ProfilePage() {
  const navigate = useNavigate();
  const { session, applyProfileUpdate } = useAuth();
  const accessToken = session?.access_token ?? null;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Inline name editing
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${BACKEND_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((data: { success: boolean; profile?: Profile; error?: string }) => {
        if (data.success && data.profile) setProfile(data.profile);
        else setError(data.error ?? 'Failed to load profile');
      })
      .catch(() => setError('Network error'));
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${BACKEND_URL}/api/user/stats`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((data: { success: boolean; stats?: PlayerStats }) => {
        if (data.success && data.stats) setStats(data.stats);
        // Failure: leave stats null — page renders identity-only.
      })
      .catch(() => {});
  }, [accessToken]);

  const startEditing = () => {
    setNameDraft(profile?.display_name ?? '');
    setEditError(null);
    setEditing(true);
  };

  const saveName = async () => {
    if (!accessToken) return;
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/user/profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ display_name: nameDraft }),
      });
      const data: { success: boolean; profile?: Profile; error?: string } =
        await res.json();
      if (data.success && data.profile) {
        setProfile((prev) => ({ ...prev, ...data.profile! }));
        // Sync the shared auth profile so the site banner shows the new name
        applyProfileUpdate(data.profile);
        setEditing(false);
      } else {
        setEditError(data.error ?? 'Failed to save name');
      }
    } catch {
      setEditError('Network error');
    } finally {
      setSaving(false);
    }
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

  const memberSince = formatMemberSince(profile.created_at);

  return (
    <div style={styles.container}>
      <SiteBanner />
      <div style={styles.mainContent}>
        <div style={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div>
              {editing ? (
                <div
                  style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                >
                  <input
                    aria-label="Display name"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    maxLength={30}
                    style={styles.nameInput}
                  />
                  <button
                    onClick={saveName}
                    disabled={saving}
                    style={styles.smallButton}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    style={styles.smallButtonMuted}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div
                  style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                >
                  <h1 style={styles.name}>{profile.display_name}</h1>
                  <button
                    aria-label="Edit name"
                    onClick={startEditing}
                    style={styles.iconButton}
                  >
                    ✎
                  </button>
                </div>
              )}
              {editError && <p style={styles.editError}>{editError}</p>}
              {memberSince && (
                <p style={styles.memberSince}>Member since {memberSince}</p>
              )}
            </div>
            {profile.is_premium && (
              <span style={styles.premiumBadge}>Premium</span>
            )}
          </div>
        </div>
        {stats && (
          <>
            <div style={styles.tileGroup}>
              <div style={styles.tileRow}>
                <StatTile label="Races" value={String(stats.races_played)} />
                <StatTile
                  label="Win rate"
                  value={`${Math.round(stats.win_rate * 100)}%`}
                />
                <StatTile
                  label="Avg race"
                  value={
                    stats.avg_race_ms !== null
                      ? formatDuration(stats.avg_race_ms)
                      : '—'
                  }
                />
              </div>
            </div>
            {stats.recent_games.length > 0 && (
              // One grid for the whole list — a grid per row would size its
              // columns to that row's own text, so "Sep 8" and "Sep 12" (or
              // "DNF" and "1st") would not line up down the card.
              <div style={styles.recentCard}>
                <p style={styles.recentHeading}>Recent games</p>
                {stats.recent_games.map((g, i) => {
                  const rowColor =
                    g.play_mode === 'practice'
                      ? colors.textMuted
                      : colors.textPrimary;
                  return (
                    <React.Fragment key={i}>
                      <span style={{ ...styles.gameMode, color: rowColor }}>
                        {g.play_mode.replaceAll('_', ' ')}
                      </span>
                      <span
                        style={{
                          ...styles.gameResult,
                          color:
                            g.position === 1 ? colors.successLight : rowColor,
                        }}
                      >
                        {gameResultLabel(g)}
                      </span>
                      <span style={{ ...styles.gameTime, color: rowColor }}>
                        {g.total_time_ms !== null
                          ? formatDuration(g.total_time_ms)
                          : '—'}
                      </span>
                      <span style={styles.gameDate}>
                        {formatGameDate(g.started_at)}
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </>
        )}
        <button style={styles.backButton} onClick={() => navigate('/')}>
          Back
        </button>
      </div>
    </div>
  );
}
