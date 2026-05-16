import { randomUUID } from 'node:crypto';
import type {
  PositionTask,
  DeleteTask,
  YankPasteTask,
  Position,
  Task,
  IntTuple,
  DeleteStrategy,
  YankStrategy,
} from './types.ts';
import { CODE_SNIPPIT_OBJECTS } from './codeSnippets.js'; //will be a db call one day
import {
  shortestVimSequenceLazy,
  getRecommendedDeleteSequence,
  getRecommendedYankPasteSequence,
} from './multiplayer/vimGraph.js';
/**
 * Remove empty lines from a code snippet
 */
function removeEmptyLines(code: string): string {
  return code
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .join('\n');
}

/**
 * Convert line/col position to character offset
 */
function positionToOffset(code: string, pos: Position): number {
  const lines = code.split('\n');
  let offset = 0;

  for (let i = 0; i < pos.line - 1 && i < lines.length; i++) {
    offset += (lines[i]?.length ?? 0) + 1; // +1 for newline
  }

  const targetLine = lines[pos.line - 1];
  offset += Math.min(pos.col, targetLine?.length ?? 0);
  return offset;
}

/**
 * Find interesting positions in code (not whitespace, meaningful characters)
 * Returns Position: row, col - used for navigation tasks
 */
function findInterestingPositions(code: string): Position[] {
  const lines = code.split('\n');
  const positions: Position[] = [];

  lines.forEach((line, lineIndex) => {
    for (let col = 0; col < line.length; col++) {
      if (lineIndex === 0 && col === 0) {
        // this is player's starting position, so we skip it
        continue;
      }

      const char = line[col];
      if (char !== ' ' && char !== '\t') {
        positions.push({ line: lineIndex + 1, col });
      }
    }
  });

  return positions;
}

/**
 * Find indices of non-whitespace characters - returns flat offsets for delete tasks
 */
function findNonWhitespaceIndices(code: string): number[] {
  const indices: number[] = [];
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if (char !== ' ' && char !== '\t' && char !== '\n') {
      indices.push(i);
    }
  }
  return indices;
}

function findRandomDeleteRange(code: string): IntTuple {
  const indices = findNonWhitespaceIndices(code);
  if (indices.length < 2) return [0, 1];

  const idx1 = Math.floor(Math.random() * indices.length);
  let idx2 = Math.floor(Math.random() * indices.length);
  while (idx1 === idx2) {
    idx2 = Math.floor(Math.random() * indices.length);
  }

  const offset1 = indices[idx1]!;
  const offset2 = indices[idx2]!;
  return [Math.min(offset1, offset2), Math.max(offset1, offset2)];
}

/**
 * Generate a description for a navigation task
 */
function generateDescription(): string {
  return `Move cursor to the highlighted character`;
}

/**
 * Generate a random position task
 */
export function generatePositionTask(): PositionTask {
  const generationStartedAt = Date.now();
  const snippetIndex = Math.floor(Math.random() * CODE_SNIPPIT_OBJECTS.length);
  const snippetData =
    CODE_SNIPPIT_OBJECTS[snippetIndex] ?? CODE_SNIPPIT_OBJECTS[0];
  if (!snippetData) {
    throw new Error('No code snippets available to generate navigate task');
  }
  const snippet = removeEmptyLines(snippetData.code);
  const positions = findInterestingPositions(snippet);
  const validPositions = positions.filter(
    (position) => positionToOffset(snippet, position) > 0
  );
  if (validPositions.length === 0) {
    throw new Error('No valid non-zero offsets available for navigate task');
  }

  // Pick a random interesting position
  const posIndex = Math.floor(Math.random() * validPositions.length);
  const targetPosition = validPositions[posIndex] ?? { line: 1, col: 1 };
  const targetOffset = positionToOffset(snippet, targetPosition);
  const [recommendedWeight, recommendedSequence] = shortestVimSequenceLazy(
    snippetData,
    0,
    targetOffset,
    0
  );

  const generationLatencyMs = Date.now() - generationStartedAt;
  console.log(
    `[NAVIGATE] Target: line ${targetPosition.line}, col ${targetPosition.col} | latency: ${generationLatencyMs}ms`
  );

  return {
    id: randomUUID(),
    type: 'navigate',
    description: generateDescription(),
    codeSnippet: snippet,
    targetPosition,
    targetOffset,
    ...(recommendedWeight >= 0
      ? {
          recommendedSequence,
          recommendedWeight,
        }
      : {}),
  };
}

/**
 * Filter indices to only include pairs with non-empty inner content
 */
