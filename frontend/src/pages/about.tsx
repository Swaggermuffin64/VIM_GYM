import React from 'react';
import { colors } from '../theme';
import { SiteBanner } from '../components/SiteBanner';

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${colors.bgDark} 0%, #0f0f1a 100%)`,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '64px 32px',
    position: 'relative' as const,
  },
  bgGlow1: {
    position: 'absolute' as const,
    top: '5%',
    left: '15%',
    width: '400px',
    height: '400px',
    background: `radial-gradient(circle, ${colors.primaryGlow} 0%, transparent 70%)`,
    filter: 'blur(80px)',
    pointerEvents: 'none' as const,
    animation:
      'float 15s ease-in-out infinite, pulse-glow 4s ease-in-out infinite',
  },
  bgGlow2: {
    position: 'absolute' as const,
    bottom: '15%',
    right: '10%',
    width: '400px',
    height: '400px',
    background: `radial-gradient(circle, ${colors.secondaryGlow} 0%, transparent 70%)`,
    filter: 'blur(80px)',
    pointerEvents: 'none' as const,
    animation:
      'float 18s ease-in-out infinite reverse, pulse-glow 5s ease-in-out infinite 1s',
  },
  content: {
    position: 'relative' as const,
    zIndex: 1,
    maxWidth: '800px',
    width: '100%',
  },
  pageTitle: {
    fontSize: '40px',
    fontWeight: 800,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    letterSpacing: '-1.5px',
    marginBottom: '12px',
    animation: 'title-glow 3s ease-in-out infinite',
  },
  pageLead: {
    fontSize: '18px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
    lineHeight: 1.8,
    marginBottom: '56px',
    maxWidth: '700px',
  },
  section: {
    marginBottom: '48px',
  },
  sectionTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  sectionText: {
    fontSize: '16px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
    lineHeight: 1.9,
    margin: 0,
  },
  divider: {
    width: '100%',
    height: '1px',
    background: `linear-gradient(90deg, transparent, ${colors.border}, transparent)`,
    marginBottom: '48px',
  },
  roadmap: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0px',
    marginTop: '24px',
    position: 'relative' as const,
    paddingLeft: '32px',
  },
  roadmapLine: {
    position: 'absolute' as const,
    left: '7px',
    top: '8px',
    bottom: '8px',
    width: '2px',
    background: `linear-gradient(180deg, ${colors.primary}, ${colors.secondary}, ${colors.warning})`,
    opacity: 0.4,
  },
  roadmapItem: {
    position: 'relative' as const,
    padding: '20px 24px',
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    marginBottom: '16px',
    transition: 'all 0.3s ease',
  },
  roadmapDot: {
    position: 'absolute' as const,
    left: '-32px',
    top: '26px',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    border: `2px solid ${colors.bgDark}`,
    zIndex: 1,
  },
  roadmapTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
    marginBottom: '6px',
  },
  roadmapDescription: {
    fontSize: '14px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
    lineHeight: 1.7,
    margin: 0,
  },
  donateButton: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '14px 36px',
    background: `linear-gradient(135deg, ${colors.primary}, ${colors.primaryLight})`,
    color: colors.bgDark,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '15px',
    fontWeight: 700,
    border: 'none',
    borderRadius: '10px',
    textDecoration: 'none',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    letterSpacing: '0.3px',
  },
};

function About() {
  return (
    <div style={styles.container}>
      <SiteBanner />

      <div style={styles.mainContent}>
        {/* Background glow effects */}
        <div style={styles.bgGlow1} />
        <div style={styles.bgGlow2} />

        <div style={styles.content}>
          {/* What Is VIM_GYM */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>What is VIM_GYM?</h2>
            <p style={styles.sectionText}>
              Sharpen your Vim motions by racing yourself or others! VIM_GYM is
              an game designed for developers to learn + speed up their Vim
              editing skills. Whether you&apos;re a beginner learning the basics
              or an experienced user looking to push your speed, VIM_GYM tests
              your navigation, editing, and deletion ability in code
              environments.
            </p>
          </div>

          <div style={styles.divider} />

          {/* Why Vim */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Why practice vim?</h2>
            <p style={styles.sectionText}>
              Learning Vim motions can drastically speed up every developers
              development productivity. Even if you don&apos;t use a
              terminal-based editor, Vim motions are available in most widely
              used editors and dramatically increase development speed. Vim has
              also become even more valuable in the age of AI coding assistants:
              AI can generate code quickly, but developers still need to
              navigate, review, and refine that output.
            </p>
          </div>

          <div style={styles.divider} />

          {/* Future */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Future</h2>
            <p style={styles.sectionText}>
              VIM_GYM is actively being developed. Here&apos;s what&apos;s on
              the roadmap:
            </p>
            <div style={styles.roadmap}>
              <div style={styles.roadmapLine} />

              <div
                style={styles.roadmapItem}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = colors.primary;
                  e.currentTarget.style.boxShadow = `0 4px 20px ${colors.primaryGlow}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = colors.border;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div
                  style={{ ...styles.roadmapDot, background: colors.primary }}
                />
                <div style={styles.roadmapTitle}>More Complex Tasks</div>
                <p style={styles.roadmapDescription}>
                  Text insertion, substitution, macro challenges, and multi-file
                  editing.
                </p>
              </div>

              <div
                style={styles.roadmapItem}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = colors.secondary;
                  e.currentTarget.style.boxShadow = `0 4px 20px ${colors.secondaryGlow}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = colors.border;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div
                  style={{ ...styles.roadmapDot, background: colors.secondary }}
                />
                <div style={styles.roadmapTitle}>User Accounts</div>
                <p style={styles.roadmapDescription}>
                  Save your progress, stats, and personal bests.
                </p>
              </div>

              <div
                style={styles.roadmapItem}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = colors.warning;
                  e.currentTarget.style.boxShadow = `0 4px 20px rgba(251, 191, 36, 0.2)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = colors.border;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div
                  style={{ ...styles.roadmapDot, background: colors.warning }}
                />
                <div style={styles.roadmapTitle}>Ranked</div>
                <p style={styles.roadmapDescription}>
                  Ranked racing with skill-based matchmaking.
                </p>
              </div>
            </div>{' '}
          </div>

          <div style={styles.divider} />

          {/* Why Support */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Support</h2>
            <p style={styles.sectionText}>
              VIM_GYM is free and will always stay free. But as the project
              grows, so will the cost of servers. I&apos;m looking into many
              ways to sustain donations, were the fastest and simplest.
            </p>
            <p style={{ ...styles.sectionText, marginTop: '16px' }}>
              If you like the project and would like to see it go further, I
              truly appreciate anything you can give! Thank you so much for your
              help.
            </p>
            <div style={{ marginTop: '28px' }}>
              <a
                href="https://buymeacoffee.com/jacksonfisk"
                target="_blank"
                rel="noopener noreferrer"
                style={styles.donateButton}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = `0 8px 30px ${colors.primaryGlow}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                Support VIM_GYM
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default About;
