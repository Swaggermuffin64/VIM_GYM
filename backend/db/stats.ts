/**
 * Persistence for games, game_players, tasks, and task_attempts
 * (spec: docs/superpowers/specs/2026-08-08-games-and-player-stats-design.md).
 *
 * Every writer here is best-effort: null-pool tolerant, logs failures with
 * the pg error code, and never throws into the game/practice flow.
 */
import type { KeystrokeEvent } from '../types.js';

/** Hard cap on stored replay events; bigger arrays are dropped (metrics kept). */
export const MAX_STORED_KEYSTROKES = 50;

export interface CompactKeystroke {
  /** Key with modifier prefix: "w", "C-r" (ctrl), "M-x" (meta), "A-b" (alt). */
  k: string;
  /** Milliseconds since the first event; non-decreasing. */
  t: number;
}

/**
 * Compact client KeystrokeEvents into the stored replay shape.
 * Returns null when empty or over the cap — caller stores SQL NULL.
 */
export function compactKeystrokes(
  events: KeystrokeEvent[]
): CompactKeystroke[] | null {
  if (events.length === 0 || events.length > MAX_STORED_KEYSTROKES) return null;
  const out: CompactKeystroke[] = [];
  let t = 0;
  let first = true;
  for (const e of events) {
    if (!first) t += Math.max(0, e.dtMs);
    first = false;
    let k = e.key;
    if (e.altKey) k = `A-${k}`;
    if (e.metaKey) k = `M-${k}`;
    if (e.ctrlKey) k = `C-${k}`;
    out.push({ k, t });
  }
  return out;
}
