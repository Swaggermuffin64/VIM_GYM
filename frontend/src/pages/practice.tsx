import React, { Suspense } from 'react';

import { useAuth } from '../contexts/AuthContext';
import { AuthGuard } from '../components/AuthGuard';
import { BrandedLoading } from '../components/BrandedLoading';
import PracticePublic from './practice/PracticePublic';

// Lazy so the public view does not depend on the editor module. The bundle will
// not actually split until the gated routes in App.tsx are lazy-loaded too
// (multiplayer also imports CodeMirror eagerly), but this keeps the public path
// free of browser-only imports for the prerender step.
const PracticeEditor = React.lazy(() => import('./practice/PracticeEditor'));

/**
 * Route component for `/practice`.
 *
 * Logged-out visitors get indexable marketing copy; signed-in users get the
 * editor. The branch is on session state only — serving crawlers something
 * different from humans would be cloaking.
 */
export default function PracticePage() {
  const { session, loading } = useAuth();

  if (loading) return <BrandedLoading />;
  if (!session) return <PracticePublic />;

  return (
    <AuthGuard>
      <Suspense fallback={<BrandedLoading />}>
        <PracticeEditor />
      </Suspense>
    </AuthGuard>
  );
}
