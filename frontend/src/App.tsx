import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import PracticeEditor from './pages/practice';
import MultiplayerGame from './pages/multiplayer';
import About from './pages/about';
import { LeaderboardTable } from './components/LeaderboardTable';
import { SiteBanner } from './components/SiteBanner';
import { colors } from './theme';
import Login from './pages/login';
import PrivacyPolicy from './pages/privacy';
import TermsOfService from './pages/terms';
import ProfilePage from './pages/profile';
import Onboarding from './pages/onboarding';
import { AuthGuard } from './components/AuthGuard';
import './App.css';

/* ------------------------------------------------------------------ */
/*  Home page (game mode cards + leaderboard)                         */
/* ------------------------------------------------------------------ */

const playStyles: Record<string, React.CSSProperties> = {
  leaderboardWrap: {
    width: '100%',
    maxWidth: '836px',
    marginTop: '24px',
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '16px 20px',
  },
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
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12vh 32px 32px',
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
  content: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
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
    flexWrap: 'wrap',
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
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
  },
  cardGlow: {
    position: 'absolute',
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
    textTransform: 'uppercase',
  },
};

function PlayHome() {
  return (
    <div style={playStyles.container}>
      <SiteBanner />

      <div style={playStyles.mainContent}>
        <div style={playStyles.bgGlow1} />
        <div style={playStyles.bgGlow2} />

        <div style={playStyles.content}>
          <h1
            style={{
              position: 'absolute',
              width: '1px',
              height: '1px',
              overflow: 'hidden',
              clip: 'rect(0,0,0,0)',
              whiteSpace: 'nowrap',
            }}
          >
            Practice Vim Motions Online — VIMGYM
          </h1>
          <div style={playStyles.header}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <h1 style={playStyles.title}>VIM_GYM</h1>
            </div>
            <p style={playStyles.subtitle}>Train your Vim muscles.</p>
          </div>

          <div style={playStyles.buttons}>
            {/* Quick Play */}
            <Link to="/multiplayer?mode=quick" style={playStyles.cardLink}>
              <div
                style={playStyles.card}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform =
                    'translateY(-6px) scale(1.02)';
                  e.currentTarget.style.borderColor = colors.success;
                  e.currentTarget.style.boxShadow = `0 12px 40px ${colors.successGlow}, inset 0 1px 0 rgba(255,255,255,0.1)`;
                  const glow = e.currentTarget.querySelector(
                    '.card-glow'
                  ) as HTMLElement;
                  if (glow)
                    glow.style.background = `linear-gradient(90deg, transparent, ${colors.success}, transparent)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.borderColor = colors.border;
                  e.currentTarget.style.boxShadow = 'none';
                  const glow = e.currentTarget.querySelector(
                    '.card-glow'
                  ) as HTMLElement;
                  if (glow) glow.style.background = 'transparent';
                }}
              >
                <div className="card-glow" style={playStyles.cardGlow} />
                <div style={playStyles.cardTitle}>Quick Play</div>
                <div style={playStyles.cardDescription}>
                  Match and compete with other players online. VIM-mog your
                  opponent.
                </div>
                <div
                  style={{
                    ...playStyles.badge,
                    background: `${colors.success}15`,
                    color: colors.successLight,
                    border: `1px solid ${colors.success}40`,
                  }}
                >
                  Fastest
                </div>
              </div>
            </Link>

            {/* Private Match */}
            <Link to="/multiplayer?mode=private" style={playStyles.cardLink}>
              <div
                style={playStyles.card}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform =
                    'translateY(-6px) scale(1.02)';
                  e.currentTarget.style.borderColor = colors.secondary;
                  e.currentTarget.style.boxShadow = `0 12px 40px ${colors.secondaryGlow}, inset 0 1px 0 rgba(255,255,255,0.1)`;
                  const glow = e.currentTarget.querySelector(
                    '.card-glow'
                  ) as HTMLElement;
                  if (glow)
                    glow.style.background = `linear-gradient(90deg, transparent, ${colors.secondary}, transparent)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.borderColor = colors.border;
                  e.currentTarget.style.boxShadow = 'none';
                  const glow = e.currentTarget.querySelector(
                    '.card-glow'
                  ) as HTMLElement;
                  if (glow) glow.style.background = 'transparent';
                }}
              >
                <div className="card-glow" style={playStyles.cardGlow} />
                <div style={playStyles.cardTitle}>Private Match</div>
                <div style={playStyles.cardDescription}>
                  Create a private room or join with a code.
                </div>
                <div
                  style={{
                    ...playStyles.badge,
                    background: `${colors.secondary}15`,
                    color: colors.secondaryLight,
                    border: `1px solid ${colors.secondary}40`,
                  }}
                >
                  With Friends
                </div>
              </div>
            </Link>

            {/* Practice */}
            <Link to="/practice" style={playStyles.cardLink}>
              <div
                style={playStyles.card}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform =
                    'translateY(-6px) scale(1.02)';
                  e.currentTarget.style.borderColor = colors.primary;
                  e.currentTarget.style.boxShadow = `0 12px 40px ${colors.primaryGlow}, inset 0 1px 0 rgba(255,255,255,0.1)`;
                  const glow = e.currentTarget.querySelector(
                    '.card-glow'
                  ) as HTMLElement;
                  if (glow)
                    glow.style.background = `linear-gradient(90deg, transparent, ${colors.primary}, transparent)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.borderColor = colors.border;
                  e.currentTarget.style.boxShadow = 'none';
                  const glow = e.currentTarget.querySelector(
                    '.card-glow'
                  ) as HTMLElement;
                  if (glow) glow.style.background = 'transparent';
                }}
              >
                <div className="card-glow" style={playStyles.cardGlow} />
                <div style={playStyles.cardTitle}>Practice</div>
                <div style={playStyles.cardDescription}>
                  Hone your Vim skills solo. Evaluate your speed and keystroke
                  efficiency.
                </div>
                <div
                  style={{
                    ...playStyles.badge,
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

          <div style={playStyles.leaderboardWrap}>
            <LeaderboardTable />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Router                                                            */
/* ------------------------------------------------------------------ */

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Public legal pages — registered with Google OAuth, so no AuthGuard */}
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route
          path="/"
          element={
            <AuthGuard>
              <PlayHome />
            </AuthGuard>
          }
        />
        <Route
          path="/about"
          element={
            <AuthGuard>
              <About />
            </AuthGuard>
          }
        />
        <Route
          path="/practice"
          element={
            <AuthGuard>
              <PracticeEditor />
            </AuthGuard>
          }
        />
        <Route
          path="/multiplayer"
          element={
            <AuthGuard>
              <MultiplayerGame />
            </AuthGuard>
          }
        />
        <Route
          path="/profile"
          element={
            <AuthGuard>
              <ProfilePage />
            </AuthGuard>
          }
        />
        <Route
          path="/onboarding"
          element={
            <AuthGuard>
              <Onboarding />
            </AuthGuard>
          }
        />
        {/* Keep old route for backwards compatibility */}
        <Route
          path="/vim-editor"
          element={
            <AuthGuard>
              <PracticeEditor />
            </AuthGuard>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
