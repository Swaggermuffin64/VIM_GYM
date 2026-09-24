// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { AmbientGlow } from './AmbientGlow';

afterEach(cleanup);

describe('AmbientGlow', () => {
  it('renders both glow orbs, hidden from assistive tech', () => {
    render(<AmbientGlow />);
    for (const id of ['glow-primary', 'glow-secondary']) {
      const orb = screen.getByTestId(id);
      expect(orb.getAttribute('aria-hidden')).toBe('true');
      expect(orb.style.pointerEvents).toBe('none');
    }
  });

  it('renders to a string without a browser, so public pages can prerender it', () => {
    const html = renderToString(<AmbientGlow />);
    expect(html).toContain('radial-gradient');
  });
});
