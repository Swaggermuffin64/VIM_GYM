import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROUTE_META, PUBLIC_ROUTES, isHeadOnlyRoute } from './routeMeta';

const BODY_ROUTES = PUBLIC_ROUTES.filter((r) => !isHeadOnlyRoute(r));
const HEAD_ONLY = PUBLIC_ROUTES.filter(isHeadOnlyRoute);

const buildDir = resolve(__dirname, '../../build');
const fileFor = (route: string) =>
  route === '/' ? 'index.html' : `${route.slice(1)}.html`;

// Requires `npm run build` to have run. Skipped otherwise so unit runs stay fast.
const built = existsSync(resolve(buildDir, 'index.html'));

describe.skipIf(!built)('prerendered output', () => {
  const pages = new Map<string, string>();
  beforeAll(() => {
    for (const route of PUBLIC_ROUTES) {
      pages.set(
        route,
        readFileSync(resolve(buildDir, fileFor(route)), 'utf-8')
      );
    }
  });

  it.each(PUBLIC_ROUTES)('%s carries its own title', (route) => {
    expect(pages.get(route)).toContain(
      `<title>${ROUTE_META[route].title}</title>`
    );
  });

  it.each(PUBLIC_ROUTES)('%s carries its own description', (route) => {
    expect(pages.get(route)).toContain(ROUTE_META[route].description);
  });

  it.each(PUBLIC_ROUTES)('%s carries a www canonical', (route) => {
    expect(pages.get(route)).toMatch(
      /<link rel="canonical" href="https:\/\/www\.vimgym\.app/
    );
  });

  // The original defect: four URLs, one title.
  it('emits four distinct titles', () => {
    const titles = PUBLIC_ROUTES.map(
      (r) => pages.get(r)!.match(/<title>(.*?)<\/title>/)![1]
    );
    expect(new Set(titles).size).toBe(PUBLIC_ROUTES.length);
  });

  // Google indexed the noscript string because the HTML had no other text.
  it.each(BODY_ROUTES)('%s has real body content', (route) => {
    const html = pages.get(route)!;
    const start = html.indexOf('<div id="root">') + '<div id="root">'.length;
    // The closing </div> for #root is followed by the module script tag.
    const end = html.indexOf('</div><script', start);
    const rootContent = html.slice(start, end);
    expect(rootContent.length).toBeGreaterThan(500);
  });

  // The editor's Ready screen cannot render in Node, so /practice ships its
  // metadata over an empty root and the client fills it in.
  it.each(HEAD_ONLY)('%s is head-only with an empty root', (route) => {
    expect(pages.get(route)).toContain('<div id="root"></div>');
  });

  // Proves the lazy split held: the heavy editor must not reach the public path.
  it.each(PUBLIC_ROUTES)('%s does not inline the editor', (route) => {
    expect(pages.get(route)).not.toContain('codemirror-vim');
    expect(pages.get(route)).not.toContain('socket.io');
  });

  it('emits exactly one title tag per page', () => {
    for (const route of PUBLIC_ROUTES) {
      expect((pages.get(route)!.match(/<title>/g) ?? []).length).toBe(1);
    }
  });

  describe('SPA fallback shell (app.html)', () => {
    let appHtml: string;
    beforeAll(() => {
      appHtml = readFileSync(resolve(buildDir, 'app.html'), 'utf-8');
    });

    it('exists', () => {
      expect(existsSync(resolve(buildDir, 'app.html'))).toBe(true);
    });

    it('has an empty #root div', () => {
      expect(appHtml).toContain('<div id="root"></div>');
    });

    it('has no canonical link', () => {
      expect(appHtml).not.toMatch(/<link[^>]*rel="canonical"/);
    });

    it('does not carry the home page title', () => {
      expect(appHtml).not.toContain(ROUTE_META['/'].title);
    });
  });
});
