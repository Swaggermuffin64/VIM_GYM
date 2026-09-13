// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const authState = { session: null, profile: null, loading: false };
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }));

const { default: HomePublic } = await import('./HomePublic');
const { ROUTE_META } = await import('../../seo/routeMeta');

afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter>
      <HomePublic />
    </MemoryRouter>
  );
}

describe('HomePublic', () => {
  it('renders the keyword heading for crawlers', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /practice vim motions online/i })
    ).toBeDefined();
  });

  it('sets the home page metadata', () => {
    renderPage();
    expect(document.title).toBe(ROUTE_META['/'].title);
  });

  // Descriptive internal links are what Google turns into sitelink labels.
  it('links to each public mode with descriptive anchor text', () => {
    renderPage();
    expect(
      screen.getByRole('link', { name: /practice/i }).getAttribute('href')
    ).toBe('/practice');
    expect(
      screen.getByRole('link', { name: /quick play/i }).getAttribute('href')
    ).toContain('/multiplayer');
  });

  it('offers a sign-in call to action', () => {
    renderPage();
    const cta = screen.getAllByRole('link', { name: /sign in/i })[0];
    expect(cta.getAttribute('href')).toBe('/login');
  });

  it('renders no live data', () => {
    renderPage();
    expect(screen.queryByText(/attempts remaining/i)).toBeNull();
  });
});
