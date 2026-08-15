/**
 * LegalPageLayout: shared shell for the public legal pages (/privacy,
 * /terms). Minimal top bar with the VIM_GYM wordmark linking home, then a
 * readable prose column. Deliberately NOT SiteBanner — these pages are
 * reachable logged-out (Google OAuth verification crawls them), so no
 * profile/sign-out links.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { colors } from '../theme';

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${colors.bgDark} 0%, #0f0f1a 100%)`,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '"JetBrains Mono", monospace',
  },
  topBanner: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '16px 32px',
    background: '#000000',
    flexShrink: 0,
  },
  bannerTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: colors.textPrimary,
    textDecoration: 'none',
  },
  main: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    padding: '48px 32px 96px',
  },
  content: {
    maxWidth: '700px',
    width: '100%',
  },
  title: {
    fontSize: '32px',
    fontWeight: 800,
    color: colors.textPrimary,
    letterSpacing: '-1px',
    marginBottom: '4px',
  },
  updated: {
    fontSize: '12px',
    color: colors.textMuted,
    marginBottom: '40px',
  },
};

/** Section heading + body styles exported for the page content. */
export const legalStyles: Record<string, React.CSSProperties> = {
  h2: {
    fontSize: '18px',
    fontWeight: 700,
    color: colors.textPrimary,
    margin: '36px 0 12px',
  },
  p: {
    fontSize: '14px',
    color: colors.textSecondary,
    lineHeight: 1.8,
    margin: '0 0 14px',
  },
  ul: {
    fontSize: '14px',
    color: colors.textSecondary,
    lineHeight: 1.8,
    margin: '0 0 14px',
    paddingLeft: '22px',
  },
  a: {
    color: colors.primaryLight,
  },
};

export function LegalPageLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.container}>
      <div style={styles.topBanner}>
        <Link to="/" style={styles.bannerTitle}>
          VIM_GYM
        </Link>
      </div>
      <div style={styles.main}>
        <div style={styles.content}>
          <h1 style={styles.title}>{title}</h1>
          <p style={styles.updated}>Last updated: {lastUpdated}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
