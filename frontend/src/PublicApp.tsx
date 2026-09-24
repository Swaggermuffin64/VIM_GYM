import type { ReactElement } from 'react';
import { StaticRouter } from 'react-router';

import { HomeMenu } from './pages/home';
import { SignedOutLobby } from './pages/multiplayer';
import About from './pages/about';
import PrivacyPolicy from './pages/privacy';
import TermsOfService from './pages/terms';
import type { BodyPrerenderedRoute } from './seo/routeMeta';

/**
 * The public component tree, rendered without AuthProvider.
 *
 * This is what the build-time prerender renders to static HTML. It never
 * mounts auth context, so it cannot call Supabase and cannot depend on a
 * browser. Anything added here must be renderable in Node — see
 * scripts/prerender.mts. Routes that cannot meet that bar are listed in
 * HEAD_ONLY_ROUTES and get metadata only.
 */
const VIEWS: Record<BodyPrerenderedRoute, () => ReactElement> = {
  '/': () => <HomeMenu />,
  '/multiplayer': () => <SignedOutLobby />,
  '/about': () => <About />,
  '/privacy': () => <PrivacyPolicy />,
  '/terms': () => <TermsOfService />,
};

export function PublicApp({ route }: { route: BodyPrerenderedRoute }) {
  return <StaticRouter location={route}>{VIEWS[route]()}</StaticRouter>;
}
