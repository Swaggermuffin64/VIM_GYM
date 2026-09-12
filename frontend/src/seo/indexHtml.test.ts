import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8');

describe('index.html', () => {
  // An <h1> in the shell competes with the real per-route <title>; Google was
  // splicing this one into titles as "VIMGYM - VIM_GYM".
  it('has no <h1> in the static shell', () => {
    expect(html).not.toMatch(/<h1/i);
  });

  it('still renders the mobile overlay message', () => {
    expect(html).toContain('mobile-overlay-title');
    expect(html).toContain('VIM_GYM');
  });

  // These are set per-route by PageMeta and baked in by the prerender script.
  // Leaving them here would emit duplicates.
  it('does not hardcode og: or description metadata', () => {
    expect(html).not.toMatch(/<meta\s+property="og:/i);
    expect(html).not.toMatch(/<meta\s+name="twitter:/i);
    expect(html).not.toMatch(/<meta\s+name="description"/i);
  });

  it('keeps a single generic fallback title', () => {
    const titles = html.match(/<title>/g) ?? [];
    expect(titles.length).toBe(1);
  });
});
