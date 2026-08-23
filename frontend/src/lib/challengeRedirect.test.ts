// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

import {
  stashChallengeSlug,
  peekChallengeSlug,
  postAuthDestination,
  clearChallengeSlug,
} from './challengeRedirect';

beforeEach(() => {
  sessionStorage.clear();
});

describe('challengeRedirect', () => {
  it('round-trips a slug through stash and peek', () => {
    stashChallengeSlug('a1B2c3D4e5');
    expect(peekChallengeSlug()).toBe('a1B2c3D4e5');
  });

  it('postAuthDestination returns /daily without clearing the stash', () => {
    stashChallengeSlug('a1B2c3D4e5');
    // The stash must survive intermediate hops (login → onboarding → /daily),
    // so reading the destination is not allowed to clear it.
    expect(postAuthDestination()).toBe('/daily');
    expect(postAuthDestination()).toBe('/daily');
    expect(peekChallengeSlug()).toBe('a1B2c3D4e5');
  });

  it('postAuthDestination returns / when nothing is stashed', () => {
    expect(postAuthDestination()).toBe('/');
  });

  it('clearChallengeSlug removes the stash', () => {
    stashChallengeSlug('a1B2c3D4e5');
    clearChallengeSlug();
    expect(peekChallengeSlug()).toBeNull();
    expect(postAuthDestination()).toBe('/');
  });

  it('peekChallengeSlug returns null when nothing is stashed', () => {
    expect(peekChallengeSlug()).toBeNull();
  });

  it('rejects slugs that do not match the validation pattern', () => {
    stashChallengeSlug('bad-slug!');
    expect(peekChallengeSlug()).toBeNull();
  });
});
