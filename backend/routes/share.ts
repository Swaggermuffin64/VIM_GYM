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
 * and date.
 */
import type { FastifyInstance } from 'fastify';
import { getShareInfo, queryDailyPlacing } from '../db/daily.js';
import { SHARE_LINK_BASE_URL } from '../config.js';

/** Regex for valid share slugs: exactly 10 base62 characters. */
const SLUG_PATTERN = /^[0-9A-Za-z]{10}$/;

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

      const placing = await queryDailyPlacing(info.userId, info.raceDate);
      if (!placing) {
        return reply
          .status(404)
          .type('text/html; charset=utf-8')
          .send(notFoundHtml());
      }

      const name = info.displayName;
      const { rank, totalRacers: total } = placing;

      const title = `${name} placed #${rank} of ${total} in today's VIMGYM daily`;
      const description = `${name} thinks they're better than you. (at vim.) Race today's daily and prove them wrong.`;
      const target = `${SHARE_LINK_BASE_URL}/login?challenge=${slug}`;

      const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHtml(`${SHARE_LINK_BASE_URL}/s/${slug}`)}">
<meta property="og:site_name" content="VIMGYM">
<meta name="twitter:card" content="summary">
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
   * GET /api/challenge/:slug — JSON challenge data.
   *
   * Returns only the sharer's display name, rank, total racers, and race
   * date. Used by the frontend login page to render a challenge taunt.
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
        race_date: info.raceDate,
      };
    }
  );
}
