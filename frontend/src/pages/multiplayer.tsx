import React, { Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext';
import { AuthGuard } from '../components/AuthGuard';
import { BrandedLoading } from '../components/BrandedLoading';
import { Lobby } from '../components/Lobby';
import { PageMeta } from '../seo/PageMeta';
import { colors } from '../theme';

// Lazy so the lobby and the prerender do not pull in socket.io or CodeMirror.
const MultiplayerGame = React.lazy(
  () => import('./multiplayer/MultiplayerGame')
);

/** One-sentence explanation for visitors, shown under the lobby subtitle. */
const VISITOR_DESCRIPTION =
  'You and an opponent get the same Vim editing challenges at the same moment; the fastest correct motions win the round.';

/** Mirrors MultiplayerGame's page background so both lobbies look identical. */
const container: React.CSSProperties = {
  minHeight: '100vh',
  background: `linear-gradient(180deg, ${colors.bgDark} 0%, #0f0f1a 100%)`,
};

/**
 * The lobby as a visitor sees it: the same screen as a member, but there is
 * no socket, and every Find Match / Create / Join button leads to sign-in.
 * Rendered by the build-time prerender (PublicApp.tsx), so it has no
 * browser-only imports.
 */
export function SignedOutLobby() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') as 'quick' | 'private' | null;
  const toLogin = () => navigate('/login');

  return (
    <div style={container}>
      <PageMeta route="/multiplayer" />
      <Lobby
        isConnected={false}
        initialMode={mode}
        error={null}
        // The lobby hides the toggle for visitors; these satisfy the props.
        relativeLineNumbersEnabled={false}
        onRelativeLineNumbersChange={() => {}}
        playerName=""
        onCreateRoom={toLogin}
        onJoinRoom={toLogin}
        onQuickMatch={toLogin}
        onSignInRequired={toLogin}
        description={VISITOR_DESCRIPTION}
      />
    </div>
  );
}

/**
 * Route component for `/multiplayer`.
 *
 * Visitors get the lobby with sign-in buttons; members get the real game.
 * The branch is on session state only — never on user-agent, which would be
 * cloaking.
 */
export default function MultiplayerPage() {
  const { session, loading } = useAuth();

  if (loading) return <BrandedLoading />;
  if (!session) return <SignedOutLobby />;

  return (
    <AuthGuard>
      <PageMeta route="/multiplayer" />
      <Suspense fallback={<BrandedLoading />}>
        <MultiplayerGame />
      </Suspense>
    </AuthGuard>
  );
}
