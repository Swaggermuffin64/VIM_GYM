// backend/daily/dailyDate.test.ts
import { describe, it, expect } from 'vitest';
import { utcDateKey, msUntilNextUtcMidnight } from './dailyDate.js';

describe('utcDateKey', () => {
  it('formats the UTC calendar day as YYYY-MM-DD', () => {
    expect(utcDateKey(new Date('2026-08-15T00:00:00Z'))).toBe('2026-08-15');
    expect(utcDateKey(new Date('2026-08-15T23:59:59Z'))).toBe('2026-08-15');
  });

  it('uses the UTC day, not the local day, near midnight', () => {
    // 23:30 UTC on the 15th is already the 15th regardless of local zone.
    expect(utcDateKey(new Date('2026-08-15T23:30:00Z'))).toBe('2026-08-15');
    expect(utcDateKey(new Date('2026-08-16T00:30:00Z'))).toBe('2026-08-16');
  });

  it('zero-pads month and day', () => {
    expect(utcDateKey(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05');
  });
});

describe('msUntilNextUtcMidnight', () => {
  it('returns the gap to the next UTC midnight', () => {
    expect(msUntilNextUtcMidnight(new Date('2026-08-15T23:00:00Z'))).toBe(
      60 * 60 * 1000
    );
  });

  it('returns a full day at exactly midnight', () => {
    expect(msUntilNextUtcMidnight(new Date('2026-08-15T00:00:00Z'))).toBe(
      24 * 60 * 60 * 1000
    );
  });
});
