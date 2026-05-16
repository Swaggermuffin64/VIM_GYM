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
    maxWidth: '480px',
    width: '100%',
  },
  name: {
    fontSize: '24px',
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
  },
  badge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
  },
  avatar: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    border: `2px solid ${colors.border}`,
  },
  label: {
    fontSize: '12px',
    color: colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  value: {
    fontSize: '14px',
    color: colors.textPrimary,
  },
};

export default function ProfilePage() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        {profile.avatar_url && (
          <img src={profile.avatar_url} alt="avatar" style={styles.avatar} />
        )}
        <h1 style={styles.name}>{profile.display_name}</h1>
        {profile.is_premium && (
          <span
            style={{
              ...styles.badge,
              background: `${colors.primary}20`,
              color: colors.primaryLight,
              border: `1px solid ${colors.primary}40`,
            }}
          >
            Premium
          </span>
        )}
        <div>
          <p style={styles.label}>User ID</p>
          <p
            style={{
              ...styles.value,
              fontSize: '11px',
              wordBreak: 'break-all',
            }}
          >
            {profile.id}
          </p>
        </div>
      </div>
    </div>
  );
}
