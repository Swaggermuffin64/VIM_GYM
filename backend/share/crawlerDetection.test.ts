// backend/share/crawlerDetection.test.ts
import { describe, it, expect } from 'vitest';
import { isKnownCrawler } from './crawlerDetection.js';

describe('isKnownCrawler', () => {
  // Unfurl crawlers hit /s/:slug the moment a link is PASTED, before any
  // human clicks. Counting them would inflate click counts on every share.
  it.each([
    ['Slack', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'],
    [
      'Discord',
      'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    ],
    ['Twitter/X', 'Twitterbot/1.0'],
    [
      'Facebook/iMessage',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    ],
    ['Facebook Facebot', 'Facebot/1.0'],
    ['WhatsApp', 'WhatsApp/2.23.20.0'],
    ['Telegram', 'TelegramBot (like TwitterBot)'],
    [
      'LinkedIn',
      'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
    ],
    [
      'Google',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    ],
    [
      'Bing',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    ],
    ['generic crawler', 'SomeNewService-Crawler/3.1'],
    ['generic spider', 'Sogou web spider/4.0'],
    ['generic preview fetcher', 'ExampleApp LinkPreview/1.2'],
  ])('flags the %s crawler', (_name, userAgent) => {
    expect(isKnownCrawler(userAgent)).toBe(true);
  });

  it.each([
    [
      'Chrome on macOS',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    ],
    [
      'Safari on iPhone',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    ],
    [
      'Firefox on Windows',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
    ],
  ])('passes a real browser: %s', (_name, userAgent) => {
    expect(isKnownCrawler(userAgent)).toBe(false);
  });

  // Real browsers always send a User-Agent; a missing one is automation.
  it('treats a missing user agent as a crawler', () => {
    expect(isKnownCrawler(undefined)).toBe(true);
    expect(isKnownCrawler('')).toBe(true);
  });
});