function getValidInnerIndices(code: string, indices: IntTuple[]): IntTuple[] {
  return indices.filter(([start, end]) => {
    const innerStart = start + 1;
    const innerEnd = end - 1;
    if (innerStart >= innerEnd) return false;
    const innerContent = code.slice(innerStart, innerEnd);
    return innerContent.trim().length > 0;
  });
}

type DeleteStrategyExecutor = () => IntTuple;

export function generateDeleteTask(): DeleteTask {
  const generationStartedAt = Date.now();
  const snippetIndex = Math.floor(Math.random() * CODE_SNIPPIT_OBJECTS.length);
  const snippetData =
    CODE_SNIPPIT_OBJECTS[snippetIndex] ?? CODE_SNIPPIT_OBJECTS[0];
  if (!snippetData) {
    throw new Error('No code snippets available to generate delete task');
  }
  const snippet = removeEmptyLines(snippetData.code);

  // Build available strategies based on what the snippet contains
  const strategies: Array<{
    name: DeleteStrategy;
    execute: DeleteStrategyExecutor;
  }> = [];

  // Word strategy (1-3 consecutive words) - always available (snippets always have words)
  if ((snippetData?.wordIndices.length ?? 0) > 0) {
    strategies.push({
      name: 'WORD',
      execute: () => {
        const words = snippetData!.wordIndices;
        const wordCount = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3 words
        const maxStartIdx = Math.max(0, words.length - wordCount);
        const startIdx = Math.floor(Math.random() * (maxStartIdx + 1));
        const endIdx = Math.min(startIdx + wordCount - 1, words.length - 1);

        const firstWord = words[startIdx] ?? [0, 1];
        const lastWord = words[endIdx] ?? firstWord;
        return [firstWord[0], lastWord[1]];
      },
    });
  }

  // Curly brace (da{) - only if snippet has curly braces
  if ((snippetData?.curlyBraceIndices.length ?? 0) > 0) {
    strategies.push({
      name: 'CURLY_BRACE',
      execute: () => {
        const idx = Math.floor(
          Math.random() * snippetData!.curlyBraceIndices.length
        );
        return snippetData!.curlyBraceIndices[idx] ?? [0, 1];
      },
    });
  }

  // Parenthesis (da() - only if snippet has parentheses
  if ((snippetData?.parenthesisIndices.length ?? 0) > 0) {
    strategies.push({
      name: 'PARENTHESIS',
      execute: () => {
        const idx = Math.floor(
          Math.random() * snippetData!.parenthesisIndices.length
        );
        return snippetData!.parenthesisIndices[idx] ?? [0, 1];
      },
    });
  }

  // Inner curly brace (di{) - only if snippet has non-empty brace pairs
  const validInnerBraces = getValidInnerIndices(
    snippet,
    snippetData?.curlyBraceIndices ?? []
  );
  if (validInnerBraces.length > 0) {
    strategies.push({
      name: 'INNER_CURLY_BRACE',
      execute: () => {
        const idx = Math.floor(Math.random() * validInnerBraces.length);
        const [start, end] = validInnerBraces[idx] ?? [0, 2];
        return [start + 1, end - 1];
      },
    });
  }

  // Inner parenthesis (di() - only if snippet has non-empty paren pairs
  const validInnerParens = getValidInnerIndices(
    snippet,
    snippetData?.parenthesisIndices ?? []
  );
  if (validInnerParens.length > 0) {
    strategies.push({
      name: 'INNER_PARENTHESIS',
      execute: () => {
        const idx = Math.floor(Math.random() * validInnerParens.length);
        const [start, end] = validInnerParens[idx] ?? [0, 2];
        return [start + 1, end - 1];
      },
    });
  }

  // Bracket (da[) - only if snippet has brackets
  if ((snippetData?.bracketIndices.length ?? 0) > 0) {
    strategies.push({
      name: 'BRACKET',
      execute: () => {
        const idx = Math.floor(
          Math.random() * snippetData!.bracketIndices.length
        );
        return snippetData!.bracketIndices[idx] ?? [0, 1];
      },
    });
  }

  // Inner bracket (di[) - only if snippet has non-empty bracket pairs
  const validInnerBrackets = getValidInnerIndices(
    snippet,
    snippetData?.bracketIndices ?? []
  );
  if (validInnerBrackets.length > 0) {
    strategies.push({
      name: 'INNER_BRACKET',
      execute: () => {
        const idx = Math.floor(Math.random() * validInnerBrackets.length);
        const [start, end] = validInnerBrackets[idx] ?? [0, 2];
        return [start + 1, end - 1];
      },
    });
  }

  // Random fallback - always available
  strategies.push({
    name: 'RANDOM',
    execute: () => findRandomDeleteRange(snippet),
  });

  // Pick a random strategy
  const chosen = strategies[Math.floor(Math.random() * strategies.length)]!;
  const [from, to] = chosen.execute();

  const prefix = snippet.slice(0, from);
  const suffix = snippet.slice(to);
  const originalMiddle = snippet.slice(from, to);
  const expectedResult = prefix + suffix;
  const deleteRecommendation = getRecommendedDeleteSequence(
    snippetData,
    chosen.name,
    from,
    to
  );
  const generationLatencyMs = Date.now() - generationStartedAt;
  console.log(
    `[DELETE] Strategy: ${chosen.name} | latency: ${generationLatencyMs}ms`
  );
  return {
    id: randomUUID(),
    type: 'delete',
    description: 'Delete the highlighted section exactly',
    codeSnippet: snippet,
    targetRange: { from, to },
    expectedResult,
    prefix,
    suffix,
    originalMiddle,
    strategy: chosen.name,
    ...(deleteRecommendation
      ? {
          recommendedSequence: deleteRecommendation.recommendedSequence,
          recommendedWeight: deleteRecommendation.recommendedWeight,
        }
      : {}),
  };
}

