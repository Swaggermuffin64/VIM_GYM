import { PUBLIC_ROUTES, ROUTE_META, canonicalUrl } from './routeMeta';

/**
 * Builds sitemap.xml from the same ROUTE_META table that drives page
 * metadata, so a route can never be added to one and forgotten in the other.
 * Gated routes are simply absent — not Disallow-ed, which would only
 * advertise their existence.
 */
export function buildSitemapXml(): string {
  const entries = PUBLIC_ROUTES.map(
    (route) => `  <url>
    <loc>${canonicalUrl(route)}</loc>
    <changefreq>weekly</changefreq>
    <priority>${ROUTE_META[route].priority.toFixed(1)}</priority>
  </url>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}
