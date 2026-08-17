// backend/daily/dailyDate.ts
/**
 * UTC day-boundary helpers for Race of the Day.
 *
 * The daily race rolls over at midnight UTC for everyone; these helpers are
 * the single source of truth for "which day is it" (utcDateKey — used as the
 * daily_races primary key) and "when does today's race end"
 * (msUntilNextUtcMidnight — used for the come-back-tomorrow countdown).
 */

/** Returns the UTC calendar day of `d` as 'YYYY-MM-DD'. */
export function utcDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Milliseconds from `d` until the next UTC midnight (full day if exactly midnight). */
export function msUntilNextUtcMidnight(d: Date): number {
  const next = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1
  );
  return next - d.getTime();
}
