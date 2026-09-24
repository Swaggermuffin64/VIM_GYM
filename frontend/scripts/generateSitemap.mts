/**
 * Writes build/sitemap.xml after `vite build`. Run via tsx from the build
 * script; see backend/scripts/ogPreviewServer.mts for the same pattern.
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSitemapXml } from '../src/seo/sitemap.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../build/sitemap.xml');

writeFileSync(out, buildSitemapXml(), 'utf-8');
console.log(`wrote ${out}`);
