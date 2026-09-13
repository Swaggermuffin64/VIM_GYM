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

  it('escapes quotes and ampersands in metadata attributes', () => {
    // Craft a route whose metadata contains characters that would break
    // unescaped HTML attributes. We monkey-patch ROUTE_META temporarily
    // rather than changing the real values.
    const original = { ...ROUTE_META['/'] };
    try {
      (ROUTE_META as Record<string, typeof original>)['/'] = {
        ...original,
        title: 'A "quoted" & <dangerous> title',
        description: 'She said "hello" & waved <bye>',
      };
      const out = injectMeta(TEMPLATE, '/', '<p>x</p>');

      // The og:title content attribute must contain escaped forms
      expect(out).toContain(
        'content="A &quot;quoted&quot; &amp; &lt;dangerous&gt; title"'
      );
      // The og:description content attribute must contain escaped forms
      expect(out).toContain(
        'content="She said &quot;hello&quot; &amp; waved &lt;bye&gt;"'
      );

      // Raw unescaped quotes must not appear inside any content="..." attribute
      const contentAttrs = out.match(/content="[^"]*"/g) ?? [];
      for (const attr of contentAttrs) {
        // The inner value (between the outer quotes) must not contain raw " or unescaped &
        const inner = attr.slice('content="'.length, -1);
        expect(inner).not.toMatch(/(?<!&amp;|&quot;|&lt;|&gt;)["]/);
      }
    } finally {
      (ROUTE_META as Record<string, typeof original>)['/'] = original;
    }
  });

  it('throws when the #root anchor is not found in the template', () => {
    const badTemplate = `<!doctype html>
<html lang="en"><head><title>VIMGYM</title></head>
<body><div id="root" data-x="1"></div></body></html>`;
    expect(() => injectMeta(badTemplate, '/', '<p>content</p>')).toThrow(
      /id="root"/
    );
  });
});
