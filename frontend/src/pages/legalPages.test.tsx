// @vitest-environment jsdom
/**
 * Tests for the public legal pages (/privacy and /terms): they must render
 * logged-out (Google OAuth verification crawls them), name the actual data
 * practices, and link back to the home page.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PrivacyPolicy from './privacy';
import TermsOfService from './terms';

afterEach(cleanup);

describe('PrivacyPolicy page', () => {
  it('renders the policy with data practices and a contact address', () => {
    render(
      <MemoryRouter>
        <PrivacyPolicy />
      </MemoryRouter>
    );
    expect(
      screen.getByRole('heading', { name: /privacy policy/i })
    ).toBeTruthy();
    expect(screen.getAllByText(/keystroke/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/supabase/i).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/gunnarlila2000@gmail\.com/i).length
    ).toBeGreaterThan(0);
  });

  it('links back to the home page', () => {
    render(
      <MemoryRouter>
        <PrivacyPolicy />
      </MemoryRouter>
    );
    const homeLink = screen.getByRole('link', { name: 'VIM_GYM' });
    expect(homeLink.getAttribute('href')).toBe('/');
  });
});

describe('TermsOfService page', () => {
  it('renders the terms with fair-play rules and a contact address', () => {
    render(
      <MemoryRouter>
        <TermsOfService />
      </MemoryRouter>
    );
    expect(
      screen.getByRole('heading', { name: /terms of service/i })
    ).toBeTruthy();
    expect(screen.getAllByText(/cheat/i).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/gunnarlila2000@gmail\.com/i).length
    ).toBeGreaterThan(0);
  });

  it('links back to the home page', () => {
    render(
      <MemoryRouter>
        <TermsOfService />
      </MemoryRouter>
    );
    const homeLink = screen.getByRole('link', { name: 'VIM_GYM' });
    expect(homeLink.getAttribute('href')).toBe('/');
  });
});
