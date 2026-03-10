import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import PracticeEditor from './pages/practice';
import MultiplayerGame from './pages/multiplayer';
import About from './pages/about';
import { colors } from './theme';
import './App.css';

function GitHubIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      style={style}
    >
      <path d="M12 .5a12 12 0 0 0-3.794 23.385c.6.111.82-.26.82-.577 0-.286-.011-1.043-.016-2.048-3.338.725-4.042-1.61-4.042-1.61-.546-1.386-1.334-1.755-1.334-1.755-1.09-.745.083-.73.083-.73 1.205.085 1.84 1.236 1.84 1.236 1.07 1.832 2.807 1.303 3.492.996.108-.775.418-1.303.762-1.603-2.665-.303-5.467-1.332-5.467-5.93 0-1.31.468-2.381 1.235-3.221-.124-.303-.535-1.523.117-3.176 0 0 1.008-.322 3.3 1.23a11.5 11.5 0 0 1 6.006 0c2.291-1.553 3.298-1.23 3.298-1.23.654 1.653.243 2.873.12 3.176.769.84 1.233 1.911 1.233 3.221 0 4.609-2.807 5.624-5.48 5.921.43.371.814 1.102.814 2.222 0 1.604-.015 2.899-.015 3.293 0 .319.216.694.825.576A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}

function DiscordIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      style={style}
    >
      <path d="M20.317 4.369A19.8 19.8 0 0 0 15.56 3a13.6 13.6 0 0 0-.605 1.244 18.3 18.3 0 0 0-5.91 0A13.6 13.6 0 0 0 8.44 3a19.7 19.7 0 0 0-4.758 1.369C.673 8.874-.15 13.267.262 17.61a19.9 19.9 0 0 0 5.834 2.931 14.5 14.5 0 0 0 1.25-2.035 12.8 12.8 0 0 1-1.968-.95c.166-.124.329-.253.487-.386 3.797 1.783 7.913 1.783 11.665 0 .16.133.322.262.488.386-.623.368-1.28.688-1.97.95.362.711.782 1.39 1.25 2.035a19.8 19.8 0 0 0 5.835-2.931c.483-5.04-.826-9.393-3.816-13.241Zm-11.54 10.577c-1.138 0-2.075-1.042-2.075-2.323S7.62 10.3 8.778 10.3c1.167 0 2.093 1.053 2.074 2.323.001 1.281-.926 2.323-2.074 2.323Zm6.445 0c-1.138 0-2.074-1.042-2.074-2.323s.918-2.323 2.074-2.323c1.167 0 2.093 1.053 2.074 2.323 0 1.281-.926 2.323-2.074 2.323Z" />
    </svg>
  );
}

const homeStyles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${colors.bgDark} 0%, #0f0f1a 100%)`,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  topBanner: {
    width: '100%',
    padding: '16px 32px',
    background: '#000000',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBannerTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
    margin: 0,
  },
  navLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: '32px',
  },
  navLink: {
    fontSize: '15px',
    fontWeight: 600,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
    textDecoration: 'none',
    textTransform: 'uppercase' as const,
    transition: 'color 0.2s ease',
  },
  navLinkWithIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  navIcon: {
    width: '16px',
    height: '16px',
    flexShrink: 0,
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
  },
  // Decorative background elements
  bgGlow1: {
    position: 'absolute' as const,
    top: '10%',
    left: '10%',
    width: '500px',
    height: '500px',
    background: `radial-gradient(circle, ${colors.primaryGlow} 0%, transparent 70%)`,
    filter: 'blur(80px)',
    pointerEvents: 'none' as const,
    animation: 'float 15s ease-in-out infinite, pulse-glow 4s ease-in-out infinite',
  },
  bgGlow2: {
    position: 'absolute' as const,
    bottom: '10%',
    right: '10%',
    width: '500px',
    height: '500px',
    background: `radial-gradient(circle, ${colors.secondaryGlow} 0%, transparent 70%)`,
    filter: 'blur(80px)',
    pointerEvents: 'none' as const,
    animation: 'float 18s ease-in-out infinite reverse, pulse-glow 5s ease-in-out infinite 1s',
  },
  content: {
    position: 'relative' as const,
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '48px',
  },
  titleContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  title: {
    fontSize: '56px',
    fontWeight: 800,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    letterSpacing: '-2px',
  },
  subtitle: {
    fontSize: '18px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
    maxWidth: '500px',
    lineHeight: 1.6,
  },
  buttons: {
    display: 'flex',
    gap: '24px',
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
    maxWidth: '1000px',
  },
  cardLink: {
    textDecoration: 'none',
    display: 'flex',
  },
  card: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '16px',
    padding: '28px',
    width: '260px',
    textDecoration: 'none',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column' as const,
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  cardGlow: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: '2px',
    background: 'transparent',
    transition: 'all 0.3s ease',
  },
  cardTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: colors.textPrimary,
    marginBottom: '8px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  cardDescription: {
    fontSize: '13px',
    color: colors.textMuted,
    lineHeight: 1.6,
    fontFamily: '"JetBrains Mono", monospace',
    flex: 1,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: '6px',
    padding: '5px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    marginTop: '16px',
    textTransform: 'uppercase' as const,
  },
};

