// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BrandedLoading } from './BrandedLoading';

afterEach(cleanup);

describe('BrandedLoading', () => {
  it('renders the wordmark', () => {
    render(<BrandedLoading />);
    expect(screen.getByText('VIM_GYM')).toBeDefined();
  });

  it('marks itself busy for assistive tech', () => {
    render(<BrandedLoading />);
    expect(screen.getByRole('status')).toBeDefined();
  });
});

describe('BrandedLoading spinner', () => {
  it('shows a spinning ring that is hidden from assistive tech', () => {
    render(<BrandedLoading />);
    const ring = screen.getByTestId('branded-loading-spinner');
    expect(ring.getAttribute('aria-hidden')).toBe('true');
  });
});
