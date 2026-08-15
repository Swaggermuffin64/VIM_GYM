import React from 'react';
import { Link, Navigate } from 'react-router-dom';
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
    position: 'relative',
    overflow: 'hidden',
  },
  // Floating cyan/magenta glows matching the home page background
  // (App.tsx bgGlow1/bgGlow2).
  bgGlow1: {
    position: 'absolute',
    top: '10%',
    left: '10%',
    width: '500px',
    height: '500px',
    background: `radial-gradient(circle, ${colors.primaryGlow} 0%, transparent 70%)`,
    filter: 'blur(80px)',
    pointerEvents: 'none',
    animation:
      'float 15s ease-in-out infinite, pulse-glow 4s ease-in-out infinite',
  },
  bgGlow2: {
    position: 'absolute',
    bottom: '10%',
    right: '10%',
    width: '500px',
    height: '500px',
    background: `radial-gradient(circle, ${colors.secondaryGlow} 0%, transparent 70%)`,
    filter: 'blur(80px)',
    pointerEvents: 'none',
    animation:
      'float 18s ease-in-out infinite reverse, pulse-glow 5s ease-in-out infinite 1s',
  },
  // minHeight gives both columns room to breathe; each panel spreads its
  // content top/middle/bottom so the two sides' edges stay level.
  card: {
    display: 'flex',
    width: '100%',
    maxWidth: '860px',
    minHeight: '380px',
    border: `1px solid ${colors.border}`,
    borderRadius: '16px',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
  },
  // Mirrors the right panel's vertical span: the logo tops out level with
  // "Welcome back", the subtext bottoms out level with the legal text, and
  // the hero floats between them.
  leftPanel: {
    flex: '1.1',
    background: colors.bgDark,
    borderRight: `1px solid ${colors.border}`,
    padding: '48px 40px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  // The logo and heading rows share a fixed 40px height, and both middle
  // bands top-align with the same 40px offset, so the hero's first line
  // and the Google button share a top edge exactly.
  logoLabel: {
    fontSize: '28px',
    fontWeight: 800,
    color: colors.textPrimary,
    letterSpacing: '-1px',
    margin: 0,
    height: '40px',
    display: 'flex',
    alignItems: 'center',
  },
  heroBand: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'flex-start',
    paddingTop: '40px',
  },
  heroPhrase: {
    fontSize: '27px',
    fontWeight: 800,
    color: '#ffffff',
    lineHeight: 1.3,
    letterSpacing: '-0.5px',
    margin: 0,
  },
  heroCursor: {
    display: 'inline-block',
    width: '0.6em',
    animation: 'cursor-blink 1.1s step-end infinite',
  },
  heroPoints: {
    fontSize: '16px',
    color: colors.textSecondary,
    lineHeight: 1.6,
    margin: '24px 0 0',
    paddingLeft: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  // Mirrors leftPanel: heading pinned level with the logo, buttons in the
  // middle, legal text level with the bullet list at the bottom.
  rightPanel: {
    flex: 1,
    background: '#09090f',
    padding: '48px 40px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  heading: {
    fontSize: '20px',
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
    height: '40px',
    display: 'flex',
    alignItems: 'center',
  },
  buttons: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'flex-start',
    paddingTop: '40px',
    gap: '12px',
  },
  googleButton: {
    width: '100%',
    padding: '16px',
    borderRadius: '6px',
    border: 'none',
    background: '#24292f',
    color: '#ffffff',
    fontSize: '15px',
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
    padding: '16px',
    borderRadius: '6px',
    border: 'none',
    background: '#24292f',
    color: '#ffffff',
    fontSize: '15px',
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
  // 12px secondary gray clears WCAG AA contrast on the dark panel;
  // the previous 11px muted gray did not.
  legal: {
    fontSize: '12px',
    color: colors.textSecondary,
    lineHeight: 1.6,
    margin: 0,
  },
  // Underlined so links are distinguishable without relying on color
  // alone (WCAG 1.4.1).
  legalLink: {
    color: colors.textPrimary,
    textDecoration: 'underline',
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
      <div style={styles.bgGlow1} aria-hidden="true" />
      <div style={styles.bgGlow2} aria-hidden="true" />
      <div className="login-card" style={styles.card}>
        {/* Left — branding */}
        <div className="login-card-left" style={styles.leftPanel}>
          <p style={styles.logoLabel}>VIM_GYM</p>
          <div style={styles.heroBand}>
            <h1 style={styles.heroPhrase}>
              How fast are you,
              <br />
              <em>really</em>?<span style={styles.heroCursor}>&nbsp;</span>
            </h1>
          </div>
          <ul style={styles.heroPoints}>
            <li>Race people with VIM motions.</li>
            <li>Assert VIM dominance.</li>
            <li>Entirely free and open source.</li>
          </ul>
        </div>

        {/* Right — sign in */}
        <div style={styles.rightPanel}>
          <h2 style={styles.heading}>Sign in to compete.</h2>

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

          <p style={styles.legal}>
            By signing in you agree to our{' '}
            <Link to="/terms" style={styles.legalLink}>
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" style={styles.legalLink}>
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
