// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const authState = { session: null, profile: null, loading: false };
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }));

const { default: MultiplayerPublic } = await import('./MultiplayerPublic');
const { ROUTE_META } = await import('../../seo/routeMeta');

afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter>
      <MultiplayerPublic />
    </MemoryRouter>
  );
}

describe('MultiplayerPublic', () => {
  it('sets the multiplayer page metadata', () => {
    renderPage();
    expect(document.title).toBe(ROUTE_META['/multiplayer'].title);
  });

  it('explains how races work', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: /race/i })
    ).toBeDefined();
  });

  it('offers a sign-in call to action', () => {
    renderPage();
    expect(
      screen.getAllByRole('link', { name: /sign in/i })[0].getAttribute('href')
    ).toBe('/login');
  });

  it('has enough body copy to form a search snippet', () => {
    const { container } = renderPage();
    expect((container.textContent ?? '').length).toBeGreaterThan(300);
  });

  // Live data was deliberately cut from the public pages; nothing here may
  // fetch, or the prerender would bake in a loading state.
  it('renders no live data', () => {
    renderPage();
    expect(screen.queryByText(/players online/i)).toBeNull();
  });
});
