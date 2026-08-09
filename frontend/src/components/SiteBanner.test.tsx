// @vitest-environment jsdom
/**
 * Tests for the SiteBanner account dropdown: the trigger shows the user's
 * display name (capped with an ellipsis), and opening it reveals the
 * Profile link and Sign out action that used to be top-level nav items.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const authState: { profile: { display_name: string } | null } = {
  profile: { display_name: 'zaphod' },
};
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }));

const signOut = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signOut: () => signOut() } },
}));

const { SiteBanner } = await import('./SiteBanner');

function render() {
  return rtlRender(
    <MemoryRouter>
      <SiteBanner />
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SiteBanner account dropdown', () => {
  it('shows the display name as the dropdown trigger', () => {
    authState.profile = { display_name: 'zaphod' };
    render();
    expect(screen.getByRole('button', { name: 'zaphod' })).toBeTruthy();
    // Profile/Sign out are inside the closed menu, not top-level items
    expect(screen.queryByRole('link', { name: /profile/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull();
  });

  it('caps long display names with an ellipsis', () => {
    authState.profile = { display_name: 'a'.repeat(30) };
    render();
    expect(
      screen.getByRole('button', { name: `${'a'.repeat(12)}…` })
    ).toBeTruthy();
  });

  it('falls back to ACCOUNT while the profile has not loaded', () => {
    authState.profile = null;
    render();
    expect(screen.getByRole('button', { name: 'ACCOUNT' })).toBeTruthy();
  });

  it('opens to reveal the Profile link and Sign out', async () => {
    authState.profile = { display_name: 'zaphod' };
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('button', { name: 'zaphod' }));
    const profileLink = screen.getByRole('link', { name: /profile/i });
    expect(profileLink.getAttribute('href')).toBe('/profile');
    await user.click(screen.getByRole('button', { name: /sign out/i }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('closes when clicking outside the menu', async () => {
    authState.profile = { display_name: 'zaphod' };
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('button', { name: 'zaphod' }));
    expect(screen.getByRole('link', { name: /profile/i })).toBeTruthy();
    await user.click(document.body);
    expect(screen.queryByRole('link', { name: /profile/i })).toBeNull();
  });
});
