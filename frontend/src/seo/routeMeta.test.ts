import { describe, it, expect } from 'vitest';
import {
  ROUTE_META,
  PUBLIC_ROUTES,
  CANONICAL_ORIGIN,
  canonicalUrl,
} from './routeMeta';

describe('ROUTE_META', () => {
  it('covers exactly the four public routes', () => {
    expect(PUBLIC_ROUTES).toEqual(['/', '/about', '/practice', '/multiplayer']);
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

  it('builds canonical URLs on the www host', () => {
    expect(CANONICAL_ORIGIN).toBe('https://www.vimgym.app');
    expect(canonicalUrl('/')).toBe('https://www.vimgym.app/');
    expect(canonicalUrl('/practice')).toBe('https://www.vimgym.app/practice');
  });
});
