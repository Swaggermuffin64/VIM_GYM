// @vitest-environment jsdom
/**
 * Tests for StatusSegment: the Flawless (perfect-run) badge's holographic
 * finish, and that every other badge, and a locked Flawless, stays plain.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { StatusSegment } from './StatusSegment';
import { badgeInfo } from '../lib/dailyBadges';

afterEach(() => {
  cleanup();
});

describe('StatusSegment', () => {
  it('draws the Flawless badge with the foil, glow and sheen', () => {
    const { container } = render(
      <StatusSegment kind="flawless" label="EFF" value="100%" />
    );
    const segment = container.firstElementChild as HTMLElement;

    expect(segment.dataset.flawless).toBe('true');
    expect(segment.style.boxShadow).not.toBe('');
    expect(container.querySelector('.flawless-sheen')).not.toBeNull();
    const label = segment.firstElementChild as HTMLElement;
    expect(label.style.background).toContain('linear-gradient');
  });

  it('keeps a locked Flawless badge plain', () => {
    const { container } = render(
      <StatusSegment kind="flawless" label="EFF" value="100%" locked />
    );
    const segment = container.firstElementChild as HTMLElement;

    expect(segment.dataset.flawless).toBeUndefined();
    expect(container.querySelector('.flawless-sheen')).toBeNull();
  });

  it('keeps every other badge kind plain', () => {
    const { container } = render(
      <StatusSegment kind="eff" label="EFF" value="97%" />
    );

    expect(container.querySelector('[data-flawless]')).toBeNull();
    expect(container.querySelector('.flawless-sheen')).toBeNull();
  });

  it('gives the Flawless catalog badge the flawless kind', () => {
    expect(badgeInfo('first_perfect')?.kind).toBe('flawless');
  });
});
