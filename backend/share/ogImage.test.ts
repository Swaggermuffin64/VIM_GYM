// backend/share/ogImage.test.ts
import { describe, it, expect } from 'vitest';
import { buildShareCardSvg, renderShareCardPng } from './ogImage.js';

const PARAMS = {
  displayName: 'stinkyhat',
  rank: 2,
  totalRacers: 14,
  bestMs: 41_200,
  raceDate: '2026-08-23',
};

describe('buildShareCardSvg', () => {
  it('renders the name, placing, time, and date at OG card size', () => {
    const svg = buildShareCardSvg(PARAMS);

    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
    expect(svg).toContain('stinkyhat');
    expect(svg).toContain('#2 of 14');
    expect(svg).toContain('41.2s');
    expect(svg).toContain('2026-08-23');
  });

  it('escapes a hostile display name', () => {
    const svg = buildShareCardSvg({
      ...PARAMS,
      displayName: '<script>alert(1)</script>',
    });

    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
});

describe('renderShareCardPng', () => {
  it('rasterizes the SVG to a real PNG', async () => {
    const png = await renderShareCardPng(buildShareCardSvg(PARAMS));

    // PNG magic bytes.
    expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(png.length).toBeGreaterThan(1000);
  });
});
