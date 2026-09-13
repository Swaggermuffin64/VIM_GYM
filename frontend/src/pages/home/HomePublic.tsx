import React from 'react';
import { Link } from 'react-router-dom';

import { colors } from '../../theme';
import { SiteBanner } from '../../components/SiteBanner';
import { PageMeta } from '../../seo/PageMeta';
import { StructuredData } from '../../seo/StructuredData';

/** Warms the lazy route chunk so the first click does not wait on a download. */
const PREFETCH: Record<string, () => Promise<unknown>> = {
  '/practice': () => import('../practice/PracticeEditor'),
  '/multiplayer?mode=quick': () => import('../multiplayer/MultiplayerGame'),
};

/**
 * The logged-out home page — the landing page for search traffic.
 *
 * Deliberately free of auth and network calls so it can be rendered to static
 * HTML at build time (see scripts/prerender.mts). Do not import CodeMirror,
 * socket.io, or anything touching Supabase here; the prerender runs in Node
 * and a browser-only import will fail the build.
 */
const MODES = [
  {
    title: 'Practice',
    blurb:
      'Drill motions solo at your own pace, with instant feedback on the keystrokes an expert would have used.',
    to: '/practice',
    accent: colors.primary,
  },
  {
    title: 'Quick Play',
    blurb:
      'Match against another developer and race through the same editing challenges in real time.',
    to: '/multiplayer?mode=quick',
    accent: colors.success,
  },
  {
    title: 'Daily Race',
    blurb:
      'One shared set of challenges every day. Three attempts, one leaderboard, resets at midnight UTC.',
    to: '/login',
    accent: colors.secondary,
  },
];

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${colors.bgDark} 0%, #0f0f1a 100%)`,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '"JetBrains Mono", monospace',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '64px 32px',
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0,0,0,0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  title: {
    fontSize: '56px',
    fontWeight: 800,
    color: colors.textPrimary,
    letterSpacing: '-2px',
    margin: 0,
  },
  subtitle: {
    fontSize: '18px',
    color: colors.textSecondary,
    margin: '12px 0 0',
  },
  lede: {
    fontSize: '16px',
    color: colors.textSecondary,
    lineHeight: 1.7,
    maxWidth: '620px',
    textAlign: 'center',
    margin: '28px 0 0',
  },
  cta: {
    display: 'inline-block',
    marginTop: '32px',
    padding: '14px 32px',
    borderRadius: '8px',
    background: colors.primary,
    color: '#04141a',
    fontWeight: 700,
    fontSize: '15px',
    textDecoration: 'none',
  },
  modes: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '20px',
    maxWidth: '960px',
    width: '100%',
    marginTop: '64px',
  },
  modeCard: {
    display: 'block',
    padding: '24px',
    borderRadius: '12px',
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    textDecoration: 'none',
  },
  modeTitle: { fontSize: '18px', fontWeight: 700, margin: 0 },
  modeBlurb: {
    fontSize: '14px',
    color: colors.textSecondary,
    lineHeight: 1.6,
    margin: '10px 0 0',
  },
};

export default function HomePublic() {
  return (
    <div style={styles.container}>
      <PageMeta route="/" />
      <StructuredData />
      <SiteBanner />
      <div style={styles.main}>
        {/* Keyword-bearing heading for crawlers; the wordmark below is branded. */}
        <h1 style={styles.srOnly}>Practice Vim Motions Online — VIMGYM</h1>
        <div style={styles.title} aria-hidden="true">
          VIM_GYM
        </div>
        <p style={styles.subtitle}>Train your Vim muscles.</p>
        <p style={styles.lede}>
          VIMGYM turns Vim practice into a race. Work through real editing
          challenges against the clock or against other developers, and see the
          exact keystrokes an expert would have used on every task you finish.
        </p>
        <Link to="/login" style={styles.cta}>
          Sign in to start
        </Link>

        <div style={styles.modes}>
          {MODES.map((mode) => (
            <Link
              key={mode.title}
              to={mode.to}
              style={styles.modeCard}
              onMouseEnter={() => void PREFETCH[mode.to]?.()}
            >
              <h2 style={{ ...styles.modeTitle, color: mode.accent }}>
                {mode.title}
              </h2>
              <p style={styles.modeBlurb}>{mode.blurb}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
