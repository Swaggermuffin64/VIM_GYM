// backend/routes/share.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../db/daily.js', () => ({
  getShareInfo: vi.fn(),
  queryDailyPlacing: vi.fn(),
}));

import * as daily from '../db/daily.js';
import { registerShareRoutes, escapeHtml } from './share.js';

async function buildServer() {
  const app = Fastify();
  await registerShareRoutes(app);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<img src="x" onerror='a&b'>`)).toBe(
      '&lt;img src=&quot;x&quot; onerror=&#39;a&amp;b&#39;&gt;'
    );
  });
});

describe('GET /s/:slug', () => {
  it('serves OG tags with the challenger name and placing, and a redirect', async () => {
    vi.mocked(daily.getShareInfo).mockResolvedValue({
      userId: 'u1',
      displayName: 'Jackson',
      raceDate: '2026-08-16',
    });
    vi.mocked(daily.queryDailyPlacing).mockResolvedValue({
      rank: 4,
      totalRacers: 212,
      bestMs: 61_300,
    });
    const app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/s/a1B2c3D4e5' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('og:title');
    expect(res.body).toContain('Jackson placed #4 of 212');
    expect(res.body).toContain('/login?challenge=a1B2c3D4e5');
  });

  it('HTML-escapes a hostile display name', async () => {
    vi.mocked(daily.getShareInfo).mockResolvedValue({
      userId: 'u1',
      displayName: '<script>alert(1)</script>',
      raceDate: '2026-08-16',
    });
    vi.mocked(daily.queryDailyPlacing).mockResolvedValue({
      rank: 1,
      totalRacers: 2,
      bestMs: 50_000,
    });
    const app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/s/a1B2c3D4e5' });
    expect(res.body).not.toContain('<script>alert');
    expect(res.body).toContain('&lt;script&gt;');
  });

  it('rejects malformed slugs and unknown slugs with 404', async () => {
    vi.mocked(daily.getShareInfo).mockResolvedValue(null);
    const app = await buildServer();
    expect((await app.inject({ url: '/s/nope' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/s/aaaaaaaaaa' })).statusCode).toBe(404);
  });
});

describe('GET /api/challenge/:slug', () => {
  it('returns only name, placing, and date', async () => {
    vi.mocked(daily.getShareInfo).mockResolvedValue({
      userId: 'u1',
      displayName: 'Jackson',
      raceDate: '2026-08-16',
    });
    vi.mocked(daily.queryDailyPlacing).mockResolvedValue({
      rank: 4,
      totalRacers: 212,
      bestMs: 61_300,
    });
    const app = await buildServer();
    const res = await app.inject({ url: '/api/challenge/a1B2c3D4e5' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      display_name: 'Jackson',
      rank: 4,
      total_racers: 212,
      race_date: '2026-08-16',
    });
  });

  it('404s on unknown slug', async () => {
    vi.mocked(daily.getShareInfo).mockResolvedValue(null);
    const app = await buildServer();
    expect(
      (await app.inject({ url: '/api/challenge/aaaaaaaaaa' })).statusCode
    ).toBe(404);
  });
});
