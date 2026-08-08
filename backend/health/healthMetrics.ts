/**
 * Health Endpoint Access Control
 *
 * The `/health` endpoint must stay publicly reachable so Fly.io's health
 * checker (which sends no authentication) can read the 200/503 status code and
 * restart the machine when memory runs high. But the detailed body — heap
 * stats, event-loop lag, room and connection counts, uptime, database status —
 * is operational intelligence that helps an attacker time and tune abuse.
 *
 * This module keeps the two concerns separate: everyone gets a minimal
 * status, and only a caller presenting the shared `HEALTH_METRICS_TOKEN` gets
 * the full diagnostic payload. When the token is unset the detailed metrics are
 * never exposed (fail closed).
 */

import type { IncomingHttpHeaders } from 'node:http';

/** Header a caller uses to request detailed health metrics. */
export const HEALTH_METRICS_HEADER = 'x-health-token';

/**
 * Whether a request is authorized to receive the detailed health payload.
 *
 * Returns false whenever no token is configured, so a misconfigured or
 * unconfigured deployment leaks nothing beyond the minimal status.
 *
 * @param headers        Incoming request headers.
 * @param configuredToken The server's `HEALTH_METRICS_TOKEN`, or undefined.
 */
export function isAuthorizedForHealthMetrics(
  headers: IncomingHttpHeaders,
  configuredToken: string | undefined
): boolean {
  if (!configuredToken) return false;

  const provided = headers[HEALTH_METRICS_HEADER];
  const providedValue = Array.isArray(provided) ? provided[0] : provided;

  return providedValue === configuredToken;
}
