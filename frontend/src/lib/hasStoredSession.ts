/** Matches the key supabase-js v2 persists its session under. */
const SUPABASE_TOKEN_KEY = /^sb-.+-auth-token$/;

/**
 * Synchronously reports whether a persisted Supabase session *might* exist.
 *
 * Used only to skip the loading screen for visitors who are definitively
 * logged out, so prerendered marketing content paints immediately instead of
 * being replaced by a spinner. A false positive costs a loading screen; it
 * never grants access, because AuthContext still verifies the real session.
 *
 * Returns false in non-browser environments (the prerender runs in Node) and
 * when storage is blocked by browser privacy settings.
 */
export function hasStoredSession(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && SUPABASE_TOKEN_KEY.test(key)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