function Home() {
  return (
    <div style={homeStyles.container}>
      {/* Top Banner */}
      <div style={homeStyles.topBanner}>
        <div style={homeStyles.topBannerTitle}>VIM_GYM</div>
        <div style={homeStyles.navLinks}>
          <a
            href="https://github.com/swaggermuffin64/vim-racing"
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...homeStyles.navLink, ...homeStyles.navLinkWithIcon }}
          >
            <GitHubIcon style={homeStyles.navIcon} />
            GITHUB
          </a>
          <a
            href="https://discord.gg/JNHRpdEbaG"
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...homeStyles.navLink, ...homeStyles.navLinkWithIcon }}
          >
            <DiscordIcon style={homeStyles.navIcon} />
            DISCORD
          </a>
          <Link to="/about" style={homeStyles.navLink}>
           ABOUT
          </Link>
          <a
            href="https://buymeacoffee.com/jacksonfisk"
            target="_blank"
            rel="noopener noreferrer"
            style={homeStyles.navLink}
          >
           SUPPORT 
          </a>
        </div>
      </div>

      <div style={homeStyles.mainContent}>
        {/* Background glow effects */}
        <div style={homeStyles.bgGlow1} />
        <div style={homeStyles.bgGlow2} />
        
        <div style={homeStyles.content}>
          {/* Header */}
          <div style={homeStyles.header}>
            <div style={homeStyles.titleContainer}>
              <h1 style={homeStyles.title}>VIM_GYM</h1>
            </div>
            <p style={homeStyles.subtitle}>
              Train your Vim muscles.
            </p>
          </div>
          
          {/* Game Mode Cards */}
          <div style={homeStyles.buttons}>
          {/* Quick Play Card */}
          <Link to="/multiplayer?mode=quick" style={homeStyles.cardLink}>
            <div
              style={homeStyles.card}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)';
                e.currentTarget.style.borderColor = colors.success;
                e.currentTarget.style.boxShadow = `0 12px 40px ${colors.successGlow}, inset 0 1px 0 rgba(255,255,255,0.1)`;
                const glow = e.currentTarget.querySelector('.card-glow') as HTMLElement;
                if (glow) glow.style.background = `linear-gradient(90deg, transparent, ${colors.success}, transparent)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.borderColor = colors.border;
                e.currentTarget.style.boxShadow = 'none';
                const glow = e.currentTarget.querySelector('.card-glow') as HTMLElement;
                if (glow) glow.style.background = 'transparent';
              }}
            >
              <div className="card-glow" style={homeStyles.cardGlow} />
              <div style={homeStyles.cardTitle}>Quick Play</div>
              <div style={homeStyles.cardDescription}>
                Jump into a match instantly. Get paired with another player automatically.
              </div>
              <div 
                style={{
                  ...homeStyles.badge,
                  background: `${colors.success}15`,
                  color: colors.successLight,
                  border: `1px solid ${colors.success}40`,
                }}
              >
                Fastest
              </div>
            </div>
          </Link>

          {/* Private Match Card */}
          <Link to="/multiplayer?mode=private" style={homeStyles.cardLink}>
            <div
              style={homeStyles.card}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)';
                e.currentTarget.style.borderColor = colors.secondary;
                e.currentTarget.style.boxShadow = `0 12px 40px ${colors.secondaryGlow}, inset 0 1px 0 rgba(255,255,255,0.1)`;
                const glow = e.currentTarget.querySelector('.card-glow') as HTMLElement;
                if (glow) glow.style.background = `linear-gradient(90deg, transparent, ${colors.secondary}, transparent)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.borderColor = colors.border;
                e.currentTarget.style.boxShadow = 'none';
                const glow = e.currentTarget.querySelector('.card-glow') as HTMLElement;
                if (glow) glow.style.background = 'transparent';
              }}
            >
              <div className="card-glow" style={homeStyles.cardGlow} />
              <div style={homeStyles.cardTitle}>Private Match</div>
              <div style={homeStyles.cardDescription}>
                Create a private room or join with a code. Challenge your friends!
              </div>
              <div 
                style={{
                  ...homeStyles.badge,
                  background: `${colors.secondary}15`,
                  color: colors.secondaryLight,
                  border: `1px solid ${colors.secondary}40`,
                }}
              >
                With Friends
              </div>
            </div>
          </Link>

          {/* Practice Card */}
          <Link to="/practice" style={homeStyles.cardLink}>
            <div
              style={homeStyles.card}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)';
                e.currentTarget.style.borderColor = colors.primary;
                e.currentTarget.style.boxShadow = `0 12px 40px ${colors.primaryGlow}, inset 0 1px 0 rgba(255,255,255,0.1)`;
                const glow = e.currentTarget.querySelector('.card-glow') as HTMLElement;
                if (glow) glow.style.background = `linear-gradient(90deg, transparent, ${colors.primary}, transparent)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.borderColor = colors.border;
                e.currentTarget.style.boxShadow = 'none';
                const glow = e.currentTarget.querySelector('.card-glow') as HTMLElement;
                if (glow) glow.style.background = 'transparent';
              }}
            >
              <div className="card-glow" style={homeStyles.cardGlow} />
              <div style={homeStyles.cardTitle}>Practice</div>
              <div style={homeStyles.cardDescription}>
                Hone your Vim skills. Complete navigation and deletion challenges.
              </div>
              <div 
                style={{
                  ...homeStyles.badge,
                  background: `${colors.primary}15`,
                  color: colors.primaryLight,
                  border: `1px solid ${colors.primary}40`,
                }}
              >
                Solo
              </div>
              </div>
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/practice" element={<PracticeEditor />} />
        <Route path="/multiplayer" element={<MultiplayerGame />} />
        {/* Keep old route for backwards compatibility */}
        <Route path="/vim-editor" element={<PracticeEditor />} />
      </Routes>
    </Router>
  );
}

export default App;
