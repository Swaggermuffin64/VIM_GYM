// @vitest-environment jsdom
/**
 * Tests for BadgeValue: the win badge's per-board split in each board's
 * colour, and every other case falling back to the catalog value.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BadgeValue } from './BadgeValue';
import { WIN_SPLIT_COLORS, badgeInfo } from '../lib/dailyBadges';

afterEach(() => {
  cleanup();
});

/** jsdom reports inline colours as rgb(); hex theme colours need converting. */
function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

const win = badgeInfo('first_win')!;

describe('BadgeValue', () => {
  it('splits the win badge into amber speed and cyan efficiency counts', () => {
    const { container } = render(
      <BadgeValue info={win} wins={{ speed: 3, efficiency: 2 }} />
    );

    expect(container.textContent).toBe('S3|E2');
    expect(screen.getByText('S3').style.color).toBe(
      rgb(WIN_SPLIT_COLORS.speed)
    );
    expect(screen.getByText('E2').style.color).toBe(
      rgb(WIN_SPLIT_COLORS.efficiency)
    );
  });

  it('shows the catalog value before the first win', () => {
    const { container } = render(
      <BadgeValue info={win} wins={{ speed: 0, efficiency: 0 }} />
    );
    expect(container.textContent).toBe('1st');
  });

  it('shows the catalog value for any other badge', () => {
    const { container } = render(
      <BadgeValue
        info={badgeInfo('days_7')!}
        wins={{ speed: 3, efficiency: 2 }}
      />
    );
    expect(container.textContent).toBe('7');
  });
});
