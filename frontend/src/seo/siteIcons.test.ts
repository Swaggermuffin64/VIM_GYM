import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guards the site icon (the logo Google Search shows next to results, and the
 * browser tab icon). Both index.html and manifest.json point at image files in
 * public/, and a wrong path fails silently: the page still loads, just with no
 * logo. These tests check every referenced icon is the VIM GYM one and exists.
 */
const PUBLIC_DIR = resolve(__dirname, '../../public');
const NEW_ICON_FOLDER = '/vimgym-favicon/';

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8');
const manifest = JSON.parse(
  readFileSync(resolve(PUBLIC_DIR, 'manifest.json'), 'utf-8')
) as { icons: { src: string; sizes: string }[] };

/** Every href on a <link rel="icon"> or <link rel="apple-touch-icon"> tag. */
function iconLinkHrefs(): string[] {
  const linkTags = html.match(/<link\b[^>]*>/g) ?? [];
  return linkTags
    .filter((tag) => /rel="(icon|apple-touch-icon)"/.test(tag))
    .map((tag) => tag.match(/href="([^"]+)"/)?.[1] ?? '');
}

function existsInPublic(urlPath: string): boolean {
  return existsSync(resolve(PUBLIC_DIR, urlPath.replace(/^\//, '')));
}

describe('site icons', () => {
  it('links only icons from the VIM GYM icon folder in index.html', () => {
    const hrefs = iconLinkHrefs();
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith(NEW_ICON_FOLDER)).toBe(true);
    }
  });

  it('links icon files that exist', () => {
    for (const href of iconLinkHrefs()) {
      expect(existsInPublic(href), href).toBe(true);
    }
  });

  // Google ignores favicons that are not a multiple of 48px square.
  it('offers a 48px icon for Google Search', () => {
    expect(html).toMatch(/<link rel="icon"[^>]*sizes="48x48"/);
  });

  it('uses a PNG, not an .ico, for the Apple touch icon', () => {
    expect(html).toMatch(/rel="apple-touch-icon" href="[^"]+\.png"/);
  });

  it('lists only existing VIM GYM icons in manifest.json', () => {
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith(NEW_ICON_FOLDER)).toBe(true);
      expect(existsInPublic(icon.src), icon.src).toBe(true);
    }
  });

  // Regression: the old dumbbell icon lived in /favicon/.
  it('no longer references the old /favicon/ folder', () => {
    expect(html).not.toContain('"/favicon/');
    expect(JSON.stringify(manifest)).not.toContain('"/favicon/');
  });
});
