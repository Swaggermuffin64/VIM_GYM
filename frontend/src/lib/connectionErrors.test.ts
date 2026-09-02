/**
 * Tests for connect_error copy.
 *
 * The codes asserted here are a contract with
 * backend/rateLimit/connectionRejection.ts — if either side renames one, the
 * player silently gets generic copy instead of an actionable explanation.
 */
import { describe, expect, it } from 'vitest';
import {
  connectionErrorCode,
  connectionErrorMessage,
} from './connectionErrors';

describe('connectionErrorMessage', () => {
  it('explains a full server', () => {
    const message = connectionErrorMessage({
      message: 'Server is at capacity. Please try again in a moment.',
      data: { code: 'SERVER_AT_CAPACITY' },
    });
    expect(message).toContain('full');
  });

  it('tells a saturated network what to do about it', () => {
    const message = connectionErrorMessage({
      message: 'Too many connections from your network.',
      data: { code: 'TOO_MANY_CONNECTIONS_FROM_IP' },
    });
    expect(message).toContain('tabs');
  });

  it('falls back to the server message for an unknown code', () => {
    expect(
      connectionErrorMessage({
        message: 'Authentication failed',
        data: { code: 'SOMETHING_NEW' },
      })
    ).toBe('Authentication failed');
  });

  it('falls back to the server message when no code is attached', () => {
    expect(connectionErrorMessage(new Error('Authentication failed'))).toBe(
      'Authentication failed'
    );
  });

  it('never returns an empty message', () => {
    expect(connectionErrorMessage(new Error('')).length).toBeGreaterThan(0);
    expect(connectionErrorMessage(undefined).length).toBeGreaterThan(0);
    expect(connectionErrorMessage({ data: null }).length).toBeGreaterThan(0);
  });
});

describe('connectionErrorCode', () => {
  it('reads the code the server attached', () => {
    expect(connectionErrorCode({ data: { code: 'SERVER_AT_CAPACITY' } })).toBe(
      'SERVER_AT_CAPACITY'
    );
  });

  it('returns null when there is no usable code', () => {
    expect(connectionErrorCode(new Error('boom'))).toBeNull();
    expect(connectionErrorCode({ data: { code: 42 } })).toBeNull();
    expect(connectionErrorCode(null)).toBeNull();
  });
});
