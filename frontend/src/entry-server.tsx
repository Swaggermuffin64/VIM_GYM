import { renderToString } from 'react-dom/server';

import { PublicApp } from './PublicApp';
import type { PublicRoute } from './seo/routeMeta';

/**
 * Renders one public route to an HTML string for the build-time prerender.
 *
 * Metadata is NOT taken from this output: React only hoists title/meta/link
 * into <head> in the browser, so renderToString leaves them inline. The
 * prerender script strips them from this markup and writes authoritative
 * <head> tags from ROUTE_META instead.
 */
export function renderRoute(route: PublicRoute): string {
  return renderToString(<PublicApp route={route} />);
}
