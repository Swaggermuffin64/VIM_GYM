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
  it('renders the taunt, the time to beat, and the wordmark at OG card size', () => {
    const svg = buildShareCardSvg(PARAMS);

    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
    expect(svg).toContain('RACE ME IN');
    expect(svg).toContain('VIM BTW');
    expect(svg).toContain('Beat my time: 41.2 seconds.');
    expect(svg).toContain('VIM_GYM');
  });

  it('interpolates no user-controlled text, so a hostile name cannot reach the SVG', () => {
    const svg = buildShareCardSvg({
      ...PARAMS,
      displayName: '<script>alert(1)</script>',
    });

    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('alert(1)');
    expect(svg).not.toContain('stinkyhat');
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
