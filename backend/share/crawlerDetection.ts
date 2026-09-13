/**
 * User-agent based crawler detection for share-link click counting.
 *
 * The /s/:slug unfurl page is fetched by link-preview crawlers the moment a
 * share link is pasted into a chat — before any human clicks it. Click
 * counting (routes/share.ts) uses this filter so those automated fetches do
 * not inflate the count. Detection is best-effort by design: an unrecognized
 * bot slips through occasionally, which is acceptable for a vanity metric.
 */

/**
 * Matches the preview crawlers of the chat apps a share link realistically
 * lands in (Slack, Discord, iMessage/Facebook, WhatsApp, Telegram, X,
 * LinkedIn, Skype), the major search engines, and the generic self-labels
 * ("bot", "crawler", "spider", "preview") that well-behaved fetchers use.
 */
const CRAWLER_UA_PATTERN =
  /bot|crawler|crawl|spider|preview|slack|discord|facebookexternalhit|facebot|whatsapp|telegram|twitter|linkedin|skype/i;

/**
 * Whether the request's User-Agent belongs to a known crawler or preview
 * fetcher rather than a human's browser. A missing or empty User-Agent is
 * treated as a crawler: real browsers always send one.
 */
export function isKnownCrawler(userAgent: string | undefined): boolean {
  if (!userAgent) return true;
  return CRAWLER_UA_PATTERN.test(userAgent);
}
