import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { httpErrorHandler, isDatabaseError } from './httpErrorHandler.js';

/** Build a minimal Fastify app with the shared error handler and one throwing route. */
async function buildAppThatThrows(err: Error) {
  const app = Fastify({ logger: false });
  app.setErrorHandler(httpErrorHandler);
  app.get('/boom', async () => {
    throw err;
  });
  await app.ready();
  return app;
}

function pgError(code: string, message: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

describe('isDatabaseError', () => {
  it('recognizes Postgres SQLSTATE codes like 28P01 (bad password)', () => {
    expect(
      isDatabaseError(pgError('28P01', 'password authentication failed'))
    ).toBe(true);
  });

  it('recognizes network-level codes like ECONNREFUSED and ETIMEDOUT', () => {
    expect(
      isDatabaseError(pgError('ECONNREFUSED', 'connect ECONNREFUSED'))
    ).toBe(true);
    expect(isDatabaseError(pgError('ETIMEDOUT', 'connect ETIMEDOUT'))).toBe(
      true
    );
  });

  it('does not treat Fastify framework errors as database errors', () => {
    expect(
      isDatabaseError(pgError('FST_ERR_VALIDATION', 'validation failed'))
    ).toBe(false);
  });

  it('does not treat plain errors without a code as database errors', () => {
    expect(isDatabaseError(new Error('boom'))).toBe(false);
  });
});

describe('httpErrorHandler', () => {
  it('returns 500 with the database error code in the body for pg auth failures', async () => {
    const app = await buildAppThatThrows(
      pgError('28P01', 'password authentication failed for user "postgres"')
    );
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      success: false,
      error: 'Database error',
      code: '28P01',
    });
    await app.close();
  });

  it('never leaks the raw error message for unknown errors', async () => {
    const app = await buildAppThatThrows(
      new Error('secret connection string postgres://user:pass@host')
    );
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      success: false,
      error: 'Internal server error',
    });
    expect(res.body).not.toContain('postgres://');
    await app.close();
  });

  it('preserves the status code of errors that carry one (e.g. rate limits)', async () => {
    const err = new Error('Rate limit exceeded') as Error & {
      statusCode: number;
    };
    err.statusCode = 429;
    const app = await buildAppThatThrows(err);
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(429);
    await app.close();
  });

  it('logs the underlying code and message so server logs show the root cause', async () => {
    const app = Fastify({ logger: false });
    app.setErrorHandler(httpErrorHandler);
    const logError = vi.fn();
    app.addHook('onRequest', async (request) => {
      request.log = Object.assign(Object.create(request.log), {
        error: logError,
      });
    });
    app.get('/boom', async () => {
      throw pgError('28P01', 'password authentication failed');
    });
    await app.inject({ method: 'GET', url: '/boom' });
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ code: '28P01' }),
      expect.stringContaining('password authentication failed')
    );
    await app.close();
  });
});
