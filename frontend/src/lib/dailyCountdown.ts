/**
 * Countdown to the next UTC midnight, when Race of the Day rolls over.
 *
 * Shared by the daily page (which shows it once attempts run out) and the home
 * page's daily panel (which always shows it), so both agree on when "tomorrow"
 * starts and neither has to own an interval.
 */
import { useEffect, useState } from 'react';

/** Milliseconds from `now` until the next UTC midnight. Never negative. */
export function msUntilNextUtcMidnight(now: number = Date.now()): number {
  const date = new Date(now);
  const tomorrow = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1
  );
  return Math.max(0, tomorrow - now);
}

/** Format ms as HH:MM:SS, e.g. "07:42:13". */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * Live "HH:MM:SS until the next daily race" string, ticking once a second.
 * Returns '' while `enabled` is false so callers can mount it unconditionally
 * and let the flag decide, rather than branching around the hook.
 */
export function useUtcMidnightCountdown(enabled: boolean): string {
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    if (!enabled) {
      setCountdown('');
      return;
    }
    const tick = () => setCountdown(formatCountdown(msUntilNextUtcMidnight()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [enabled]);

  return countdown;
}
