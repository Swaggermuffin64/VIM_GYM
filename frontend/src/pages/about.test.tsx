// @vitest-environment jsdom
/**
 * Tests for the About page: it must use the shared SiteBanner so the top
 * navigation stays consistent with the rest of the authenticated site.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import About from './about';

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
    // Profile and Sign out live inside the account dropdown ("ACCOUNT"
    // here because the test renders without an AuthProvider/profile).
    expect(screen.getByRole('button', { name: 'ACCOUNT' })).toBeTruthy();
  });
});
