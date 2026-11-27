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
  findInnerTextObjectPairAtCursor,
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

describe('findInnerTextObjectPairAtCursor', () => {
  // Offsets:  0123456789
  const code = 'a{b{c}d}e';

  it('picks the innermost enclosing pair when the cursor is inside it', () => {
    expect(findInnerTextObjectPairAtCursor(code, 4, '{', '}')).toEqual([3, 6]);
  });

  it('treats a cursor on an opening delimiter as inside that pair', () => {
    expect(findInnerTextObjectPairAtCursor(code, 3, '{', '}')).toEqual([3, 6]);
  });

  it('treats a cursor on a closing delimiter as inside that pair', () => {
    expect(findInnerTextObjectPairAtCursor(code, 5, '{', '}')).toEqual([3, 6]);
  });

  it('skips a nested pair that sits entirely before or after the cursor', () => {
    expect(findInnerTextObjectPairAtCursor(code, 2, '{', '}')).toEqual([1, 8]);
    expect(findInnerTextObjectPairAtCursor(code, 6, '{', '}')).toEqual([1, 8]);
  });

  it('does not search forward for a pair when the cursor is outside all pairs', () => {
    expect(findInnerTextObjectPairAtCursor(code, 0, '{', '}')).toBeNull();
    expect(findInnerTextObjectPairAtCursor(code, 8, '{', '}')).toBeNull();
  });
});

describe('getRecommendedDeleteSequence — inner text objects', () => {
  const INNER_STRATEGIES = [
    {
      strategy: 'INNER_CURLY_BRACE',
      open: '{',
      close: '}',
      pairs: 'curlyBraceIndices',
    },
    {
      strategy: 'INNER_PARENTHESIS',
      open: '(',
      close: ')',
      pairs: 'parenthesisIndices',
    },
    {
      strategy: 'INNER_BRACKET',
      open: '[',
      close: ']',
      pairs: 'bracketIndices',
    },
  ] as const;

  /** Cursor offset right before the trailing `d i <char>` keys run. */
  function cursorBeforeTextObject(
    snippet: codeSnippet,
    start: number,
    sequence: string[]
  ): number {
    return executeSequence(snippet, start, sequence.slice(0, -3));
  }

  // Regression: nested `{}` used to recommend `j d i {`, where `j` lands on
  // column 0 of `    if (n <= 1) {` — outside the inner braces, so `di{`
  // would empty the whole function body instead of the if-block.
  it('navigates inside a nested brace pair before di{', () => {
    const snippet = CODE_SNIPPIT_OBJECTS[0]!;
    const ifBlock = snippet.curlyBraceIndices.find(([open]) =>
      snippet.code.slice(0, open).includes('if')
    )!;
    const rec = getRecommendedDeleteSequence(
      snippet,
      'INNER_CURLY_BRACE',
      ifBlock[0] + 1,
      ifBlock[1] - 1,
      0
    );
    expect(rec).not.toBeNull();
    expect(rec!.recommendedSequence.slice(-3)).toEqual(['d', 'i', '{']);
    const cursor = cursorBeforeTextObject(snippet, 0, rec!.recommendedSequence);
    expect(
      findInnerTextObjectPairAtCursor(snippet.code, cursor, '{', '}')
    ).toEqual(ifBlock);
  });

  // Regression: the outer pair used to recommend bare `di{` from offset 0,
  // which is before the function's `{` and selects nothing in the editor.
  it('navigates inside the outer brace pair before di{', () => {
    const snippet = CODE_SNIPPIT_OBJECTS[0]!;
    const rec = getRecommendedDeleteSequence(
      snippet,
      'INNER_CURLY_BRACE',
      22,
      98,
      0
    );
    expect(rec).not.toBeNull();
    expect(rec!.recommendedSequence).not.toEqual(['d', 'i', '{']);
  });

  it('every recommended inner delete selects its target pair in every snippet', () => {
    for (const snippet of CODE_SNIPPIT_OBJECTS) {
      for (const { strategy, open, close, pairs } of INNER_STRATEGIES) {
        for (const [openOffset, closeOffsetExclusive] of snippet[pairs]) {
          // Task generation skips pairs with blank inner content.
          const inner = snippet.code.slice(
            openOffset + 1,
            closeOffsetExclusive - 1
          );
          if (inner.trim().length === 0) continue;
          const rec = getRecommendedDeleteSequence(
            snippet,
            strategy,
            openOffset + 1,
            closeOffsetExclusive - 1,
            0
          );
          expect(rec).not.toBeNull();
          const cursor = cursorBeforeTextObject(
            snippet,
            0,
            rec!.recommendedSequence
          );
          expect(
            findInnerTextObjectPairAtCursor(snippet.code, cursor, open, close),
            `${strategy} [${openOffset}, ${closeOffsetExclusive}) via ${rec!.recommendedSequence.join(' ')}`
          ).toEqual([openOffset, closeOffsetExclusive]);
        }
      }
    }
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

  it('recommends yl (not ye) for a single-character WORD yank', () => {
    const snippet = CODE_SNIPPIT_OBJECTS[0]!;
    const lastLine =
      snippet.lineOffsetRanges[snippet.lineOffsetRanges.length - 1]!;
    const yankFrom = 0;
    const rec = getRecommendedYankPasteSequence(
      snippet,
      'WORD',
      yankFrom,
      yankFrom + 1,
      lastLine[0],
      0
    );
    expect(rec).not.toBeNull();
    expect(rec!.recommendedSequence).not.toContain('e');
    expect(rec!.recommendedSequence.slice(0, 2)).toEqual(['y', 'l']);
  });
});
