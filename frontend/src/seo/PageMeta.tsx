import { ROUTE_META, canonicalUrl, type PublicRoute } from './routeMeta';

/**
 * Per-route <head> metadata for a public page.
 *
 * React 19 hoists title/meta/link elements rendered anywhere in the tree into
 * document.head, so this renders them inline and needs no helmet library.
 * This covers client-side navigation; the prerender script writes the same
 * values into static HTML for the first paint a crawler sees.
 */
export function PageMeta({ route }: { route: PublicRoute }) {
  const { title, description } = ROUTE_META[route];
  const url = canonicalUrl(route);

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="VIMGYM" />

      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
    </>
  );
}
