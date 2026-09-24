import React, { Suspense } from 'react';

import { useAuth } from '../contexts/AuthContext';
import { AuthGuard } from '../components/AuthGuard';
import { BrandedLoading } from '../components/BrandedLoading';
import { PageMeta } from '../seo/PageMeta';

// Lazy for the same reason as the practice and multiplayer routes: daily.tsx
// imports the race engine from PracticeEditor, so an eager import here would
// pull CodeMirror back into the main chunk and undo the editor's code split.
const DailyRacePage = React.lazy(() => import('./daily'));

/**
 * Route component for `/daily`.
 *
 * Everyone sees the pre-race screen; share links land visitors here and the
 * page's own Start button sends them to sign in (see daily.tsx). AuthGuard
 * wraps only the signed-in branch, for the onboarding redirect -- wrapping
 * visitors would bounce them to login before they saw the race.
 */
export default function DailyRoute() {
  const { session, loading } = useAuth();

  if (loading) return <BrandedLoading />;

  const page = (
    <Suspense fallback={<BrandedLoading />}>
      <DailyRacePage />
    </Suspense>
  );

  return (
    <>
      <PageMeta route="/daily" />
      {session ? <AuthGuard>{page}</AuthGuard> : page}
    </>
  );
}
