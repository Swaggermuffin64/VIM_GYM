/**
 * Writes static HTML for every public route after `vite build`.
 *
 * Each file gets its own <title>, description, canonical and og: tags, so a
 * crawler's FIRST request already carries the page's identity — no dependence
 * on Google's deferred JS rendering, and correct unfurls in Slack/Discord/
 * iMessage, none of which run JS at all.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PUBLIC_ROUTES, type PublicRoute } from '../src/seo/routeMeta.js';
import { injectMeta } from '../src/seo/injectMeta.js';
import { renderRoute } from '../build-ssr/entry-server.js';

const here = dirname(fileURLToPath(import.meta.url));
const buildDir = resolve(here, '../build');
const template = readFileSync(resolve(buildDir, 'index.html'), 'utf-8');

/** '/' -> index.html, '/practice' -> practice.html */
function outputFileFor(route: PublicRoute): string {
  return route === '/' ? 'index.html' : `${route.slice(1)}.html`;
}

// Write the unmodified Vite shell as the SPA fallback for client-only routes.
// vercel.json rewrites non-prerendered paths to /app.html so they get an empty
// #root and a generic <title>, not the prerendered home page's markup.
const appShellPath = resolve(buildDir, 'app.html');
writeFileSync(appShellPath, template, 'utf-8');
console.log(`spa fallback -> ${appShellPath}`);

for (const route of PUBLIC_ROUTES) {
  const body = renderRoute(route);
  const html = injectMeta(template, route, body);
  const file = resolve(buildDir, outputFileFor(route));
  writeFileSync(file, html, 'utf-8');
  console.log(`prerendered ${route} -> ${file}`);
}
