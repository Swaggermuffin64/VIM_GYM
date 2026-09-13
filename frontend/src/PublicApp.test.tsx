// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const authState = { session: null, profile: null, loading: false };
vi.mock('./contexts/AuthContext', () => ({ useAuth: () => authState }));

const { PublicApp } = await import('./PublicApp');

afterEach(cleanup);

describe('PublicApp', () => {
  it('renders the home view for /', () => {
    render(<PublicApp route="/" />);
    expect(
      screen.getByRole('heading', { name: /practice vim motions online/i })
    ).toBeDefined();
  });

  it('renders the practice view for /practice', () => {
    render(<PublicApp route="/practice" />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /practice vim motions solo/i,
      })
    ).toBeDefined();
  });

  it('renders the multiplayer view for /multiplayer', () => {
    render(<PublicApp route="/multiplayer" />);
    expect(
      screen.getByRole('heading', { level: 1, name: /race other developers/i })
    ).toBeDefined();
  });

  it('renders the about view for /about', () => {
    render(<PublicApp route="/about" />);
    expect(screen.getByText(/What is VIM_GYM\?/i)).toBeDefined();
  });
});
