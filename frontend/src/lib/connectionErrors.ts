/**
 * Connection Error Copy
 *
 * The game server can refuse a socket during the handshake — the process is at
 * capacity, or one network already holds too many connections. Socket.IO
 * surfaces that to `connect_error` with a stable code in `err.data.code` (see
 * backend/rateLimit/connectionRejection.ts).
 *
 * Socket.IO does *not* retry after a handshake rejection, so the lobby would
 * otherwise sit on "Connecting..." forever with no explanation. This module
 * turns the code into copy that tells the player what happened and what to do.
 */

/** Codes the backend attaches to a handshake rejection. */
export const SERVER_AT_CAPACITY = 'SERVER_AT_CAPACITY';
export const TOO_MANY_CONNECTIONS_FROM_IP = 'TOO_MANY_CONNECTIONS_FROM_IP';

const MESSAGES_BY_CODE: Record<string, string> = {
  [SERVER_AT_CAPACITY]:
    'The server is full right now. Give it a moment and try again — races already in progress are finishing up.',
  [TOO_MANY_CONNECTIONS_FROM_IP]:
    'Too many connections from your network. Close any other Vim Gym tabs and try again.',
};

const GENERIC_MESSAGE =
  'Could not connect to the game server. Check your connection and try again.';

/** The rejection code on a `connect_error`, if the server attached one. */
export function connectionErrorCode(error: unknown): string | null {
  const data = (error as { data?: unknown } | null)?.data;
  if (data && typeof data === 'object' && 'code' in data) {
    const { code } = data as { code?: unknown };
    if (typeof code === 'string') return code;
  }
  return null;
}

/**
 * Player-facing message for a `connect_error`.
 *
 * Prefers our own copy for a known code, then the server's message, then a
 * generic fallback — so a rejection is never silent, whatever its shape.
 */
export function connectionErrorMessage(error: unknown): string {
  const code = connectionErrorCode(error);
  if (code && MESSAGES_BY_CODE[code]) {
    return MESSAGES_BY_CODE[code];
  }

  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }

  return GENERIC_MESSAGE;
}
