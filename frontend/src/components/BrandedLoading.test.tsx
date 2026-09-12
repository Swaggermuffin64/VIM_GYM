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
