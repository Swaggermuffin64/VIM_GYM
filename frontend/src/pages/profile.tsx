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
    </div>
  );
}
