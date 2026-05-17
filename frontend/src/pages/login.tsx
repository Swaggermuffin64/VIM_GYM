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
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"JetBrains Mono", monospace',
    padding: '24px',
    boxSizing: 'border-box',
  },
  card: {
    display: 'flex',
    width: '100%',
    maxWidth: '860px',
    border: `1px solid ${colors.border}`,
    borderRadius: '16px',
    overflow: 'hidden',
  },
  leftPanel: {
    flex: '1.1',
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    borderRight: `1px solid ${colors.border}`,
    padding: '48px 40px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  title: {
    fontSize: '28px',
    fontWeight: 800,
    color: colors.textPrimary,
    margin: '0 0 6px',
    letterSpacing: '-1px',
  },
  tagline: {
    fontSize: '13px',
    color: colors.textSecondary,
    margin: '0 0 36px',
  },
  statNumber: {
    fontSize: '48px',
    fontWeight: 800,
    color: '#7c3aed',
    lineHeight: 1,
    margin: '0 0 4px',
  },
  statLabel: {
    fontSize: '12px',
    color: '#888',
    margin: '0 0 28px',
  },
  bullets: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '14px',
  },
  bullet: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
  },
  bulletCheck: {
    color: '#4ade80',
    fontSize: '14px',
    marginTop: '1px',
    flexShrink: 0,
  },
  bulletTitle: {
    fontSize: '12px',
    color: colors.textPrimary,
    fontWeight: 600,
    margin: '0 0 2px',
  },
  bulletDesc: {
    fontSize: '11px',
    color: colors.textMuted,
    lineHeight: 1.4,
    margin: 0,
  },
  rightPanel: {
    flex: 1,
    background: '#09090f',
    padding: '48px 40px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  heading: {
    fontSize: '20px',
    fontWeight: 700,
    color: colors.textPrimary,
    margin: '0 0 6px',
  },
  subtitle: {
    fontSize: '13px',
    color: colors.textSecondary,
    margin: '0 0 28px',
  },
  buttons: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    marginBottom: '20px',
  },
  googleButton: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '6px',
    border: 'none',
    background: '#24292f',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'background 0.2s ease',
    boxSizing: 'border-box' as const,
  },
  githubButton: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '6px',
    border: 'none',
    background: '#24292f',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'background 0.2s ease',
    boxSizing: 'border-box' as const,
  },
  legal: {
    fontSize: '11px',
    color: '#333',
    lineHeight: 1.6,
    margin: 0,
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
        {/* Left — branding */}
        <div style={styles.leftPanel}>
          <h1 style={styles.title}>VIM_GYM</h1>
          <p style={styles.tagline}>Train your Vim muscles.</p>

          <p style={styles.statNumber}>10,000+</p>
          <p style={styles.statLabel}>players so far</p>

          <div style={styles.bullets}>
            <div style={styles.bullet}>
              <span style={styles.bulletCheck}>✓</span>
              <div>
                <p style={styles.bulletTitle}>Free to play</p>
                <p style={styles.bulletDesc}>
                  Core gameplay is always free. No limits.
                </p>
              </div>
            </div>
            <div style={styles.bullet}>
              <span style={styles.bulletCheck}>✓</span>
              <div>
                <p style={styles.bulletTitle}>Open source</p>
                <p style={styles.bulletDesc}>
                  Built in the open. Contribute on GitHub.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right — sign in */}
        <div style={styles.rightPanel}>
          <h2 style={styles.heading}>Welcome back</h2>
          <p style={styles.subtitle}>Sign in to track scores and compete.</p>

          <div style={styles.buttons}>
            <button
              style={styles.googleButton}
              onClick={() => signIn('google')}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#32383f';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#24292f';
              }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
                <path fill="none" d="M0 0h48v48H0z" />
              </svg>
              Continue with Google
            </button>

            <button
              style={styles.githubButton}
              onClick={() => signIn('github')}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#32383f';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#24292f';
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Continue with GitHub
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
