// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ChallengeTaunt, formatSeconds } from './ChallengeTaunt';

afterEach(cleanup);

const CHALLENGE = {
  displayName: 'Jackson',
  rank: 4,
  totalRacers: 212,
  bestMs: 61_300,
  raceDate: '2026-08-16',
};

describe('ChallengeTaunt', () => {
  it('names the challenger, their time, and the given call to action', () => {
    render(<ChallengeTaunt challenge={CHALLENGE} callToAction="Beat them." />);
    const banner = screen.getByRole('status');
    expect(banner.textContent).toContain('Jackson');
    expect(banner.textContent).toContain('61.3 seconds');
    expect(banner.textContent).toContain('Beat them.');
  });

  it('formats milliseconds as seconds with one decimal', () => {
    expect(formatSeconds(15_702)).toBe('15.7');
  });
});
