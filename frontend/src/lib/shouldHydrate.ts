/**
 * Decides whether the client should hydrate prerendered markup or discard it
 * and mount fresh.
 *
 * The prerender only ever renders the logged-out view (see PublicApp.tsx).
 * A visitor's first client render is that same view, so hydration attaches
 * cleanly. A member with a stored token starts in the loading state instead,
 * which does not match the markup; React would log a hydration error and
 * throw the server HTML away anyway. Skipping hydration for them avoids the
 * error and the wasted pass, and costs nothing they were not already paying.
 */
export function shouldHydrate({
  hasPrerenderedMarkup,
  hasStoredSession,
}: {
  hasPrerenderedMarkup: boolean;
  hasStoredSession: boolean;
}): boolean {
  return hasPrerenderedMarkup && !hasStoredSession;
}
