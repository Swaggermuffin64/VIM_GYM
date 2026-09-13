import React from 'react';
import { Link } from 'react-router-dom';

import { colors } from '../../theme';
import { SiteBanner } from '../../components/SiteBanner';
import { PageMeta } from '../../seo/PageMeta';

/**
 * The logged-out view of /practice — indexable copy describing practice mode.
 *
 * Must stay free of CodeMirror, socket.io and Supabase imports: this module is
 * rendered in Node by the prerender step, and a browser-only import here fails
 * the build.
 */
const DRILLS = [
  {
    keys: 'w · b · e',
    label: 'Word motions',
    blurb: 'Jump between words instead of holding down the arrow keys.',
  },
  {
    keys: 'f · t · ;',
    label: 'Find on line',
    blurb: 'Land on any character in a line with two keystrokes.',
  },
  {
    keys: 'ci" · da( · yi{',
    label: 'Text objects',
    blurb: 'Change, delete, and yank whole structures in one command.',
  },
  {
    keys: 'gg · G · }',
    label: 'File navigation',
    blurb: 'Move across a file without reaching for the mouse.',
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

export default function PracticePublic() {
  return (
    <div style={styles.container}>
      <PageMeta route="/practice" />
      <SiteBanner />
      <main style={styles.main}>
        <h1 style={styles.h1}>Practice Vim motions solo</h1>
        <p style={styles.lede}>
          Practice mode gives you real editing tasks and one job: get from the
          starting text to the target text in as few keystrokes as you can.
          There is no timer pressure and no opponent — just the same small
          problems, repeated until the motions become automatic.
        </p>
        <p style={styles.lede}>
          After every task VIMGYM shows the keystrokes you used next to the
          sequence an expert would have used, so you find out which motion you
          should have reached for while the task is still fresh. That feedback
          loop is the whole point: most people plateau in Vim because nothing
          ever tells them a shorter path existed.
        </p>
        <Link to="/login" style={styles.cta}>
          Sign in to start practising
        </Link>

        <h2 style={styles.h2}>What you will drill</h2>
        <div style={styles.grid}>
          {DRILLS.map((drill) => (
            <div key={drill.label} style={styles.card}>
              <div style={styles.keys}>{drill.keys}</div>
              <p style={styles.cardLabel}>{drill.label}</p>
              <p style={styles.cardBlurb}>{drill.blurb}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
