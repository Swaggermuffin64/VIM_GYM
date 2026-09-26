/**
 * Public share surface for Race of the Day.
 *
 * /s/:slug is what a pasted share link resolves to (via the Vercel rewrite
 * from vimgym.app/s/*): Slack/Discord crawlers read its OG tags to render the
 * unfurl card; human visitors are immediately redirected to the login page
 * with ?challenge=<slug>, which shows the taunt (see frontend login page).
 *
 * /api/challenge/:slug is the JSON the login page reads to render that taunt.
 *
 * Both endpoints are unauthenticated and expose only display name, placing,
 * best time, and date.
 */
import type { FastifyInstance } from 'fastify';
import {
  getShareInfo,
  incrementShareLinkClicks,
  queryDailyPlacing,
} from '../db/daily.js';
import { SHARE_CANONICAL_ORIGIN, SHARE_LINK_BASE_URL } from '../config.js';
import { buildShareCardSvg, renderShareCardPng } from '../share/ogImage.js';
import { isKnownCrawler } from '../share/crawlerDetection.js';

/** Regex for valid share slugs: exactly 10 base62 characters. */
const SLUG_PATTERN = /^[0-9A-Za-z]{10}$/;

/** Format a duration as seconds with one decimal, e.g. 38400 -> "38.4". */
export function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

/** Escape &, <, >, ", ' for safe interpolation into HTML/attributes. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Returns a minimal 404 HTML page for unknown or expired share links.
 * Includes default OG tags so crawlers still get a reasonable card.
 */
function notFoundHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Challenge not found — VIMGYM</title>
<meta property="og:title" content="Challenge not found — VIMGYM">
<meta property="og:description" content="This challenge has expired or does not exist.">
<meta property="og:type" content="website">
<meta property="og:site_name" content="VIMGYM">
<meta name="twitter:card" content="summary">
</head>
<body>
<p>This challenge has expired or does not exist.</p>
</body>
</html>`;
}

/**
 * Registers public share routes on the Fastify instance.
 *
 * GET /s/:slug — HTML unfurl page with OG tags and instant JS redirect.
 * GET /api/challenge/:slug — JSON endpoint returning name, placing, date.
 *
 * Both are unauthenticated and expose only the sharer's display name,
 * placing, total racers, and race date.
 */
export async function registerShareRoutes(
  fastify: FastifyInstance
): Promise<void> {
  /**
   * GET /s/:slug — HTML unfurl page.
   *
   * Crawlers (Slack, Discord, Twitter) read the OG meta tags to render
   * a rich preview card. Human browsers are immediately redirected to
   * the login/challenge page via both a meta-refresh and JS redirect.
   */
  fastify.get<{ Params: { slug: string } }>(
    '/s/:slug',
    async (request, reply) => {
      const { slug } = request.params;

      // Reject malformed slugs early to avoid junk DB lookups
      if (!SLUG_PATTERN.test(slug)) {
        return reply
          .status(404)
          .type('text/html; charset=utf-8')
          .send(notFoundHtml());
      }

      const info = await getShareInfo(slug);
      if (!info) {
        return reply
          .status(404)
          .type('text/html; charset=utf-8')
          .send(notFoundHtml());
      }

      // Count human clicks only: unfurl crawlers fetch this page when the
      // link is merely pasted into a chat. og.png fetches are never counted.
      if (!isKnownCrawler(request.headers['user-agent'])) {
        await incrementShareLinkClicks(slug);
      }

      const placing = await queryDailyPlacing(info.userId, info.raceDate);
      if (!placing) {
        return reply
          .status(404)
          .type('text/html; charset=utf-8')
          .send(notFoundHtml());
      }

      const name = info.displayName;

      const title = `${name} finished the VIMGYM daily race in ${formatSeconds(placing.bestMs)} seconds`;
      const description = `They think they're better than you (at vim). Race today's daily and prove them wrong.`;
      // Land on the race itself; /daily is public and shows the taunt, and
      // its Start button is what sends a visitor to sign in.
      const target = `${SHARE_LINK_BASE_URL}/daily?challenge=${slug}`;
      // Crawlers must reach the card image without a redirect, or Slack
      // drops to its thumbnail layout; see SHARE_CANONICAL_ORIGIN.
      const canonicalUrl = `${SHARE_CANONICAL_ORIGIN}/s/${slug}`;
      const imageUrl = `${SHARE_CANONICAL_ORIGIN}/s/${slug}/og.png`;

      const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHtml(canonicalUrl)}">
<meta property="og:site_name" content="VIMGYM">
<meta property="og:locale" content="en_US">
<meta property="og:image" content="${escapeHtml(imageUrl)}">
<meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeHtml(imageUrl)}">
<meta name="twitter:image:width" content="1200">
<meta name="twitter:image:height" content="630">
<meta http-equiv="refresh" content="0;url=${escapeHtml(target)}">
</head>
<body>
<p>Redirecting to <a href="${escapeHtml(target)}">VIMGYM</a>…</p>
<script>window.location.replace(${JSON.stringify(target)});</script>
</body>
</html>`;

      return reply.type('text/html; charset=utf-8').send(html);
    }
  );

  /**
   * GET /s/:slug/og.png — dynamic share-card image.
   *
   * The og:image referenced by the unfurl page above: the sharer's name,
   * placing, and best time rendered onto a branded 1200x630 PNG. Cached
   * briefly since a better attempt later in the day changes the placing.
   */
  fastify.get<{ Params: { slug: string } }>(
    '/s/:slug/og.png',
    async (request, reply) => {
      const { slug } = request.params;

      if (!SLUG_PATTERN.test(slug)) {
        return reply.status(404).send();
      }

      const info = await getShareInfo(slug);
      if (!info) return reply.status(404).send();

      const placing = await queryDailyPlacing(info.userId, info.raceDate);
      if (!placing) return reply.status(404).send();

      const png = await renderShareCardPng(
        buildShareCardSvg({
          displayName: info.displayName,
          rank: placing.rank,
          totalRacers: placing.totalRacers,
          bestMs: placing.bestMs,
          raceDate: info.raceDate,
        })
      );

      return reply
        .type('image/png')
        .header('Cache-Control', 'public, max-age=300')
        .send(png);
    }
  );

  /**
   * GET /api/challenge/:slug — JSON challenge data.
   *
   * Returns only the sharer's display name, rank, total racers, best time,
   * and race date. Used by the frontend login page to render a challenge
   * taunt. The best time is already public via the unfurl card's title.
   */
  fastify.get<{ Params: { slug: string } }>(
    '/api/challenge/:slug',
    async (request, reply) => {
      const { slug } = request.params;

      if (!SLUG_PATTERN.test(slug)) {
        return reply.status(404).send({ success: false, error: 'not_found' });
      }

      const info = await getShareInfo(slug);
      if (!info) {
        return reply.status(404).send({ success: false, error: 'not_found' });
      }

      const placing = await queryDailyPlacing(info.userId, info.raceDate);
      if (!placing) {
        return reply.status(404).send({ success: false, error: 'not_found' });
      }

      return {
        success: true,
        display_name: info.displayName,
        rank: placing.rank,
        total_racers: placing.totalRacers,
        best_ms: placing.bestMs,
        race_date: info.raceDate,
      };
    }
  );
}
