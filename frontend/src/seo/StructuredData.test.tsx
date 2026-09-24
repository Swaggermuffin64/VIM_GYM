// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { StructuredData } from './StructuredData';
import { PUBLIC_ROUTES, ROUTE_META } from './routeMeta';

afterEach(cleanup);

describe('StructuredData', () => {
  function parsed() {
    const { container } = render(<StructuredData />);
    const script = container.querySelector(
      'script[type="application/ld+json"]'
    );
    return JSON.parse(script!.textContent!);
  }

  it('declares a WebSite on the www host', () => {
    const data = parsed();
    const site = data['@graph'].find(
      (n: { '@type': string }) => n['@type'] === 'WebSite'
    );
    expect(site.url).toBe('https://www.vimgym.app');
    expect(site.name).toBe('VIM_GYM');
  });

  it('lists every public route as a navigation element', () => {
    const data = parsed();
    const nav = data['@graph'].filter(
      (n: { '@type': string }) => n['@type'] === 'SiteNavigationElement'
    );
    expect(nav.length).toBe(PUBLIC_ROUTES.length);
    for (const route of PUBLIC_ROUTES) {
      expect(nav.some((n: { url: string }) => n.url.endsWith(route))).toBe(
        true
      );
    }
  });

  it('names navigation elements from ROUTE_META', () => {
    const data = parsed();
    const nav = data['@graph'].find(
      (n: { '@type': string; url: string }) =>
        n['@type'] === 'SiteNavigationElement' && n.url.endsWith('/practice')
    );
    expect(nav.name).toBe(ROUTE_META['/practice'].title);
  });
});
