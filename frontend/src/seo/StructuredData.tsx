import {
  CANONICAL_ORIGIN,
  PUBLIC_ROUTES,
  ROUTE_META,
  canonicalUrl,
} from './routeMeta';

/**
 * JSON-LD structured data for the home page.
 *
 * Gives Google clean names for the site and its main sections. This does not
 * force sitelinks -- nothing does, they are generated algorithmically -- but it
 * removes ambiguity about what each section is called. Deliberately minimal:
 * only claims that are true and verifiable on the page.
 */
export function StructuredData() {
  const graph = [
    {
      '@type': 'WebSite',
      '@id': `${CANONICAL_ORIGIN}/#website`,
      url: CANONICAL_ORIGIN,
      name: 'VIMGYM',
      description: ROUTE_META['/'].description,
    },
    ...PUBLIC_ROUTES.map((route) => ({
      '@type': 'SiteNavigationElement',
      name: ROUTE_META[route].title,
      description: ROUTE_META[route].description,
      url: canonicalUrl(route),
    })),
  ];

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': graph,
        }),
      }}
    />
  );
}
