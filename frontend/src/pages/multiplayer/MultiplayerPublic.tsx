import React from 'react';
import { Link } from 'react-router-dom';

import { colors } from '../../theme';
import { SiteBanner } from '../../components/SiteBanner';
import { PageMeta } from '../../seo/PageMeta';

/**
 * The logged-out view of /multiplayer — indexable copy describing races.
 *
 * Must stay free of CodeMirror, socket.io and Supabase imports: this module is
 * rendered in Node by the prerender step, and a browser-only import here fails
 * the build.
 */
const STEPS = [
  {
    n: '01',
    label: 'Get matched',
    blurb:
      'Quick play drops you into a race with another developer as soon as one is available, usually within seconds.',
  },
  {
    n: '02',
    label: 'Race the same tasks',
    blurb:
      'Both players get an identical set of editing challenges. First to finish them correctly wins the round.',
  },
  {
    n: '03',
    label: 'Compare keystrokes',
    blurb:
      'Afterwards you can replay each task side by side and see exactly where your opponent saved keystrokes.',
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
    maxWidth: '860px',
    width: '100%',
    margin: '0 auto',
    padding: '64px 32px',
  },
  h1: {
    fontSize: '40px',
    fontWeight: 800,
    color: colors.textPrimary,
    letterSpacing: '-1px',
    margin: 0,
  },
  lede: {
    fontSize: '16px',
    color: colors.textSecondary,
    lineHeight: 1.7,
    margin: '20px 0 0',
  },
  cta: {
    display: 'inline-block',
    marginTop: '28px',
    padding: '14px 32px',
    borderRadius: '8px',
    background: colors.primary,
    color: '#04141a',
    fontWeight: 700,
    textDecoration: 'none',
  },
  h2: {
    fontSize: '22px',
    fontWeight: 700,
    color: colors.textPrimary,
    margin: '56px 0 0',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '16px',
    marginTop: '24px',
  },
  card: {
    padding: '20px',
    borderRadius: '12px',
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
  },
  keys: { color: colors.primaryLight, fontSize: '15px', fontWeight: 700 },
  cardLabel: {
    color: colors.textPrimary,
    fontSize: '14px',
    fontWeight: 600,
    margin: '8px 0 0',
  },
  cardBlurb: {
    color: colors.textSecondary,
    fontSize: '13px',
    lineHeight: 1.6,
    margin: '6px 0 0',
  },
};

export default function MultiplayerPublic() {
  return (
    <div style={styles.container}>
      <PageMeta route="/multiplayer" />
      <SiteBanner />
      <main style={styles.main}>
        <h1 style={styles.h1}>Race other developers in Vim</h1>
        <p style={styles.lede}>
          Multiplayer turns Vim into a head-to-head game. You and an opponent
          get the same editing challenges at the same moment, and whoever
          transforms the text correctly first takes the round. It is the fastest
          way to find out which motions you actually reach for under pressure,
          rather than which ones you think you know.
        </p>
        <p style={styles.lede}>
          Quick play matches you with whoever is available. Private matches give
          you a room code to share, so you can race a colleague directly and
          settle it properly.
        </p>
        <Link to="/login" style={styles.cta}>
          Sign in to race
        </Link>

        <h2 style={styles.h2}>How a race works</h2>
        <div style={styles.grid}>
          {STEPS.map((step) => (
            <div key={step.n} style={styles.card}>
              <div style={styles.keys}>{step.n}</div>
              <p style={styles.cardLabel}>{step.label}</p>
              <p style={styles.cardBlurb}>{step.blurb}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
