import React from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { colors } from '../theme';

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: '#000000',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"JetBrains Mono", monospace',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '24px',
    padding: '48px',
    border: `1px solid ${colors.border}`,
    borderRadius: '16px',
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    minWidth: '320px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 800,
    color: colors.textPrimary,
    margin: 0,
    letterSpacing: '-1px',
  },
  subtitle: {
    fontSize: '14px',
    color: colors.textSecondary,
    margin: 0,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    padding: '12px 24px',
    borderRadius: '8px',
    border: `1px solid ${colors.border}`,
    background: 'transparent',
    color: colors.textPrimary,
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: '"JetBrains Mono", monospace',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    transition: 'border-color 0.2s ease, background 0.2s ease',
  },
};

export default function Login() {
  const { session } = useAuth();

  if (session) return <Navigate to="/" replace />;

  const signIn = (provider: 'github' | 'google') => {
    supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>VIM_GYM</h1>
        <p style={styles.subtitle}>Sign in to track scores and compete.</p>
        <button
          style={styles.button}
          onClick={() => signIn('github')}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = colors.primary;
            e.currentTarget.style.background = `${colors.primary}15`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = colors.border;
            e.currentTarget.style.background = 'transparent';
          }}
        >
          Sign in with GitHub
        </button>
        <button
          style={styles.button}
          onClick={() => signIn('google')}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = colors.secondary;
            e.currentTarget.style.background = `${colors.secondary}15`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = colors.border;
            e.currentTarget.style.background = 'transparent';
          }}
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
