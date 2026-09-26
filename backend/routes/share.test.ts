// backend/routes/share.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../db/daily.js', () => ({
  getShareInfo: vi.fn(),
  queryDailyPlacing: vi.fn(),
  incrementShareLinkClicks: vi.fn(),
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
  it('serves OG tags with the challenger name and best time, and a redirect', async () => {
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
    expect(res.body).toContain(
      'Jackson finished the VIMGYM daily race in 61.3 seconds'
    );
    expect(res.body).toContain('/daily?challenge=a1B2c3D4e5');
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

describe('GET /s/:slug click counting', () => {
  const BROWSER_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
  const CRAWLER_UA =
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)';

  function mockValidShare() {
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
  }

  it('counts a click from a real browser', async () => {
    mockValidShare();
    const app = await buildServer();
    await app.inject({
      method: 'GET',
      url: '/s/a1B2c3D4e5',
      headers: { 'user-agent': BROWSER_UA },
    });
    expect(daily.incrementShareLinkClicks).toHaveBeenCalledWith('a1B2c3D4e5');
  });

  // Unfurl crawlers hit the page when the link is merely PASTED, before any
  // human clicks: counting them would inflate every share by several "clicks".
  it('does not count unfurl crawlers', async () => {
    mockValidShare();
    const app = await buildServer();
    await app.inject({
      method: 'GET',
      url: '/s/a1B2c3D4e5',
      headers: { 'user-agent': CRAWLER_UA },
    });
    expect(daily.incrementShareLinkClicks).not.toHaveBeenCalled();
  });

  it('does not count malformed or unknown slugs', async () => {
    vi.mocked(daily.getShareInfo).mockResolvedValue(null);
    const app = await buildServer();
    await app.inject({
      method: 'GET',
      url: '/s/nope',
      headers: { 'user-agent': BROWSER_UA },
    });
    await app.inject({
      method: 'GET',
      url: '/s/aaaaaaaaaa',
      headers: { 'user-agent': BROWSER_UA },
    });
    expect(daily.incrementShareLinkClicks).not.toHaveBeenCalled();
  });

  // The unfurl page references og.png, so every crawler (and some browsers)
  // fetches it right after the page: it must never count as a second click.
  it('does not count og.png image fetches', async () => {
    mockValidShare();
    const app = await buildServer();
    await app.inject({
      method: 'GET',
      url: '/s/a1B2c3D4e5/og.png',
      headers: { 'user-agent': BROWSER_UA },
    });
    expect(daily.incrementShareLinkClicks).not.toHaveBeenCalled();
  });
});

describe('GET /s/:slug og:image tags', () => {
  it('references the dynamic card image with large-card treatment', async () => {
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

    expect(res.body).toContain(
      'og:image" content="https://www.vimgym.app/s/a1B2c3D4e5/og.png"'
    );
    expect(res.body).toContain('og:image:type" content="image/png"');
    expect(res.body).toContain('og:image:width" content="1200"');
    expect(res.body).toContain('og:image:height" content="630"');
    expect(res.body).toContain('summary_large_image');
    // Slack reads the Twitter card set ahead of Open Graph; an incomplete
    // set (card + image but no title/description) drops to the thumbnail
    // layout, so the card must be complete.
    expect(res.body).toContain('twitter:title" content="Jackson finished');
    expect(res.body).toContain('twitter:description" content="They think');
    expect(res.body).toContain('og:image:alt" content="Jackson finished');
    expect(res.body).toContain('twitter:image:width" content="1200"');
    expect(res.body).toContain('twitter:image:height" content="630"');
    expect(res.body).toContain('name="description"');
    expect(res.body).toContain('og:locale');
  });

  it('mints og:url and og:image on the redirect-free canonical origin', async () => {
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

    // The apex short link 307s to www; crawlers must not hit that hop when
    // fetching the card image or Slack renders only a cropped thumbnail.
    expect(res.body).toContain(
      'og:url" content="https://www.vimgym.app/s/a1B2c3D4e5"'
    );
    expect(res.body).not.toContain(
      'content="https://vimgym.app/s/a1B2c3D4e5/og.png"'
    );
    // Humans still land on the short-link origin.
    expect(res.body).toContain(
      'url=https://vimgym.app/daily?challenge=a1B2c3D4e5'
    );
  });
});

describe('GET /s/:slug/og.png', () => {
  it('serves a rendered PNG card for a valid slug', async () => {
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
    const res = await app.inject({
      method: 'GET',
      url: '/s/a1B2c3D4e5/og.png',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.rawPayload.subarray(0, 4)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47])
    );
  });

  it('404s on malformed and unknown slugs', async () => {
    vi.mocked(daily.getShareInfo).mockResolvedValue(null);
    const app = await buildServer();

    const bad = await app.inject({ method: 'GET', url: '/s/nope!/og.png' });
    expect(bad.statusCode).toBe(404);

    const unknown = await app.inject({
      method: 'GET',
      url: '/s/a1B2c3D4e5/og.png',
    });
    expect(unknown.statusCode).toBe(404);
  });
});

describe('GET /api/challenge/:slug', () => {
  it('returns only name, placing, best time, and date', async () => {
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
      best_ms: 61_300,
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