type YankStrategyExecutor = () => {
  yankFrom: number;
  yankTo: number;
  pasteOffset: number;
  expectedResults: string[];
  linewise: boolean;
};

export function generateYankPasteTask(): YankPasteTask {
  const snippetIndex = Math.floor(Math.random() * CODE_SNIPPIT_OBJECTS.length);
  const snippetData =
    CODE_SNIPPIT_OBJECTS[snippetIndex] ?? CODE_SNIPPIT_OBJECTS[0];
  if (!snippetData) {
    throw new Error('No code snippets available to generate yank_paste task');
  }
  const snippet = removeEmptyLines(snippetData.code);
  const words = snippetData.wordIndices;

  // Build available strategies
  const strategies: Array<{
    name: YankStrategy;
    execute: YankStrategyExecutor;
  }> = [];

  // WORD strategy (yiw) — pick a word, paste characterwise
  if (words.length >= 2) {
    strategies.push({
      name: 'WORD',
      execute: () => {
        const wordIdx = Math.floor(Math.random() * words.length);
        const [yankFrom, yankTo] = words[wordIdx]!;
        const validPasteOffsets = words
          .map(([start]) => start)
          .filter((offset) => offset < yankFrom || offset >= yankTo);
        if (validPasteOffsets.length === 0)
          throw new Error('No valid paste offset');
        const pasteOffset =
          validPasteOffsets[
            Math.floor(Math.random() * validPasteOffsets.length)
          ]!;
        const yankedText = snippet.slice(yankFrom, yankTo);
        // p (after cursor) and P (before cursor)
        const resultP =
          snippet.slice(0, pasteOffset + 1) +
          yankedText +
          snippet.slice(pasteOffset + 1);
        const resultShiftP =
          snippet.slice(0, pasteOffset) +
          yankedText +
          snippet.slice(pasteOffset);
        return {
          yankFrom,
          yankTo,
          pasteOffset,
          expectedResults: [resultP, resultShiftP],
          linewise: false,
        };
      },
    });
  }

  // LINE strategy (yy) — yank a full line, paste linewise below target line
  // Filter out single-character lines to avoid confusion with yl
  const lines = snippetData.lineOffsetRanges;
  const multiCharLines = lines
    .map(([from, to], i) => ({ from, to, idx: i }))
    .filter(({ from, to }) => to - from > 1);
  if (multiCharLines.length >= 1 && lines.length >= 2) {
    strategies.push({
      name: 'LINE',
      execute: () => {
        const chosen =
          multiCharLines[Math.floor(Math.random() * multiCharLines.length)]!;
        const [yankFrom, yankTo] = [chosen.from, chosen.to];
        // Pick a different line to paste after
        const validPasteLines = lines.filter((_, i) => i !== chosen.idx);
        const pasteLine =
          validPasteLines[Math.floor(Math.random() * validPasteLines.length)]!;
        // pasteOffset = first char of the target line (user navigates here, presses p)
        const pasteOffset = pasteLine[0];
        const yankedText = snippet.slice(yankFrom, yankTo);
        const pasteLineStart = pasteLine[0];
        const pasteLineEnd = pasteLine[1]; // exclusive end = position of \n or doc end
        const newlineAfterPasteLine = snippet[pasteLineEnd] === '\n';

        // 4 accepted results: linewise p/P × characterwise p/P
        // 1. Linewise p (yy + p): new line below target line
        let linewiseP: string;
        if (newlineAfterPasteLine) {
          linewiseP =
            snippet.slice(0, pasteLineEnd + 1) +
            yankedText +
            '\n' +
            snippet.slice(pasteLineEnd + 1);
        } else {
          linewiseP = snippet + '\n' + yankedText;
        }
        // 2. Linewise P (yy + P): new line above target line
        const linewiseShiftP =
          snippet.slice(0, pasteLineStart) +
          yankedText +
          '\n' +
          snippet.slice(pasteLineStart);
        // 3. Characterwise p (after pasteOffset)
        const charP =
          snippet.slice(0, pasteOffset + 1) +
          yankedText +
          snippet.slice(pasteOffset + 1);
        // 4. Characterwise P (before pasteOffset)
        const charShiftP =
          snippet.slice(0, pasteOffset) +
          yankedText +
          snippet.slice(pasteOffset);

        return {
          yankFrom,
          yankTo,
          pasteOffset,
          expectedResults: [linewiseP, linewiseShiftP, charP, charShiftP],
          linewise: true,
        };
      },
    });
  }

  // BRACKET strategy (y%) — yank from opening bracket/paren to its match
  const allBracketPairs = [
    ...snippetData.parenthesisIndices,
    ...snippetData.bracketIndices,
    ...snippetData.curlyBraceIndices,
  ];
  if (allBracketPairs.length > 0 && words.length >= 1) {
    strategies.push({
      name: 'BRACKET',
      execute: () => {
        const pairIdx = Math.floor(Math.random() * allBracketPairs.length);
        const [yankFrom, yankTo] = allBracketPairs[pairIdx]!;
        const yankedText = snippet.slice(yankFrom, yankTo);
        // Paste at a word boundary that doesn't overlap the yank range
        const validPasteOffsets = words
          .map(([start]) => start)
          .filter((offset) => offset < yankFrom || offset >= yankTo);
        if (validPasteOffsets.length === 0)
          throw new Error('No valid paste offset');
        const pasteOffset =
          validPasteOffsets[
            Math.floor(Math.random() * validPasteOffsets.length)
          ]!;
        // p (after cursor) and P (before cursor)
        const resultP =
          snippet.slice(0, pasteOffset + 1) +
          yankedText +
          snippet.slice(pasteOffset + 1);
        const resultShiftP =
          snippet.slice(0, pasteOffset) +
          yankedText +
          snippet.slice(pasteOffset);
        return {
          yankFrom,
          yankTo,
          pasteOffset,
          expectedResults: [resultP, resultShiftP],
          linewise: false,
        };
      },
    });
  }

  if (strategies.length === 0) {
    throw new Error('No yank strategies available for this snippet');
  }

  const chosen = strategies[Math.floor(Math.random() * strategies.length)]!;
  const { yankFrom, yankTo, pasteOffset, expectedResults, linewise } =
    chosen.execute();
  const yankedText = snippet.slice(yankFrom, yankTo);

  const yankPasteRecommendation = getRecommendedYankPasteSequence(
    snippetData,
    chosen.name,
    yankFrom,
    yankTo,
    pasteOffset
  );

  return {
    id: randomUUID(),
    type: 'yank_paste',
    description: 'Yank the highlighted text and paste it at the marker',
    codeSnippet: snippet,
    yankRange: { from: yankFrom, to: yankTo },
    pasteOffset,
    expectedResults,
    yankedText,
    strategy: chosen.name,
    ...(linewise ? { linewise: true } : {}),
    ...(yankPasteRecommendation
      ? {
          recommendedSequence: yankPasteRecommendation.recommendedSequence,
          recommendedWeight: yankPasteRecommendation.recommendedWeight,
        }
      : {}),
  };
}

export function generateYankPasteTasks(count: number): Task[] {
  return Array.from({ length: count }, generateYankPasteTask);
}

export function generatePositionTasks(count: number): Task[] {
  return Array.from({ length: count }, generatePositionTask);
}

export function generateDeleteTasks(count: number): Task[] {
  return Array.from({ length: count }, generateDeleteTask);
}

/**
 * Build all task type batches in one synchronous call.
 * Intended for a single pool job; shuffle on main thread.
 */
export function generateRaceTaskBatches(tasksPerType: number): {
  positionTasks: Task[];
  deleteTasks: Task[];
  yankPasteTasks: Task[];
} {
  return {
    positionTasks: generatePositionTasks(tasksPerType),
    deleteTasks: generateDeleteTasks(tasksPerType),
    yankPasteTasks: generateYankPasteTasks(tasksPerType),
  };
}

/**
 * Check if a cursor position matches the target
 */
export function checkPositionTask(
  task: PositionTask,
  cursorOffset: number
): boolean {
  return cursorOffset === task.targetOffset;
}
