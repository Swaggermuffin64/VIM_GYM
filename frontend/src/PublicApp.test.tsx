// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const authState = { session: null, profile: null, loading: false };
vi.mock('./contexts/AuthContext', () => ({ useAuth: () => authState }));
// Fetches on mount; the prerender never runs effects, but jsdom does.
vi.mock('./components/LeaderboardTable', () => ({
  LeaderboardTable: () => <div>LEADERBOARD</div>,
}));

const { PublicApp } = await import('./PublicApp');

afterEach(cleanup);

describe('PublicApp', () => {
  it('renders the home menu for /', () => {
    render(<PublicApp route="/" />);
    expect(
      screen.getByRole('heading', { name: /practice vim motions online/i })
    ).toBeDefined();
    expect(screen.getByText('Sign in to race')).toBeDefined();
  });

  it('renders the visitor lobby for /multiplayer', () => {
    render(<PublicApp route="/multiplayer" />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Multiplayer' })
    ).toBeDefined();
  });

  it('renders the about view for /about', () => {
    render(<PublicApp route="/about" />);
    expect(screen.getByText(/What is VIM_GYM\?/i)).toBeDefined();
  });
});
