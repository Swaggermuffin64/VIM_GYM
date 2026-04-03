import { describe, expect, it } from 'vitest';
import type { codeSnippet } from '../types.js';
import { getLineFromOffset, resolveKeyOffset } from './graphInfra.js';

const WANTED_EOL = Number.MAX_SAFE_INTEGER;

/** Minimal two-line snippet: ranges match `getNewlineOffsets` in scripts/generateSnippets.ts */
function snippetTwoLines(): codeSnippet {
  const code = 'ab\ncd';
  return {
    code,
    wordIndices: [],
    curlyBraceIndices: [],
    parenthesisIndices: [],
    bracketIndices: [],
    lineOffsetRanges: [
      [0, 2],
      [3, 5],
    ],
  };
}

describe('getLineFromOffset', () => {
  it('maps offsets to zero-indexed lines', () => {
    const s = snippetTwoLines();
    expect(getLineFromOffset(0, s)).toBe(0);
    expect(getLineFromOffset(2, s)).toBe(0);
    expect(getLineFromOffset(3, s)).toBe(1);
    expect(getLineFromOffset(4, s)).toBe(1);
  });
});

describe('resolveKeyOffset', () => {
  it('moves h and l without wrapping across lines', () => {
    const s = snippetTwoLines();
    expect(resolveKeyOffset(1, 'h', s, 1)).toEqual([0, 0]);
    expect(resolveKeyOffset(0, 'l', s, 0)).toEqual([1, 1]);
    expect(resolveKeyOffset(2, 'l', s, 2)).toEqual([2, 2]);
  });

  it('supports 0 and $ on the current line', () => {
    const s = snippetTwoLines();
    expect(resolveKeyOffset(2, '0', s, 2)).toEqual([0, 0]);
    expect(resolveKeyOffset(0, '$', s, 0)).toEqual([1, WANTED_EOL]);
  });

  it('moves j and k with column goal', () => {
    const s = snippetTwoLines();
    expect(resolveKeyOffset(0, 'j', s, 0)).toEqual([3, 0]);
    expect(resolveKeyOffset(3, 'k', s, 0)).toEqual([0, 0]);
  });

  it('keeps EOL goal after $ when moving vertically', () => {
    const s = snippetTwoLines();
    const afterDollar = resolveKeyOffset(0, '$', s, 0);
    expect(afterDollar).toEqual([1, WANTED_EOL]);
    expect(resolveKeyOffset(afterDollar[0], 'j', s, afterDollar[1])).toEqual([
      4,
      WANTED_EOL,
    ]);
  });
});
