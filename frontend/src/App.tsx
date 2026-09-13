import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/home';
import PracticeEditor from './pages/practice';
import MultiplayerGame from './pages/multiplayer';
import About from './pages/about';
import Login from './pages/login';
import PrivacyPolicy from './pages/privacy';
import TermsOfService from './pages/terms';
import ProfilePage from './pages/profile';
import DailyRacePage from './pages/daily';
import Onboarding from './pages/onboarding';
import { AuthGuard } from './components/AuthGuard';
import './App.css';

/* ------------------------------------------------------------------ */
/*  Scratch previews (dev only)                                       */
/* ------------------------------------------------------------------ */

/**
 * Every `src/pages/*.preview.tsx` is mounted, unauthenticated, at
 * `/preview/<name>` while running the dev server — a place to eyeball a screen
 * that is otherwise hard to reach (mid-race, out of attempts, signed out).
 *
 * These files are gitignored, so this glob legitimately matches nothing in a
 * clean checkout; discovering them beats importing them by name, which would
 * break the build for anyone who doesn't have them. The whole block is
 * compiled out of production builds.
 */
const previewRoutes = Object.entries(
  import.meta.env.DEV
    ? import.meta.glob<{ default: React.ComponentType }>(
        './pages/*.preview.tsx',
        { eager: true }
      )
    : {}
).map(([path, mod]) => {
  const name = path.replace('./pages/', '').replace('.preview.tsx', '');
  return (
    <Route key={name} path={`/preview/${name}`} element={<mod.default />} />
  );
});

/* ------------------------------------------------------------------ */
/*  Router                                                            */
/* ------------------------------------------------------------------ */

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        {previewRoutes}
        {/* Public legal pages — registered with Google OAuth, so no AuthGuard */}
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        {/* Public landing page; HomePage gates the signed-in menu itself. */}
        <Route path="/" element={<HomePage />} />
        {/* Public: indexable marketing copy, no session required. */}
        <Route path="/about" element={<About />} />
        <Route
          path="/practice"
          element={
            <AuthGuard>
              <PracticeEditor />
            </AuthGuard>
          }
        />
        <Route
          path="/daily"
          element={
            <AuthGuard>
              <DailyRacePage />
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
