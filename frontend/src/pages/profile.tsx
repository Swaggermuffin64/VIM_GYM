/**
 * Profile page: identity header (avatar, inline-editable display name,
 * premium badge, member-since) plus racing/task stats and recent games
 * (spec: docs/superpowers/specs/2026-08-08-profile-page-revamp-design.md).
 *
 * Fetches /api/user/me for identity and /api/user/stats for the stats
 * sections; a stats failure degrades to identity-only.
 */
import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
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

interface PlayerStats {
  races_played: number;
  wins: number;
  win_rate: number;
  best_race_ms: number | null;
  tasks_completed: number;
  avg_task_ms: number | null;
  recent_games: RecentGame[];
}

/** 61234 -> "1:01.2"; 4120 -> "4.1s". Race times get m:ss.t, short times s.t. */
function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th". */
function ordinal(n: number): string {
  const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/** ISO date -> "Aug 8" style short label in the viewer's locale. */
function formatGameDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Result label for a recent-game row: position, "left", "DNF", or mode. */
function gameResultLabel(g: RecentGame): string {
  if (g.play_mode === 'practice') return 'practice';
  if (g.position !== null) return ordinal(g.position);
  if (g.left_race) return 'left';
  return 'DNF';
}

/** One tile in the profile stat row: big value, small uppercase label. */
function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div style={styles.tile}>
      <p style={styles.tileValue}>{value}</p>
      <p style={styles.tileLabel}>{label}</p>
      {sub && <p style={styles.tileSub}>{sub}</p>}
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
    alignItems: 'center',
    padding: '80px 32px',
    gap: '16px',
    fontFamily: '"JetBrains Mono", monospace',
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
    fontSize: '24px',
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
  },
  avatar: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    border: `2px solid ${colors.border}`,
  },
  nameInput: {
    fontSize: '20px',
    fontWeight: 700,
    color: colors.textPrimary,
    background: colors.bgCard,
    border: `1px solid ${colors.borderLight}`,
    borderRadius: '8px',
    padding: '6px 10px',
    fontFamily: 'inherit',
    width: '220px',
  },
  smallButton: {
    padding: '6px 14px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    background: colors.primary,
    color: '#000',
    fontWeight: 700,
    fontFamily: 'inherit',
  },
  smallButtonMuted: {
    padding: '6px 14px',
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
    fontSize: '16px',
    padding: '4px',
  },
  memberSince: {
    fontSize: '12px',
    color: colors.textMuted,
    margin: '4px 0 0',
  },
  editError: {
    fontSize: '12px',
    color: '#f87171',
    margin: '4px 0 0',
  },
  tileRow: {
    display: 'flex',
    gap: '12px',
    width: '100%',
    maxWidth: '640px',
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
    fontSize: '28px',
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
  },
  tileLabel: {
    fontSize: '11px',
    color: colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    margin: '4px 0 0',
  },
  tileSub: { fontSize: '11px', color: colors.textMuted, margin: '2px 0 0' },
  recentCard: {
    width: '100%',
    maxWidth: '640px',
    padding: '20px 24px',
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    background: colors.bgCard,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  gameRow: {
    display: 'grid',
    gridTemplateColumns: '1fr auto auto auto',
    gap: '16px',
    fontSize: '13px',
    alignItems: 'center',
  },
  gameMode: { textTransform: 'capitalize' as const },
  label: {
    fontSize: '11px',
    color: colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    margin: 0,
    fontWeight: 700,
  },
  premiumBadge: {
    marginLeft: 'auto',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    background: `${colors.primary}20`,
    color: colors.primaryLight,
    border: `1px solid ${colors.primary}40`,
  },
};

export default function ProfilePage() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Inline name editing
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);

  useEffect(() => {
    if (!session) return;
    fetch(`${BACKEND_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((data: { success: boolean; profile?: Profile; error?: string }) => {
        if (data.success && data.profile) setProfile(data.profile);
        else setError(data.error ?? 'Failed to load profile');
      })
      .catch(() => setError('Network error'));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    fetch(`${BACKEND_URL}/api/user/stats`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((data: { success: boolean; stats?: PlayerStats }) => {
        if (data.success && data.stats) setStats(data.stats);
        // Failure: leave stats null — page renders identity-only.
      })
      .catch(() => {});
  }, [session]);

  const startEditing = () => {
    setNameDraft(profile?.display_name ?? '');
    setEditError(null);
    setEditing(true);
  };

  const saveName = async () => {
    if (!session) return;
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/user/profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ display_name: nameDraft }),
      });
      const data: { success: boolean; profile?: Profile; error?: string } =
        await res.json();
      if (data.success && data.profile) {
        setProfile((prev) => ({ ...prev, ...data.profile! }));
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
        <p
          style={{
            color: '#f87171',
            fontFamily: '"JetBrains Mono", monospace',
          }}
        >
          {error}
        </p>
      </div>
    );
  }

  if (!profile) {
    return <div style={styles.container} />;
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {profile.avatar_url && (
            <img src={profile.avatar_url} alt="avatar" style={styles.avatar} />
          )}
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
            {formatMemberSince(profile.created_at) && (
              <p style={styles.memberSince}>
                Member since {formatMemberSince(profile.created_at)}
              </p>
            )}
          </div>
          {profile.is_premium && (
            <span style={styles.premiumBadge}>Premium</span>
          )}
        </div>
      </div>
      {stats && (
        <>
          <div style={styles.tileRow}>
            <StatTile label="Races" value={String(stats.races_played)} />
            <StatTile label="Wins" value={String(stats.wins)} />
            <StatTile
              label="Win rate"
              value={`${Math.round(stats.win_rate * 100)}%`}
            />
            <StatTile
              label="Tasks"
              value={String(stats.tasks_completed)}
              sub={
                stats.avg_task_ms !== null
                  ? `avg ${formatDuration(stats.avg_task_ms)}`
                  : undefined
              }
            />
          </div>
          {stats.recent_games.length > 0 && (
            <div style={styles.recentCard}>
              <p style={styles.label}>Recent games</p>
              {stats.recent_games.map((g, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.gameRow,
                    color:
                      g.play_mode === 'practice'
                        ? colors.textMuted
                        : colors.textPrimary,
                  }}
                >
                  <span style={styles.gameMode}>
                    {g.play_mode.replace('_', ' ')}
                  </span>
                  <span
                    style={
                      g.position === 1
                        ? { color: colors.successLight }
                        : undefined
                    }
                  >
                    {gameResultLabel(g)}
                  </span>
                  <span>
                    {g.total_time_ms !== null
                      ? formatDuration(g.total_time_ms)
                      : '—'}
                  </span>
                  <span style={{ color: colors.textMuted }}>
                    {formatGameDate(g.started_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
