// @vitest-environment jsdom
/**
 * Tests for the About page: it must use the shared SiteBanner so the top
 * navigation stays consistent with the rest of the authenticated site.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import About from './about';
import { ROUTE_META } from '../seo/routeMeta';

afterEach(cleanup);

describe('About page site banner', () => {
  it('shows the full shared navigation, not a cut-down banner', () => {
    render(
      <MemoryRouter>
        <About />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'VIM_GYM' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /github/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /discord/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'ABOUT' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'SUPPORT' })).toBeTruthy();
    // Without an AuthProvider the context default has session: null, so the
    // banner renders a SIGN IN link instead of the account dropdown.
    expect(screen.getByRole('link', { name: /sign in/i })).toBeTruthy();
  });
});

describe('About page heading hierarchy', () => {
  it('has a keyword-bearing h1 consistent with ROUTE_META', () => {
    render(
      <MemoryRouter initialEntries={['/about']}>
        <About />
      </MemoryRouter>
    );
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe(ROUTE_META['/about'].title);
  });
});

describe('About page content', () => {
  it('renders its content with no session', () => {
    render(
      <MemoryRouter initialEntries={['/about']}>
        <About />
      </MemoryRouter>
    );
    expect(screen.getByText(/What is VIM_GYM\?/i)).toBeDefined();
  });

  it('sets the about page title', () => {
    render(
      <MemoryRouter initialEntries={['/about']}>
        <About />
      </MemoryRouter>
    );
    expect(document.title).toBe(ROUTE_META['/about'].title);
  });
});
