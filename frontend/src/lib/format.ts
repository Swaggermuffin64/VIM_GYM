/** Display formatters shared by the profile page and its sections. */

/** 61234 -> "1:01.2"; 4120 -> "4.1s". Race times get m:ss.t, short times s.t. */
export function formatDuration(ms: number): string {
  const tenths = Math.round(ms / 100); // deciseconds, rounded once
  const totalSec = Math.floor(tenths / 10);
  const frac = tenths % 10;
  if (totalSec < 60) return `${totalSec}.${frac}s`;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec - minutes * 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${frac}`;
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 11 -> "11th", 21 -> "21st". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  const suffix =
    mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}
