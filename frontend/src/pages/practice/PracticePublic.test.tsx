// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const authState = { session: null, profile: null, loading: false };
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }));

const { default: PracticePublic } = await import('./PracticePublic');
const { ROUTE_META } = await import('../../seo/routeMeta');

afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter>
      <PracticePublic />
    </MemoryRouter>
  );
}

describe('PracticePublic', () => {
  it('sets the practice page metadata', () => {
    renderPage();
    expect(document.title).toBe(ROUTE_META['/practice'].title);
  });

  it('explains what practice mode is', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: /practice/i })
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
});
