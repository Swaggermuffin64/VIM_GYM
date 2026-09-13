import React, { Suspense } from 'react';

import { useAuth } from '../contexts/AuthContext';
import { AuthGuard } from '../components/AuthGuard';
import { BrandedLoading } from '../components/BrandedLoading';
import PracticePublic from './practice/PracticePublic';

// Re-export shared types/components so existing consumers (e.g. daily.tsx) keep
// working without changing their import path.
export type { RaceSessionPageProps } from './practice/PracticeEditor';
export { RaceSessionPage } from './practice/PracticeEditor';

// Lazy so CodeMirror stays out of the initial bundle and out of the prerender.
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
