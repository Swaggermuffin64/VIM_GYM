/**
 * Unit tests for vimGraph.ts — the shortest-vim-sequence engine.
 * Guards against regressions in navigation pathfinding and in the
 * delete/yank recommendation planners.
 */
import { describe, expect, it } from 'vitest';
import type { codeSnippet } from '../types.js';
import {
  shortestVimSequenceLazy,
  getRecommendedDeleteSequence,
  getRecommendedYankPasteSequence,
} from './vimGraph.js';
import { resolveKeyOffset } from './graphInfra.js';
import { CODE_SNIPPIT_OBJECTS } from '../codeSnippets.js';

/** Minimal fixtures: lineOffsetRanges follow [lineStart, lineStart + lineLength]
 *  (same convention as graphInfra.test.ts). Word/brace indices left empty so
 *  only basic motions (h l j k 0 $ f t counts) are in play. */
function snippetTwoLines(): codeSnippet {
  return {
    code: 'ab\ncd',
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

function snippetThreeLines(): codeSnippet {
  return {
    code: 'abc\ndef\nghi',
    wordIndices: [],
    curlyBraceIndices: [],
    parenthesisIndices: [],
    bracketIndices: [],
    lineOffsetRanges: [
      [0, 3],
      [4, 7],
      [8, 11],
    ],
  };
}

/**
 * Replay a recommended key sequence against the snippet using the same
 * motion resolver the engine uses, and return the final offset.
 * Count tokens ("2", "3", …) repeat the following key that many times.
 */
function executeSequence(
  snippet: codeSnippet,
  start: number,
  sequence: string[]
): number {
  let offset = start;
  const startLine = snippet.lineOffsetRanges.findIndex(
    ([s, e]) => offset >= s && offset <= e
  );
  let preferredX =
    startLine >= 0 ? offset - snippet.lineOffsetRanges[startLine]![0] : 0;
  let pendingCount = 1;
  for (const token of sequence) {
    if (/^[1-9]\d*$/.test(token)) {
      pendingCount = parseInt(token, 10);
      continue;
    }
    for (let i = 0; i < pendingCount; i++) {
      const [nextOffset, nextPreferredX] = resolveKeyOffset(
        offset,
        token,
        snippet,
        preferredX
      );
      expect(nextOffset).toBeGreaterThanOrEqual(0);
      offset = nextOffset;
      preferredX = nextPreferredX;
    }
    pendingCount = 1;
  }
  return offset;
}

describe('shortestVimSequenceLazy — golden cases', () => {
  it('returns empty sequence when already at the target', () => {
    expect(shortestVimSequenceLazy(snippetTwoLines(), 0, 0)).toEqual([0, []]);
  });

  it('uses a single $ for moving to the end of a two-char line', () => {
    const [weight, seq] = shortestVimSequenceLazy(snippetTwoLines(), 0, 1);
    expect(weight).toBe(1);
    expect(seq).toEqual(['$']);
  });

  it('uses a single j to drop straight down a column', () => {
    const [weight, seq] = shortestVimSequenceLazy(snippetTwoLines(), 0, 3);
    expect(weight).toBe(1);
    expect(seq).toEqual(['j']);
  });

  it('prefers 0 over hh to reach start of line', () => {
    const [weight] = shortestVimSequenceLazy(snippetThreeLines(), 2, 0);
    expect(weight).toBe(1);
  });
});

describe('shortestVimSequenceLazy — executes-to-target property', () => {
  it('recommended sequence actually reaches the target on small fixtures', () => {
    const fixtures = [snippetTwoLines(), snippetThreeLines()];
    for (const snippet of fixtures) {
      const validOffsets = snippet.lineOffsetRanges.flatMap(([s, e]) => {
        const offsets: number[] = [];
        for (let o = s; o < e; o++) offsets.push(o);
        return offsets;
      });
      for (const target of validOffsets) {
        const [weight, seq] = shortestVimSequenceLazy(snippet, 0, target, 0);
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(executeSequence(snippet, 0, seq)).toBe(target);
      }
    }
  });

  it('recommended sequence reaches the target on a real generated snippet', () => {
    const snippet = CODE_SNIPPIT_OBJECTS[0]!;
    const lastLine =
      snippet.lineOffsetRanges[snippet.lineOffsetRanges.length - 1]!;
    const targets = [1, lastLine[0], Math.max(0, lastLine[1] - 1)];
    for (const target of targets) {
      const [weight, seq] = shortestVimSequenceLazy(snippet, 0, target, 0);
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(executeSequence(snippet, 0, seq)).toBe(target);
    }
  });
});

describe('getRecommendedDeleteSequence', () => {
  it('recommends plain x for a single character under the cursor', () => {
    const snippet = CODE_SNIPPIT_OBJECTS[0]!;
    const rec = getRecommendedDeleteSequence(snippet, 'WORD', 0, 1, 0);
    expect(rec).not.toBeNull();
    expect(rec!.recommendedSequence).toEqual(['x']);
    expect(rec!.recommendedWeight).toBe(1);
  });

  it('produces a non-empty plan for a real word range', () => {
    const snippet = CODE_SNIPPIT_OBJECTS[0]!;
    const wordRange = snippet.wordIndices[1] ?? snippet.wordIndices[0];
    expect(wordRange).toBeDefined();
    const [from, to] = wordRange!;
    const rec = getRecommendedDeleteSequence(snippet, 'WORD', from, to, 0);
    expect(rec).not.toBeNull();
    expect(rec!.recommendedWeight).toBeGreaterThan(0);
    expect(rec!.recommendedSequence.length).toBeGreaterThan(0);
  });
});

describe('getRecommendedYankPasteSequence', () => {
  it('produces a plan ending in p for a WORD yank', () => {
    const snippet = CODE_SNIPPIT_OBJECTS[0]!;
    const wordRange = snippet.wordIndices[0];
    expect(wordRange).toBeDefined();
    const [from, to] = wordRange!;
    const lastLine =
      snippet.lineOffsetRanges[snippet.lineOffsetRanges.length - 1]!;
    const rec = getRecommendedYankPasteSequence(
      snippet,
      'WORD',
      from,
      to,
      lastLine[0],
      0
    );
    expect(rec).not.toBeNull();
    expect(rec!.recommendedSequence[rec!.recommendedSequence.length - 1]).toBe(
      'p'
    );
    expect(rec!.recommendedWeight).toBeGreaterThan(0);
  });
});
