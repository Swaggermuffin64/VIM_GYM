// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

import {
  stashChallengeSlug,
  peekChallengeSlug,
  consumePostAuthDestination,
} from './challengeRedirect';

beforeEach(() => {
  sessionStorage.clear();
});

describe('challengeRedirect', () => {
  it('round-trips a slug through stash and peek', () => {
    stashChallengeSlug('a1B2c3D4e5');
    expect(peekChallengeSlug()).toBe('a1B2c3D4e5');
  });

  it('consumePostAuthDestination returns /daily and clears the stash', () => {
    stashChallengeSlug('a1B2c3D4e5');
    expect(consumePostAuthDestination()).toBe('/daily');
    // Second call returns '/' because the stash was consumed
    expect(consumePostAuthDestination()).toBe('/');
  });

  it('consumePostAuthDestination returns / when nothing is stashed', () => {
    expect(consumePostAuthDestination()).toBe('/');
  });

  it('peekChallengeSlug returns null when nothing is stashed', () => {
    expect(peekChallengeSlug()).toBeNull();
  });

  it('rejects slugs that do not match the validation pattern', () => {
    stashChallengeSlug('bad-slug!');
    expect(peekChallengeSlug()).toBeNull();
  });
});
