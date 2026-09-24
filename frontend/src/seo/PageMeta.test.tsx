// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { PageMeta } from './PageMeta';
import { ROUTE_META } from './routeMeta';

afterEach(cleanup);

/** React 19 hoists title/meta/link into document.head, so assert there. */
function head(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute('content') ?? null;
}

describe('PageMeta', () => {
  it('sets the document title for the route', () => {
    render(<PageMeta route="/practice" />);
    expect(document.title).toBe(ROUTE_META['/practice'].title);
  });

  it('sets the meta description for the route', () => {
    render(<PageMeta route="/practice" />);
    expect(head('meta[name="description"]')).toBe(
      ROUTE_META['/practice'].description
    );
  });

  it('sets a canonical link on the www host', () => {
    render(<PageMeta route="/multiplayer" />);
    const canonical = document.head.querySelector('link[rel="canonical"]');
    expect(canonical?.getAttribute('href')).toBe(
      'https://www.vimgym.app/multiplayer'
    );
  });

  it('sets Open Graph tags matching the route metadata', () => {
    render(<PageMeta route="/about" />);
    expect(head('meta[property="og:title"]')).toBe(ROUTE_META['/about'].title);
    expect(head('meta[property="og:description"]')).toBe(
      ROUTE_META['/about'].description
    );
    expect(head('meta[property="og:url"]')).toBe(
      'https://www.vimgym.app/about'
    );
  });

  it('renders different titles for different routes', () => {
    const { unmount } = render(<PageMeta route="/" />);
    const homeTitle = document.title;
    unmount();
    render(<PageMeta route="/practice" />);
    expect(document.title).not.toBe(homeTitle);
  });
});
