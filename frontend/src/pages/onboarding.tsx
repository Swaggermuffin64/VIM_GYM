import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { colors } from '../theme';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: '#000000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"JetBrains Mono", monospace',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    padding: '48px',
    border: `1px solid ${colors.border}`,
    borderRadius: '16px',
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    minWidth: '360px',
  },
  title: {
    fontSize: '22px',
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
  },
  label: {
    fontSize: '13px',
    color: colors.textSecondary,
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    background: '#111',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    color: colors.textPrimary,
    fontSize: '14px',
    fontFamily: '"JetBrains Mono", monospace',
    boxSizing: 'border-box',
  },
  button: {
    padding: '12px',
    background: colors.primary,
    border: 'none',
    borderRadius: '8px',
    color: '#000',
    fontSize: '14px',
    fontWeight: 700,
    fontFamily: '"JetBrains Mono", monospace',
    cursor: 'pointer',
  },
  error: {
    color: '#f87171',
    fontSize: '13px',
  },
};

export default function Onboarding() {
  const { session, user } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pre-fill from OAuth metadata
  useEffect(() => {
    if (user) {
      const meta = user.user_metadata as { full_name?: string; name?: string };
      setDisplayName(meta.full_name ?? meta.name ?? '');
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`${BACKEND_URL}/api/user/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ display_name: displayName }),
      });

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) {
        setError(data.error ?? 'Failed to save');
      } else {
        navigate('/');
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.container}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <h1 style={styles.title}>Choose your display name</h1>
        <div>
          <p style={styles.label}>
            This is how you&apos;ll appear on the leaderboard.
          </p>
          <input
            style={styles.input}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={32}
            required
            autoFocus
          />
        </div>
        {error && <p style={styles.error}>{error}</p>}
        <button style={styles.button} type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
