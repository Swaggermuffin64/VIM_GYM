import { describe, it, expect } from 'vitest';
import {
  ROUTE_META,
  PUBLIC_ROUTES,
  CANONICAL_ORIGIN,
  SITE_NAME,
  canonicalUrl,
} from './routeMeta';

describe('ROUTE_META', () => {
  it('covers exactly the public routes', () => {
    expect(PUBLIC_ROUTES).toEqual([
      '/',
      '/about',
      '/practice',
      '/multiplayer',
      '/daily',
      '/privacy',
      '/terms',
    ]);
    expect(Object.keys(ROUTE_META).sort()).toEqual([...PUBLIC_ROUTES].sort());
  });

  it('gives every route a title and description', () => {
    for (const route of PUBLIC_ROUTES) {
      expect(ROUTE_META[route].title.length).toBeGreaterThan(0);
      expect(ROUTE_META[route].description.length).toBeGreaterThan(0);
    }
  });

  // This is the regression guard for the reported defect: every indexed page
  // shared one title and one description, so Google could not tell them apart.
  it('gives every route a UNIQUE title', () => {
    const titles = PUBLIC_ROUTES.map((r) => ROUTE_META[r].title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('gives every route a UNIQUE description', () => {
    const descriptions = PUBLIC_ROUTES.map((r) => ROUTE_META[r].description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("keeps titles within Google's display limit", () => {
    for (const route of PUBLIC_ROUTES) {
      expect(ROUTE_META[route].title.length).toBeLessThanOrEqual(60);
    }
  });

  it('keeps descriptions within the snippet sweet spot', () => {
    for (const route of PUBLIC_ROUTES) {
      const { description } = ROUTE_META[route];
      expect(description.length).toBeGreaterThanOrEqual(120);
      expect(description.length).toBeLessThanOrEqual(160);
    }
  });

  // Regression guard: the brand was only ever written "VIM_GYM" or "VIMGYM",
  // which search engines read as one word, so the site never matched the
  // two-word search "vim gym".
  it('names the site as two separate words', () => {
    expect(SITE_NAME).toBe('VIM GYM');
  });

  it('puts the two-word site name in every title', () => {
    for (const route of PUBLIC_ROUTES) {
      expect(ROUTE_META[route].title).toContain(SITE_NAME);
    }
  });

  it('opens the home description with the two-word site name', () => {
    expect(ROUTE_META['/'].description.startsWith(SITE_NAME)).toBe(true);
  });

  it('never writes the site name as a single word in search metadata', () => {
    for (const route of PUBLIC_ROUTES) {
      const { title, description } = ROUTE_META[route];
      expect(`${title} ${description}`).not.toMatch(/VIM_GYM|VIMGYM/i);
    }
  });

  it('builds canonical URLs on the www host', () => {
    expect(CANONICAL_ORIGIN).toBe('https://www.vimgym.app');
    expect(canonicalUrl('/')).toBe('https://www.vimgym.app/');
    expect(canonicalUrl('/practice')).toBe('https://www.vimgym.app/practice');
  });
});
