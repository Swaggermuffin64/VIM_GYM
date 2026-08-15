import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Global HTTP error handler for the Fastify server.
 *
 * Unhandled route errors (most commonly database failures from `pg`) used to
 * surface as a bare 500 with no clue about the cause. This handler:
 *  - logs the underlying error code + message so server logs show the root
 *    cause (e.g. `28P01` = wrong database password, `ETIMEDOUT` = unreachable),
 *  - includes that short error code in the 500 response body so the failure
 *    class is visible from the browser network tab,
 *  - never leaks raw error messages (which can contain connection strings).
 */

/** Postgres SQLSTATE codes are exactly 5 chars, e.g. 28P01, 42P01, 57014. */
const PG_SQLSTATE = /^[0-9A-Z]{5}$/;

/** Node network-level codes seen when the database is unreachable. */
const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

/** True when the error came from the database layer (pg or the socket under it). */
export function isDatabaseError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code !== 'string') return false;
  return PG_SQLSTATE.test(code) || NETWORK_CODES.has(code);
}

export function httpErrorHandler(
  err: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  if (isDatabaseError(err)) {
    request.log.error(
      { code: err.code, url: request.url },
      `Database error: ${err.message}`
    );
    reply
      .status(500)
      .send({ success: false, error: 'Database error', code: err.code });
    return;
  }

  request.log.error(
    { code: err.code, url: request.url, statusCode: err.statusCode },
    err.message
  );

  // Errors that carry their own status (validation, rate limits) keep it and
  // their client-safe message; everything else becomes an opaque 500.
  const statusCode =
    err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  reply.status(statusCode).send({
    success: false,
    error: statusCode < 500 ? err.message : 'Internal server error',
  });
}
