// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';

const authState: { session: Session | null } = { session: null };
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signInWithOAuth: vi.fn() } },
}));

const Login = (await import('./login')).default;

/** Renders the login page inside a router so <Link> and <Navigate> resolve. */
function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Login />
    </MemoryRouter>
  );
}

beforeEach(() => {
  authState.session = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Login page left panel', () => {
  it('lays the left panel out to mirror the right: logo top, hero centered, subtext bottom', () => {
    renderLogin();
    const logo = screen.getByText('VIM_GYM');
    expect(logo.style.fontSize).toBe('28px');
    expect(logo.style.position).toBe('');
    const panel = logo.parentElement as HTMLElement;
    expect(panel.style.justifyContent).toBe('space-between');
  });

  it('aligns the hero exactly with the Google button: equal top rows, equal band offsets', () => {
    renderLogin();
    const logo = screen.getByText('VIM_GYM');
    const heading = screen.getByText('Sign in to compete.');
    // Same fixed top-row height on both sides, so both middle bands start
    // at the same y position...
    expect(logo.style.height).toBe('40px');
    expect(heading.style.height).toBe(logo.style.height);
    const heroBand = screen.getByRole('heading', { level: 1 })
      .parentElement as HTMLElement;
    const buttonBand = screen.getByRole('button', {
      name: /continue with google/i,
    }).parentElement as HTMLElement;
    // ...and both bands top-align their content with the same offset, so
    // "How fast" and the Google box share a top edge.
    for (const band of [heroBand, buttonBand]) {
      expect(band.style.flex).toBe('1 1 0%');
      expect(band.style.justifyContent).toBe('flex-start');
      expect(band.style.paddingTop).toBe('40px');
    }
  });

  it('sizes the OAuth buttons to fill the panel comfortably', () => {
    renderLogin();
    const googleButton = screen.getByRole('button', {
      name: /continue with google/i,
    });
    expect(googleButton.style.padding).toBe('16px');
    expect(googleButton.style.fontSize).toBe('15px');
  });

  it('renders the hero phrase with "really" italicized', () => {
    renderLogin();
    const hero = screen.getByRole('heading', { level: 1 });
    expect(hero.textContent).toContain('How fast are you,');
    expect(hero.textContent).toContain('really?');
    const emphasis = within(hero).getByText('really');
    expect(emphasis.tagName).toBe('EM');
  });

  it('renders the racing subtext at a readable size', () => {
    renderLogin();
    const subtext = screen.getByText(/Race people with VIM motions\./);
    const list = subtext.parentElement as HTMLElement;
    expect(list.style.fontSize).toBe('16px');
  });

  it('no longer renders the old stat and marketing bullets', () => {
    renderLogin();
    expect(screen.queryByText(/10,000\+/)).toBeNull();
    expect(screen.queryByText('Free to play')).toBeNull();
    expect(screen.queryByText('Open source')).toBeNull();
  });

  it('renders the two floating background glows from the main page', () => {
    const { container } = renderLogin();
    const glows = container.querySelectorAll('[aria-hidden="true"]');
    expect(glows.length).toBe(2);
    const backgrounds = Array.from(glows).map(
      (glow) => (glow as HTMLElement).style.background
    );
    expect(backgrounds[0]).toContain('radial-gradient');
    expect(backgrounds[1]).toContain('radial-gradient');
  });

  it('renders the three bottom points as a bulleted list', () => {
    renderLogin();
    const points = screen.getAllByRole('listitem');
    expect(points.length).toBe(3);
    expect(points[0].textContent).toContain('Race people with VIM motions');
    expect(points[1].textContent).toContain('Assert VIM dominance.');
    expect(points[2].textContent).toContain('Entirely free and open source.');
  });

  it('greets users with "Sign in to compete."', () => {
    renderLogin();
    expect(screen.getByText('Sign in to compete.')).toBeDefined();
    expect(screen.queryByText('Welcome back')).toBeNull();
  });

  it('gives both panels the same top/middle/bottom layout so their edges line up', () => {
    renderLogin();
    const leftPanel = screen.getByText('VIM_GYM').parentElement as HTMLElement;
    const rightPanel = screen.getByText('Sign in to compete.')
      .parentElement as HTMLElement;
    expect(leftPanel.style.justifyContent).toBe('space-between');
    expect(rightPanel.style.justifyContent).toBe('space-between');
    expect(leftPanel.style.padding).toBe(rightPanel.style.padding);
    const card = leftPanel.parentElement as HTMLElement;
    expect(card.style.minHeight).toBe('380px');
  });

  it('keeps the legal text readable and marks its links with underlines', () => {
    renderLogin();
    const legal = screen.getByText(/By signing in you agree/);
    // 12px secondary gray clears WCAG AA contrast; 11px muted did not.
    expect(legal.style.fontSize).toBe('12px');
    const termsLink = screen.getByRole('link', { name: 'Terms of Service' });
    expect(termsLink.style.textDecoration).toBe('underline');
  });

  it('still renders both OAuth sign-in buttons', () => {
    renderLogin();
    expect(
      screen.getByRole('button', { name: /continue with google/i })
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: /continue with github/i })
    ).toBeDefined();
  });
});
