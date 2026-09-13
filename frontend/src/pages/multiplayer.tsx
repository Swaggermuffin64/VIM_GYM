import React, { Suspense } from 'react';

import { useAuth } from '../contexts/AuthContext';
import { AuthGuard } from '../components/AuthGuard';
import { BrandedLoading } from '../components/BrandedLoading';
import MultiplayerPublic from './multiplayer/MultiplayerPublic';

// Lazy so the public view does not depend on the game module. The bundle will
// not actually split until the gated routes in App.tsx are lazy-loaded too
// (other modules import CodeMirror eagerly), but this keeps the public path
// free of browser-only imports for the prerender step.
const MultiplayerGame = React.lazy(
  () => import('./multiplayer/MultiplayerGame')
);

/**
 * Route component for `/multiplayer`.
 *
 * Logged-out visitors get indexable marketing copy describing races; signed-in
 * users get the game. The branch is on session state only — serving crawlers
 * something different from humans would be cloaking.
 */
export default function MultiplayerPage() {
  const { session, loading } = useAuth();

  if (loading) return <BrandedLoading />;
  if (!session) return <MultiplayerPublic />;

  return (
    <AuthGuard>
      <Suspense fallback={<BrandedLoading />}>
        <MultiplayerGame />
      </Suspense>
    </AuthGuard>
  );
}
