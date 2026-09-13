/**
 * Tests for connection rejection errors.
 *
 * The `data.code` payload is a contract with the frontend (see
 * frontend/src/lib/connectionErrors.ts): if it stops being attached, the lobby
 * silently falls back to a generic message and the player cannot tell a full
 * server from a broken one.
 */
import { describe, expect, it } from 'vitest';
import {
  CONNECTION_REJECTIONS,
  connectionRejectionError,
} from './connectionRejection.js';

describe('connectionRejectionError', () => {
  it('carries a machine-readable code for a full server', () => {
    const error = connectionRejectionError('server_at_capacity');
    expect(error).toBeInstanceOf(Error);
    expect(error.data).toEqual({ code: 'SERVER_AT_CAPACITY' });
  });

  it('carries a machine-readable code for a saturated IP', () => {
    const error = connectionRejectionError('too_many_from_ip');
    expect(error.data).toEqual({ code: 'TOO_MANY_CONNECTIONS_FROM_IP' });
  });

  it('includes human-readable fallback copy for every reason', () => {
    for (const reason of Object.keys(CONNECTION_REJECTIONS) as Array<
      keyof typeof CONNECTION_REJECTIONS
    >) {
      expect(connectionRejectionError(reason).message.length).toBeGreaterThan(
        0
      );
    }
  });
});
