/**
 * Per-route search metadata — the single source of truth.
 *
 * Consumed by three places that must never disagree: the <PageMeta>
 * component (client-side navigation), the prerender script (static HTML at
 * build time), and the sitemap generator. Titles and descriptions are
 * deliberately distinct per route; identical metadata across routes is the
 * exact defect this table exists to prevent, and routeMeta.test.ts enforces it.
 */

/** The one host we want indexed. The apex domain 301s here. */
export const CANONICAL_ORIGIN = 'https://www.vimgym.app';

export type RouteMeta = {
  title: string;
  description: string;
  /** sitemap <priority>; relative importance, not a ranking lever. */
  priority: number;
};

export const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/practice',
  '/multiplayer',
] as const;

export type PublicRoute = (typeof PUBLIC_ROUTES)[number];

/**
 * Public routes whose page cannot be rendered in Node, so the prerender
 * writes their <head> metadata over an empty #root instead of a full body.
 * /practice is the editor's own Ready screen, and that module imports
 * CodeMirror at top level. Crawlers that run JavaScript (Google) still see the
 * page; link unfurlers only read <head>, which is complete either way.
 */
export const HEAD_ONLY_ROUTES = [
  '/practice',
] as const satisfies readonly PublicRoute[];

export type HeadOnlyRoute = (typeof HEAD_ONLY_ROUTES)[number];
/** Public routes the prerender renders to full static HTML. */
export type BodyPrerenderedRoute = Exclude<PublicRoute, HeadOnlyRoute>;

export function isHeadOnlyRoute(route: PublicRoute): route is HeadOnlyRoute {
  return (HEAD_ONLY_ROUTES as readonly string[]).includes(route);
}

export const ROUTE_META: Record<PublicRoute, RouteMeta> = {
  '/': {
    title: 'VIMGYM — Practice Vim Motions by Racing',
    description:
      'Learn Vim motions by racing the clock and other people. Daily challenges, multiplayer races, and drills that build real muscle memory. Free to play.',
    priority: 1.0,
  },
  '/about': {
    title: 'About VIMGYM — Why Practice Vim Motions',
    description:
      'What VIMGYM is, why Vim motions are worth drilling, and where the project is headed. Built to make practising Vim feel like a game instead of a chore.',
    priority: 0.7,
  },
  '/practice': {
    title: 'Vim Practice Mode — Drill Motions Solo | VIMGYM',
    description:
      'Drill Vim motions solo at your own pace. Targeted exercises with instant feedback on the optimal keystrokes, so you stop reaching for the arrow keys.',
    priority: 0.9,
  },
  '/multiplayer': {
    title: 'Vim Multiplayer Races — Quick Play | VIMGYM',
    description:
      'Race other developers through Vim editing challenges in real time. Quick play matches you with an opponent in seconds and fastest correct motions win.',
    priority: 0.9,
  },
};

/** Absolute canonical URL for a public route, always on the www host. */
export function canonicalUrl(route: PublicRoute): string {
  return `${CANONICAL_ORIGIN}${route}`;
}
