import { describe, it, expect } from 'vitest';
import { shouldHydrate } from './shouldHydrate';

describe('shouldHydrate', () => {
  it('hydrates a visitor on a prerendered page', () => {
    expect(
      shouldHydrate({ hasPrerenderedMarkup: true, hasStoredSession: false })
    ).toBe(true);
  });

  // The prerendered markup is the logged-out view; a member's first render is
  // the loading screen, so hydrating would mismatch and be discarded anyway.
  it('does not hydrate when a stored session means the first render differs', () => {
    expect(
      shouldHydrate({ hasPrerenderedMarkup: true, hasStoredSession: true })
    ).toBe(false);
  });

  it('never hydrates the empty app shell', () => {
    expect(
      shouldHydrate({ hasPrerenderedMarkup: false, hasStoredSession: false })
    ).toBe(false);
    expect(
      shouldHydrate({ hasPrerenderedMarkup: false, hasStoredSession: true })
    ).toBe(false);
  });
});
