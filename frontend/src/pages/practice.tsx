import React, { Suspense } from 'react';

import { useAuth } from '../contexts/AuthContext';
import { AuthGuard } from '../components/AuthGuard';
import { BrandedLoading } from '../components/BrandedLoading';
import { PageMeta } from '../seo/PageMeta';

// Lazy so the home menu and the prerender do not pull in CodeMirror.
const PracticeEditor = React.lazy(() => import('./practice/PracticeEditor'));

/**
 * Route component for `/practice`.
 *
 * Everyone sees the editor's Ready screen; without a session its Ready button
 * sends the visitor to sign in (see RaceSessionPage). AuthGuard wraps only the
 * signed-in branch, for the onboarding redirect — wrapping visitors would
 * bounce them to login before they saw the page.
 */
export default function PracticePage() {
  const { session, loading } = useAuth();

  if (loading) return <BrandedLoading />;

  const editor = (
    <Suspense fallback={<BrandedLoading />}>
      <PracticeEditor />
    </Suspense>
  );

  return (
    <>
      <PageMeta route="/practice" />
      {session ? <AuthGuard>{editor}</AuthGuard> : editor}
    </>
  );
}
