import type { PositionTask, DeleteTask, Position, Task, IntTuple, DeleteStrategy } from './types.ts';
import { CODE_SNIPPIT_OBJECTS  } from './codeSnippets.js'; //will be a db call one day
import { shortestVimSequenceLazy, getRecommendedDeleteSequence } from './multiplayer/vimGraph.js';
/**
 * Remove empty lines from a code snippet
 */
function removeEmptyLines(code: string): string {
  return code
    .split('\n')
    .filter(line => line.trim().length > 0)
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
 * Get the character at a position in the code
 */
function getCharAtPosition(code: string, pos: Position): string {
  const lines = code.split('\n');
  if (pos.line < 1 || pos.line > lines.length) return '';
  const line = lines[pos.line - 1];
  if (!line || pos.col < 0 || pos.col >= line.length) return '';
  return line[pos.col] ?? '';
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
function generateDescription(code: string, pos: Position): string {
  const lines = code.split('\n');
  const line = lines[pos.line - 1] ?? '';
  
  // Get context around the character
  const contextStart = Math.max(0, pos.col - 10);
  const contextEnd = Math.min(line.length, pos.col + 10);
  const context = line.substring(contextStart, contextEnd);
  
  return `Move cursor to the highlighted character`;
}
let taskIdCounter = 0;

/**
 * Generate a random position task
 */
export function generatePositionTask(): PositionTask {
  const generationStartedAt = Date.now();
  const snippetIndex = Math.floor(Math.random() * CODE_SNIPPIT_OBJECTS.length);
  const snippetData = CODE_SNIPPIT_OBJECTS[snippetIndex] ?? CODE_SNIPPIT_OBJECTS[0];
  if (!snippetData) {
    throw new Error('No code snippets available to generate navigate task');
  }
  const snippet = removeEmptyLines(snippetData.code);
  const positions = findInterestingPositions(snippet);
  const validPositions = positions.filter((position) => positionToOffset(snippet, position) > 0);
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
    id: `task-${++taskIdCounter}`,
    type: 'navigate',
    description: generateDescription(snippet, targetPosition),
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
  const snippetData = CODE_SNIPPIT_OBJECTS[snippetIndex] ?? CODE_SNIPPIT_OBJECTS[0];
  if (!snippetData) {
    throw new Error('No code snippets available to generate delete task');
  }
  const snippet = removeEmptyLines(snippetData.code); 

  // Build available strategies based on what the snippet contains
  const strategies: Array<{ name: DeleteStrategy; execute: DeleteStrategyExecutor }> = [];

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
      }
    });
  }

  // Curly brace (da{) - only if snippet has curly braces
  if ((snippetData?.curlyBraceIndices.length ?? 0) > 0) {
    strategies.push({
      name: 'CURLY_BRACE',
      execute: () => {
        const idx = Math.floor(Math.random() * snippetData!.curlyBraceIndices.length);
        return snippetData!.curlyBraceIndices[idx] ?? [0, 1];
      }
    });
  }

  // Parenthesis (da() - only if snippet has parentheses
  if ((snippetData?.parenthesisIndices.length ?? 0) > 0) {
    strategies.push({
      name: 'PARENTHESIS',
      execute: () => {
        const idx = Math.floor(Math.random() * snippetData!.parenthesisIndices.length);
        return snippetData!.parenthesisIndices[idx] ?? [0, 1];
      }
    });
  }

  // Inner curly brace (di{) - only if snippet has non-empty brace pairs
  const validInnerBraces = getValidInnerIndices(snippet, snippetData?.curlyBraceIndices ?? []);
  if (validInnerBraces.length > 0) {
    strategies.push({
      name: 'INNER_CURLY_BRACE',
      execute: () => {
        const idx = Math.floor(Math.random() * validInnerBraces.length);
        const [start, end] = validInnerBraces[idx] ?? [0, 2];
        return [start + 1, end - 1];
      }
    });
  }

  // Inner parenthesis (di() - only if snippet has non-empty paren pairs
  const validInnerParens = getValidInnerIndices(snippet, snippetData?.parenthesisIndices ?? []);
  if (validInnerParens.length > 0) {
    strategies.push({
      name: 'INNER_PARENTHESIS',
      execute: () => {
        const idx = Math.floor(Math.random() * validInnerParens.length);
        const [start, end] = validInnerParens[idx] ?? [0, 2];
        return [start + 1, end - 1];
      }
    });
  }

  // Bracket (da[) - only if snippet has brackets
  if ((snippetData?.bracketIndices.length ?? 0) > 0) {
    strategies.push({
      name: 'BRACKET',
      execute: () => {
        const idx = Math.floor(Math.random() * snippetData!.bracketIndices.length);
        return snippetData!.bracketIndices[idx] ?? [0, 1];
      }
    });
  }

  // Inner bracket (di[) - only if snippet has non-empty bracket pairs
  const validInnerBrackets = getValidInnerIndices(snippet, snippetData?.bracketIndices ?? []);
  if (validInnerBrackets.length > 0) {
    strategies.push({
      name: 'INNER_BRACKET',
      execute: () => {
        const idx = Math.floor(Math.random() * validInnerBrackets.length);
        const [start, end] = validInnerBrackets[idx] ?? [0, 2];
        return [start + 1, end - 1];
      }
    });
  }

  // Random fallback - always available
  strategies.push({
    name: 'RANDOM',
    execute: () => findRandomDeleteRange(snippet)
  });

  // Pick a random strategy
  const chosen = strategies[Math.floor(Math.random() * strategies.length)]!;
  const [from, to] = chosen.execute();

  const expectedResult = snippet.slice(0, from) + snippet.slice(to);
  const deleteRecommendation = getRecommendedDeleteSequence(snippetData, chosen.name, from, to);
  const generationLatencyMs = Date.now() - generationStartedAt;
  console.log(
    `[DELETE] Strategy: ${chosen.name} | latency: ${generationLatencyMs}ms`
  );
  return {
    id: `task-${++taskIdCounter}`,
    type: 'delete',
    description: "Delete the highlighted section exactly", 
    codeSnippet: snippet,
    targetRange: {from, to},
    expectedResult,
    strategy: chosen.name,
    ...(deleteRecommendation
      ? {
          recommendedSequence: deleteRecommendation.recommendedSequence,
          recommendedWeight: deleteRecommendation.recommendedWeight,
        }
      : {}),
  }
}

export function generatePositionTasks(count: number): Task[] {
  return Array.from({ length: count }, generatePositionTask);
}

export function generateDeleteTasks(count: number): Task[] {
  return Array.from({ length: count }, generateDeleteTask);
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
