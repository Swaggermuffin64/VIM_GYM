/**
 * Remembers that the user arrived via a daily-challenge share link across the
 * OAuth round-trip (sessionStorage survives same-tab redirects), so login and
 * onboarding can land them on /daily instead of the home page.
 *
 * sessionStorage access is wrapped in try/catch because Safari private mode
 * throws when writing. In that case we silently degrade to '/'.
 */

const CHALLENGE_SLUG_KEY = 'vimgym.challengeSlug';

/** Only alphanumeric, exactly 10 characters. */
const SLUG_PATTERN = /^[0-9A-Za-z]{10}$/;

/**
 * Stash the challenge slug in sessionStorage so it survives the OAuth redirect.
 * Invalid slugs are silently ignored.
 */
export function stashChallengeSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) return;
  try {
    sessionStorage.setItem(CHALLENGE_SLUG_KEY, slug);
  } catch {
    // Safari private mode -- silently degrade
  }
}

/**
 * Read the stashed slug without consuming it.
 * Returns null when nothing is stashed or sessionStorage is unavailable.
 */
export function peekChallengeSlug(): string | null {
  try {
    return sessionStorage.getItem(CHALLENGE_SLUG_KEY);
  } catch {
    return null;
  }
}

/**
 * Returns '/daily' if a challenge slug is pending, otherwise '/'.
 *
 * Never clears the stash: the journey can take several hops (login →
 * onboarding → /daily for new users, or / → /daily via AuthGuard for
 * existing ones), and every hop needs to see the slug. The daily page
 * clears it on arrival via clearChallengeSlug.
 */
export function postAuthDestination(): string {
  return peekChallengeSlug() ? '/daily' : '/';
}

/** Remove the stashed slug. Called by the daily page once the user arrives. */
export function clearChallengeSlug(): void {
  try {
    sessionStorage.removeItem(CHALLENGE_SLUG_KEY);
  } catch {
    // sessionStorage unavailable -- nothing to clear
  }
}
