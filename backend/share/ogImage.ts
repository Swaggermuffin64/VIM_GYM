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

/** Format milliseconds as seconds with one decimal, e.g. "41.2". */
function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

export interface ShareCardParams {
  displayName: string;
  rank: number;
  totalRacers: number;
  bestMs: number;
  raceDate: string;
}

/** Compose the 1200x630 share-card SVG. Pure; no user text is interpolated. */
export function buildShareCardSvg(params: ShareCardParams): string {
  const seconds = formatSeconds(params.bestMs);
  const mono = 'DejaVu Sans Mono, Menlo, monospace';
  // Matches the SiteBanner wordmark: JetBrains Mono, bold, textPrimary white.
  // "JetBrains Mono NL" is the no-ligatures variant some installs register as.
  const logoMono =
    'JetBrains Mono, JetBrains Mono NL, DejaVu Sans Mono, monospace';

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

  <text x="90" y="222" font-family="${mono}" font-size="150" font-weight="bold" fill="#f1f5f9">RACE ME IN</text>
  <text x="90" y="382" font-family="${mono}" font-size="150" font-weight="bold" fill="#f1f5f9">VIM BTW</text>
  <text x="90" y="502" font-family="${mono}" font-size="56" font-weight="bold" fill="#f1f5f9">Beat my time: ${seconds} seconds.</text>

  <text x="1110" y="588" text-anchor="end" font-family="${logoMono}" font-size="40" font-weight="bold" fill="#f1f5f9">VIM_GYM</text>
</svg>`;
}

/** Rasterize the card SVG to PNG bytes. */
export async function renderShareCardPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}
