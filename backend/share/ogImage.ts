// backend/share/ogImage.ts
/**
 * Dynamic Open Graph card for daily-race share links.
 *
 * buildShareCardSvg composes a 1200x630 branded card (the standard OG image
 * size) with the sharer's name, placing, and best time; renderShareCardPng
 * rasterizes it with sharp, since chat apps (Discord/Slack/iMessage) will
 * not render SVG og:images. Served by GET /s/:slug/og.png in
 * routes/share.ts.
 *
 * Text uses DejaVu Sans Mono: present on dev machines via the system, and
 * installed in the production image (see backend/Dockerfile), so the
 * monospace brand look survives rasterization.
 */
import sharp from 'sharp';

/** Escape &, <, >, ", ' for safe interpolation into SVG text nodes. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Format milliseconds as seconds with one decimal, e.g. "41.2s". */
function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export interface ShareCardParams {
  displayName: string;
  rank: number;
  totalRacers: number;
  bestMs: number;
  raceDate: string;
}

/** Compose the 1200x630 share-card SVG. Pure; safe for hostile names. */
export function buildShareCardSvg(params: ShareCardParams): string {
  const name = escapeXml(params.displayName);
  const placing = `#${params.rank} of ${params.totalRacers}`;
  const time = formatTime(params.bestMs);
  const mono = 'DejaVu Sans Mono, Menlo, monospace';

  return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a0a0f"/>
      <stop offset="1" stop-color="#0f0f1a"/>
    </linearGradient>
    <radialGradient id="glowCyan" cx="0.2" cy="0.15" r="0.5">
      <stop offset="0" stop-color="#06b6d4" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#06b6d4" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowMagenta" cx="0.85" cy="0.9" r="0.5">
      <stop offset="0" stop-color="#ec4899" stop-opacity="0.24"/>
      <stop offset="1" stop-color="#ec4899" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glowCyan)"/>
  <rect width="1200" height="630" fill="url(#glowMagenta)"/>
  <rect x="6" y="6" width="1188" height="618" fill="none" stroke="#334155" stroke-width="2" rx="18"/>

  <text x="90" y="120" font-family="${mono}" font-size="34" font-weight="bold" letter-spacing="6" fill="#22d3ee">VIM_GYM</text>
  <text x="1110" y="120" text-anchor="end" font-family="${mono}" font-size="26" fill="#64748b">${escapeXml(params.raceDate)}</text>

  <text x="90" y="280" font-family="${mono}" font-size="72" font-weight="bold" fill="#f1f5f9">${name}</text>
  <text x="90" y="380" font-family="${mono}" font-size="52" fill="#fbbf24">placed ${placing}</text>
  <text x="90" y="452" font-family="${mono}" font-size="40" fill="#34d399">${time} on today&#39;s race</text>

  <text x="90" y="540" font-family="${mono}" font-size="28" fill="#94a3b8">They think they&#39;re better than you. (at vim.)</text>
  <text x="90" y="582" font-family="${mono}" font-size="24" fill="#64748b">vimgym.app — race of the day</text>
</svg>`;
}

/** Rasterize the card SVG to PNG bytes. */
export async function renderShareCardPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}
