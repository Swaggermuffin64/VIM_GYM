import type { ReactElement } from 'react';
import { StaticRouter } from 'react-router';

import HomePublic from './pages/home/HomePublic';
import PracticePublic from './pages/practice/PracticePublic';
import MultiplayerPublic from './pages/multiplayer/MultiplayerPublic';
import About from './pages/about';
import type { PublicRoute } from './seo/routeMeta';

/**
 * The public component tree, rendered without AuthProvider.
 *
 * This is what the build-time prerender renders to static HTML. It never
 * mounts auth context, so it cannot call Supabase and cannot depend on a
 * browser. Anything added here must be renderable in Node — see
 * scripts/prerender.mts.
 */
const VIEWS: Record<PublicRoute, () => ReactElement> = {
  '/': () => <HomePublic />,
  '/practice': () => <PracticePublic />,
  '/multiplayer': () => <MultiplayerPublic />,
  '/about': () => <About />,
};

export function PublicApp({ route }: { route: PublicRoute }) {
  return <StaticRouter location={route}>{VIEWS[route]()}</StaticRouter>;
}
