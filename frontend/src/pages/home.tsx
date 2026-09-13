/**
 * Home page (/) — the main menu.
 *
 * A split layout: Race of the Day gets a tall featured panel on the left with
 * live attempt dots, a rollover countdown, and the page's only filled CTA;
 * the three evergreen modes sit as compact rows on the right. The all-time
 * leaderboard follows below. Extracted from App.tsx so that file is just the
 * router.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext';
import { colors } from '../theme';
import { fetchDailyRaceCached, fetchDailyLeaderboard } from '../api/daily';
import type { DailyRaceInfo } from '../api/daily';
import { useUtcMidnightCountdown } from '../lib/dailyCountdown';
import { LeaderboardTable } from '../components/LeaderboardTable';
import { SiteBanner } from '../components/SiteBanner';

/** The three always-available modes, in the order they appear on the right. */
const MODES = [
  {
    title: 'Quick Play',
    blurb: 'Match and compete with other players online.',
    to: '/multiplayer?mode=quick',
    accent: colors.success,
    accentLight: colors.successLight,
  },
  {
    title: 'Private Match',
    blurb: 'Create a private room or join with a code.',
    to: '/multiplayer?mode=private',
    accent: colors.secondary,
    accentLight: colors.secondaryLight,
  },
  {
    title: 'Practice',
    blurb: 'Hone your Vim skills solo.',
    to: '/practice',
    accent: colors.primary,
    accentLight: colors.primaryLight,
  },
];

export default function HomePage() {
  return (
    <div style={styles.container}>
      <SiteBanner />
      <div style={styles.bgGlow1} />
      <div style={styles.bgGlow2} />

      <div style={styles.mainContent}>
        <div style={styles.content}>
          {/* Keyword-bearing heading for search crawlers; the visible wordmark
              below is the branded one. */}
          <h1 style={styles.srOnly}>Practice Vim Motions Online — VIMGYM</h1>
          <header style={styles.header}>
            <h1 style={styles.title}>VIM_GYM</h1>
            <p style={styles.subtitle}>Train your Vim muscles.</p>
          </header>

          <div className="home-split" style={styles.split}>
            <DailyPanel />
            <div style={styles.modeList}>
              {MODES.map((mode) => (
                <ModeRow key={mode.title} {...mode} />
              ))}
            </div>
          </div>

          <div style={styles.leaderboardWrap}>
            <LeaderboardTable defaultOpen={false} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The featured Race of the Day panel. Reads today's race so it can show real
 * attempt dots and a live countdown; until that lands (or if it fails) it
 * falls back to static copy, so a slow or broken daily API never blocks the
 * menu. Uses the cached read, so bouncing between the menu and a race costs
 * one request per day rather than one per visit.
 */
function DailyPanel() {
  const { session } = useAuth();
  const [info, setInfo] = useState<DailyRaceInfo | null>(null);
  const countdown = useUtcMidnightCountdown(true);

  useEffect(() => {
    let cancelled = false;
    const token = session?.access_token;
    if (!token) return;
    void fetchDailyRaceCached(token).then((result) => {
      if (cancelled || result.status !== 'ok') return;
      setInfo(result.info);
    });
    // Warm the daily leaderboard cache (same slice the daily page shows) so
    // clicking through paints a fully-formed screen with no fetch waterfall.
    void fetchDailyLeaderboard(token, undefined, 8);
    return () => {
      cancelled = true;
    };
  }, [session]);

  const usedCount = info ? info.attempts.length : 0;
  const totalSlots = info ? usedCount + info.attemptsRemaining : 0;
  const outOfAttempts = info != null && info.attemptsRemaining === 0;

  return (
    <Link to="/daily" style={styles.panelLink}>
      <section style={styles.daily}>
        <div style={styles.eyebrow}>
          <span style={styles.liveDot} />
          Race of the Day
        </div>

        <div style={styles.dailyTitle}>
          Today&apos;s
          <br />
          race
        </div>

        {info ? (
          <div style={styles.attemptRow}>
            <span
              style={styles.attemptDots}
              aria-label={`${usedCount} of ${totalSlots} attempts used`}
            >
              {Array.from({ length: totalSlots }, (_, i) => (
                <span
                  key={i}
                  style={i < usedCount ? styles.dotUsed : styles.dotFree}
                >
                  {i < usedCount ? '●' : '○'}
                </span>
              ))}
            </span>
            <span style={styles.attemptText}>
              {outOfAttempts
                ? 'no attempts left'
                : `${info.attemptsRemaining} attempts left`}
            </span>
          </div>
        ) : (
          <div style={styles.attemptText}>
            One shared task set · three attempts
          </div>
        )}

        <span style={styles.dailyCta}>
          {outOfAttempts ? "See today's board" : 'Race now'}
        </span>

        <div style={styles.dailyFoot}>
          New race in <span style={styles.dailyFootTime}>{countdown}</span>
        </div>
      </section>
    </Link>
  );
}

/**
 * One mode card: an accent bar, the name and blurb, and a chevron that slides
 * on hover. Each is its own card so the three read as separate destinations,
 * while the bar/text/arrow rhythm keeps them a matched set.
 */
function ModeRow({
  title,
  blurb,
  to,
  accent,
  accentLight,
}: (typeof MODES)[number]) {
  return (
    <Link
      to={to}
      style={styles.rowLink}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent;
        e.currentTarget.style.boxShadow = `0 8px 24px ${accent}22`;
        const chevron = e.currentTarget.querySelector(
          '.mode-chevron'
        ) as HTMLElement;
        if (chevron) chevron.style.transform = 'translateX(4px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = colors.border;
        e.currentTarget.style.boxShadow = 'none';
        const chevron = e.currentTarget.querySelector(
          '.mode-chevron'
        ) as HTMLElement;
        if (chevron) chevron.style.transform = 'translateX(0)';
      }}
    >
      <span style={{ ...styles.rowBar, background: accent }} />
      <span style={styles.rowBody}>
        <span style={styles.rowTitle}>{title}</span>
        <span style={styles.rowBlurb}>{blurb}</span>
      </span>
      <span
        className="mode-chevron"
        style={{ ...styles.rowChevron, color: accentLight }}
        aria-hidden="true"
      >
        →
      </span>
    </Link>
  );
}

