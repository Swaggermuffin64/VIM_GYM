import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SITE_NAME } from './routeMeta';

/**
 * Guards the web app manifest linked from index.html. Its name is one of the
 * signals search engines and browsers use to label the site, and it once
 * still carried the project's old name ("Vim Racing").
 */
const manifest = JSON.parse(
  readFileSync(resolve(__dirname, '../../public/manifest.json'), 'utf-8')
) as { name: string; short_name: string };

describe('manifest.json', () => {
  it('names the app with the two-word site name', () => {
    expect(manifest.name).toBe(SITE_NAME);
    expect(manifest.short_name).toBe(SITE_NAME);
  });
});
