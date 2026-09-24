import { ROUTE_META, canonicalUrl, type PublicRoute } from './routeMeta';

/** Escapes a string for safe use inside a double-quoted HTML attribute. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Removes head-bound tags that React emitted inline in the body.
 *
 * React 19 hoists title/meta/link into <head> only in the browser;
 * renderToString leaves them where they were rendered. injectMeta writes the
 * authoritative versions into <head>, so the inline copies must go or every
 * page ships duplicates.
 */
export function stripHoistableTags(html: string): string {
  return html
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/<meta\b[^>]*\/?>/g, '')
    .replace(/<link\b[^>]*rel="canonical"[^>]*\/?>/g, '');
}

/**
 * Builds the final static HTML for one public route: the Vite template with
 * the route's metadata in <head> and the prerendered markup inside #root.
 */
export function injectMeta(
  template: string,
  route: PublicRoute,
  body: string
): string {
  const { title, description } = ROUTE_META[route];
  const url = canonicalUrl(route);
  const d = escapeAttr(description);
  const t = escapeAttr(title);

  const head = [
    `<meta name="description" content="${d}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="VIM_GYM">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
  ].join('\n    ');

  const ROOT_ANCHOR = '<div id="root"></div>';

  if (!template.includes(ROOT_ANCHOR)) {
    throw new Error(
      `Prerender failed for ${route}: the <div id="root"></div> anchor was not ` +
        `found in the Vite template. Vite's index.html output format has probably ` +
        `changed (extra attributes, different whitespace, etc.). Update the ` +
        `ROOT_ANCHOR constant in injectMeta.ts to match the new format.`
    );
  }

  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>\n    ${head}`)
    .replace(ROOT_ANCHOR, `<div id="root">${stripHoistableTags(body)}</div>`);
}