const MONO = '"JetBrains Mono", monospace';

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${colors.bgDark} 0%, #0f0f1a 100%)`,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
  },
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
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    // Top padding scales with viewport height so the menu sits comfortably
    // below the banner on laptops while still fitting without scrolling.
    padding: '10vh 32px 48px',
  },
  content: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    maxWidth: '1080px',
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0,0,0,0)',
    whiteSpace: 'nowrap',
  },
  header: { textAlign: 'center', marginBottom: '84px' },
  title: {
    fontSize: '60px',
    fontWeight: 800,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    letterSpacing: '-2px',
    margin: 0,
  },
  subtitle: {
    fontSize: '18px',
    color: colors.textSecondary,
    fontFamily: MONO,
    margin: '8px 0 0',
  },
  // Even columns so the seam between them lands under the centered title.
  split: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    width: '100%',
    alignItems: 'stretch',
  },

  // --- Daily panel ---
  panelLink: { textDecoration: 'none', display: 'flex' },
  daily: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    flex: 1,
    padding: '34px',
    borderRadius: '18px',
    border: `1px solid ${colors.warning}55`,
    background: `linear-gradient(160deg, ${colors.warning}16 0%, ${colors.bgGradientEnd} 65%)`,
    boxShadow: `0 0 40px ${colors.warning}20`,
    cursor: 'pointer',
  },
  eyebrow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    color: colors.warning,
    fontFamily: MONO,
  },
  liveDot: {
    width: '8px',
    height: '8px',
    borderRadius: '999px',
    background: colors.warning,
    boxShadow: `0 0 10px ${colors.warning}`,
    display: 'inline-block',
  },
  dailyTitle: {
    fontSize: '42px',
    fontWeight: 800,
    color: colors.textPrimary,
    fontFamily: MONO,
    letterSpacing: '-1.5px',
    lineHeight: 1.1,
  },
  attemptRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  attemptDots: {
    display: 'inline-flex',
    gap: '6px',
    fontSize: '17px',
    fontFamily: MONO,
  },
  dotUsed: { color: colors.warning },
  dotFree: { color: colors.textMuted },
  attemptText: {
    fontSize: '16px',
    color: colors.textSecondary,
    fontFamily: MONO,
  },
  dailyCta: {
    marginTop: 'auto',
    textAlign: 'center',
    padding: '18px 32px',
    fontSize: '18px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    color: colors.bgDark,
    background: `linear-gradient(135deg, ${colors.warning} 0%, #fbbf24 100%)`,
    borderRadius: '999px',
    fontFamily: MONO,
    boxShadow: `0 0 26px ${colors.warning}45`,
  },
  dailyFoot: { fontSize: '15px', color: colors.textMuted, fontFamily: MONO },
  dailyFootTime: { color: colors.warning, fontWeight: 700 },

  // --- Mode cards ---
  modeList: { display: 'flex', flexDirection: 'column', gap: '16px' },
  rowLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    // Zero basis so the three cards split the column evenly rather than each
    // keeping its content height plus a share of the slack.
    flex: '1 1 0',
    padding: '20px 24px',
    borderRadius: '14px',
    border: `1px solid ${colors.border}`,
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  },
  rowBar: { width: '4px', alignSelf: 'stretch', borderRadius: '999px' },
  rowBody: { display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 },
  rowTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: colors.textPrimary,
    fontFamily: MONO,
  },
  rowBlurb: {
    fontSize: '16px',
    color: colors.textSecondary,
    fontFamily: MONO,
    lineHeight: 1.5,
  },
  rowChevron: {
    fontFamily: MONO,
    fontSize: '20px',
    transition: 'transform 0.2s ease',
  },

  leaderboardWrap: {
    width: '100%',
    marginTop: '24px',
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '16px 20px',
  },
};
