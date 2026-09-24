import { describe, it, expect } from 'vitest';
import { buildSitemapXml } from './sitemap';
import { PUBLIC_ROUTES, canonicalUrl } from './routeMeta';

describe('buildSitemapXml', () => {
  const xml = buildSitemapXml();

  it('declares the sitemap namespace', () => {
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('http://www.sitemaps.org/schemas/sitemap/0.9');
  });

  it('lists every public route on the www host', () => {
    for (const route of PUBLIC_ROUTES) {
      expect(xml).toContain(`<loc>${canonicalUrl(route)}</loc>`);
    }
  });

  it('lists exactly the public routes and nothing more', () => {
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBe(PUBLIC_ROUTES.length);
  });

  // Gated routes have nothing to index and must not be advertised.
  it('excludes gated routes', () => {
    for (const gated of ['/profile', '/onboarding', '/login']) {
      expect(xml).not.toContain(`<loc>https://www.vimgym.app${gated}</loc>`);
    }
  });

  it('never emits the apex host', () => {
    expect(xml).not.toMatch(/<loc>https:\/\/vimgym\.app/);
  });
});
