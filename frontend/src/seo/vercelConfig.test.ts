import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PUBLIC_ROUTES } from './routeMeta';

/**
 * Guards the deployment routing in vercel.json, which nothing else exercises.
 * Vercel evaluates redirects, then the filesystem, then rewrites, so the
 * prerendered pages win over the SPA fallback as long as the file exists and
 * the fallback destination resolves.
 */
type VercelConfig = {
  cleanUrls?: boolean;
  redirects: { source: string; destination: string }[];
  rewrites: { source: string; destination: string }[];
};

const config = JSON.parse(
  readFileSync(resolve(__dirname, '../../vercel.json'), 'utf-8')
) as VercelConfig;

const fallback = config.rewrites.find((r) => r.destination.startsWith('/app'));

describe('vercel.json SPA fallback', () => {
  it('has a catch-all rewrite to the app shell', () => {
    expect(fallback).toBeDefined();
  });

  // With cleanUrls on, Vercel strips .html at build time, so a rewrite whose
  // destination still says "app.html" 404s at the edge and every direct load
  // of /daily, /login or /profile breaks. The destination must be the clean
  // path. (vercel/vercel discussion #6694)
  it('does not point at a .html file when cleanUrls is on', () => {
    expect(config.cleanUrls).toBe(true);
    expect(fallback!.destination).toBe('/app');
  });

  it('keeps /app off the public surface by redirecting it home', () => {
    const redirect = config.redirects.find((r) => r.source === '/app');
    expect(redirect?.destination).toBe('/');
  });

  // Each prerendered route must be excluded from the fallback pattern so it
  // never depends on filesystem ordering to be served.
  it.each(PUBLIC_ROUTES.filter((r) => r !== '/'))(
    'excludes prerendered route %s from the fallback',
    (route) => {
      const pattern = new RegExp(`^${fallback!.source.slice(1)}$`);
      expect(pattern.test(route.slice(1))).toBe(false);
    }
  );

  it('still routes client-only pages to the fallback', () => {
    const pattern = new RegExp(`^${fallback!.source.slice(1)}$`);
    for (const path of ['daily', 'login', 'profile', 'onboarding']) {
      expect(pattern.test(path)).toBe(true);
    }
  });
});
