/**
 * Tests for the matchmaking copy of player-name validation.
 * Kept separate from the backend's tests because the implementations have
 * drifted (this one has no profanity check) — these tests document the
 * actual current contract.
 */
import { describe, expect, it } from 'vitest';
import { validatePlayerName } from './validation.js';

describe('validatePlayerName (matchmaking)', () => {
  it.each([
    ['plain name', 'speedster', 'speedster'],
    ['trims whitespace', '  neo  ', 'neo'],
    ['strips dangerous characters', `<a>'b"c&d\\e`, 'abcde'],
    ['truncates to 20 chars', 'x'.repeat(30), 'x'.repeat(20)],
  ])('%s', (_label, input, expected) => {
    const result = validatePlayerName(input);
    expect(result.valid).toBe(true);
    expect(result.value).toBe(expected);
  });

  it.each([
    ['non-string', 99],
    ['empty', ''],
    ['whitespace only', '  '],
  ])('falls back to "Player" for %s', (_label, input) => {
    expect(validatePlayerName(input).value).toBe('Player');
  });
});
