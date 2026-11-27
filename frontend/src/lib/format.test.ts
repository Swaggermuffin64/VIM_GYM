import { describe, it, expect } from 'vitest';
import { formatPlacing } from './format';

describe('formatPlacing', () => {
  it('renders rank/racers', () => {
    expect(formatPlacing(4, 44)).toBe('4/44');
  });

  it('handles a field of one', () => {
    expect(formatPlacing(1, 1)).toBe('1/1');
  });
});
