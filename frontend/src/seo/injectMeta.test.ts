import { describe, it, expect } from 'vitest';
import { stripHoistableTags, injectMeta } from './injectMeta';
import { ROUTE_META } from './routeMeta';

const TEMPLATE = `<!doctype html>
<html lang="en"><head><title>VIMGYM</title></head>
<body><div id="root"></div></body></html>`;

describe('stripHoistableTags', () => {
  it('removes title, meta and canonical link tags', () => {
    const body =
      '<div><title>X</title><meta name="description" content="y"/>' +
      '<link rel="canonical" href="z"/><p>keep me</p></div>';
    const out = stripHoistableTags(body);
    expect(out).not.toContain('<title>');
    expect(out).not.toContain('name="description"');
    expect(out).not.toContain('rel="canonical"');
    expect(out).toContain('keep me');
  });

  it('leaves ordinary markup untouched', () => {
    const body = '<main><h1>Hello</h1><p>World</p></main>';
    expect(stripHoistableTags(body)).toBe(body);
  });
});

describe('injectMeta', () => {
  const html = injectMeta(
    TEMPLATE,
    '/practice',
    '<main><h1>Practice</h1></main>'
  );

  it('replaces the placeholder title with the route title', () => {
    expect(html).toContain(`<title>${ROUTE_META['/practice'].title}</title>`);
    expect(html).not.toContain('<title>VIMGYM</title>');
  });

  it('adds the route description', () => {
    expect(html).toContain(
      `<meta name="description" content="${ROUTE_META['/practice'].description}">`
    );
  });

  it('adds a canonical link on the www host', () => {
    expect(html).toContain(
      '<link rel="canonical" href="https://www.vimgym.app/practice">'
    );
  });

  it('mounts the rendered body inside #root', () => {
    expect(html).toContain(
      '<div id="root"><main><h1>Practice</h1></main></div>'
    );
  });

  it('escapes quotes in metadata so attributes cannot break', () => {
    const out = injectMeta(TEMPLATE, '/', '<p>x</p>');
    const quoted = out.match(/content="([^"]*)"/g) ?? [];
    expect(quoted.length).toBeGreaterThan(0);
  });
});
