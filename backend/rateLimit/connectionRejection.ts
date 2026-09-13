/**
 * Connection Rejection Reasons
 *
 * A socket turned away during the Socket.IO handshake needs to tell the client
 * *why*, because Socket.IO does not retry after a middleware rejection: the
 * client is stuck until a human acts. Without a reason the lobby just sits on
 * "Connecting..." forever.
 *
 * Socket.IO forwards both `err.message` and `err.data` from a middleware error
 * to the client's `connect_error` handler, so the rejection carries a stable
 * machine-readable code alongside the human message. The frontend maps those
 * codes to its own copy in `frontend/src/lib/connectionErrors.ts` — keep the
 * two lists in sync.
 */

/** Why the connection limiter refused a connection. */
export type ConnectionRejectionReason =
  | 'server_at_capacity'
  | 'too_many_from_ip';

/** Stable code sent to the client for each rejection reason. */
export type ConnectionRejectionCode =
  | 'SERVER_AT_CAPACITY'
  | 'TOO_MANY_CONNECTIONS_FROM_IP';

interface ConnectionRejection {
  code: ConnectionRejectionCode;
  /** Fallback copy, used if the client has no message for the code. */
  message: string;
}

export const CONNECTION_REJECTIONS: Record<
  ConnectionRejectionReason,
  ConnectionRejection
> = {
  server_at_capacity: {
    code: 'SERVER_AT_CAPACITY',
    message: 'Server is at capacity. Please try again in a moment.',
  },
  too_many_from_ip: {
    code: 'TOO_MANY_CONNECTIONS_FROM_IP',
    message:
      'Too many connections from your network. Please close other tabs and try again.',
  },
};

/** A handshake error carrying a rejection code the client can branch on. */
export type ConnectionRejectionError = Error & {
  data: { code: ConnectionRejectionCode };
};

/**
 * Build the Error handed to Socket.IO's `next()` for a rejected connection.
 */
export function connectionRejectionError(
  reason: ConnectionRejectionReason
): ConnectionRejectionError {
  const { code, message } = CONNECTION_REJECTIONS[reason];
  const error = new Error(message) as ConnectionRejectionError;
  error.data = { code };
  return error;
}
