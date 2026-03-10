/**
 * Script to generate codeSnippets.json from CODE_SNIPPETS_RAW
 * 
 * Parses raw code snippets and generates word indices, curly brace indices,
 * and parenthesis indices for each snippet.
 * 
 * Run with: npm run generate-snippets
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { codeSnippet } from '../types.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Copy of the helper functions (to avoid import issues)
export type IntTuple = [number, number];

export function isKeywordChar(char: string): boolean {
  return /^[a-zA-Z0-9_]$/.test(char);
}

function isBlankChar(char: string): boolean {
  return /^\s$/.test(char);
}

function getWordIndices(code: string): IntTuple[] {
  let lead = 0;
  const wordIndiceArray: IntTuple[] = [];

  while (lead < code.length) {
    const currentChar = code[lead];
    if (!currentChar) break;

    // Vim "word" boundaries for w/b/e:
    // 1) [a-zA-Z0-9_]+
    // 2) contiguous runs of other non-blank characters
    if (isBlankChar(currentChar)) {
      lead++;
      continue;
    }

    const start = lead;
    const inKeywordWord = isKeywordChar(currentChar);
    lead++;

    while (lead < code.length) {
      const nextChar = code[lead];
      if (!nextChar || isBlankChar(nextChar)) break;

      if (inKeywordWord) {
        if (!isKeywordChar(nextChar)) break;
      } else if (isKeywordChar(nextChar)) {
        break;
      }
      lead++;
    }

    wordIndiceArray.push([start, lead]);
  }

  return wordIndiceArray;
}

function getNewlineOffsets(code: string) : IntTuple[] { 
    //output list of lists where indice is line #, and [start offset, \n offset (or last char for last line)]
    //be able to tell what line your on from offset
    const allOffsetRanges: IntTuple[] = []; 
    const splitText = code.split('\n');    
    let startOffset = 0;
    for (const line of splitText) {
        const lineLength = line.length + startOffset; // length + 1 should be the \n char
        allOffsetRanges.push([startOffset, lineLength] as IntTuple);
        startOffset = lineLength + 1;
    }
    return allOffsetRanges; 
}

function getCurlyBraceIndices(code: string): IntTuple[] {
  let curlyBraceIndices: IntTuple[] = [];
  let stack: number[] = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '{') {
      stack.push(i);
    }
    if (code[i] === '}') {
      const leftIndex = stack.pop() ?? 0;
      curlyBraceIndices.push([leftIndex, i + 1]);
    }
  }
  return curlyBraceIndices;
}

function getParenthesisIndices(code: string): IntTuple[] {
  let parenthesisIndices: IntTuple[] = [];
  let stack: number[] = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '(') {
      stack.push(i);
    }
    if (code[i] === ')') {
      const leftIndex = stack.pop() ?? 0;
      parenthesisIndices.push([leftIndex, i + 1]);
    }
  }
  return parenthesisIndices;
}

function getBracketIndices(code: string): IntTuple[] {
  let bracketIndices: IntTuple[] = [];
  let stack: number[] = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '[') {
      stack.push(i);
    }
    if (code[i] === ']') {
      const leftIndex = stack.pop() ?? 0;
      bracketIndices.push([leftIndex, i + 1]);
    }
  }
  return bracketIndices;
}

function buildLineStartOffsets(lineOffsetRanges: IntTuple[]): number[] {
  return lineOffsetRanges.map(([lineStart]) => lineStart);
}

function buildOffsetToLineMap(code: string, lineOffsetRanges: IntTuple[]): number[] {
  const lastValidOffset = Math.max(0, code.length - 1);
  const offsetToLine = new Array<number>(code.length).fill(0);
  lineOffsetRanges.forEach(([lineStart, lineEndInclusive], lineIndex) => {
    const clampedEnd = Math.min(lineEndInclusive, lastValidOffset);
    for (let offset = lineStart; offset <= clampedEnd; offset++) {
      offsetToLine[offset] = lineIndex;
    }
  });
  return offsetToLine;
}

function buildMotionKeysByLine(code: string, lineOffsetRanges: IntTuple[]): string[][] {
  const baseKeys = ['h', 'j', 'k', 'l', 'w', 'e', 'b', '0', '$'];
  return lineOffsetRanges.map(([lineStart, lineEndExclusive]) => {
    const lineText = code.slice(lineStart, lineEndExclusive);
    const uniqueChars = new Set<string>(lineText);
    const targetedKeys: string[] = [];
    for (const char of uniqueChars) {
      targetedKeys.push(`f${char}`, `F${char}`, `t${char}`, `T${char}`);
    }
    return [...baseKeys, ...targetedKeys];
  });
}

// Remove empty lines (lines with only whitespace) - must match tasks.ts behavior
function removeEmptyLines(code: string): string {
  return code
    .split('\n')
    .filter(line => line.trim() !== '')
    .join('\n');
}

function createCodeSnippetObjects(CODE_SNIPPETS: string[]): codeSnippet[] {
  let codeSnippetObjects: codeSnippet[] = [];
  for (let i = 0; i < CODE_SNIPPETS.length; i++) {
    let raw_snippet = CODE_SNIPPETS[i];
    if (raw_snippet) {
      // Remove empty lines first - indices must match the cleaned code used at runtime
      const code_snippet = removeEmptyLines(raw_snippet);
      const lineOffsetRanges = getNewlineOffsets(code_snippet);
      let code_object: codeSnippet = {
        code: code_snippet,
        wordIndices: getWordIndices(code_snippet),
        curlyBraceIndices: getCurlyBraceIndices(code_snippet),
        parenthesisIndices: getParenthesisIndices(code_snippet),
        bracketIndices: getBracketIndices(code_snippet),
        lineOffsetRanges,
        precomputed: {
          lineStartOffsets: buildLineStartOffsets(lineOffsetRanges),
          offsetToLine: buildOffsetToLineMap(code_snippet, lineOffsetRanges),
          motionKeysByLine: buildMotionKeysByLine(code_snippet, lineOffsetRanges),
        },
      };
      codeSnippetObjects.push(code_object);
    }
  }
  return codeSnippetObjects;
}

// Extract raw snippets by parsing the file as text
function extractRawSnippets(fileContent: string): string[] {
  // Find where CODE_SNIPPETS_RAW starts
  const startMarker = 'export const CODE_SNIPPETS_RAW: string[] = [';
  const startIdx = fileContent.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error('Could not find CODE_SNIPPETS_RAW in file');
  }
  
  // Find the closing ]; by tracking backticks (we're only inside array when not in a string)
  let inString = false;
  let arrayEnd = -1;
  for (let i = startIdx + startMarker.length; i < fileContent.length; i++) {
    const char = fileContent[i];
    if (char === '`') {
      inString = !inString;
    } else if (!inString && char === ']' && fileContent[i + 1] === ';') {
      arrayEnd = i;
      break;
    }
  }
  
  if (arrayEnd === -1) {
    throw new Error('Could not find end of CODE_SNIPPETS_RAW array');
  }
  
  const arrayContent = fileContent.substring(startIdx + startMarker.length, arrayEnd);
  
  // Extract template literals (backtick strings)
  const snippets: string[] = [];
  let i = 0;
  while (i < arrayContent.length) {
    // Find next backtick
    const backtickStart = arrayContent.indexOf('`', i);
    if (backtickStart === -1) break;
    
    // Find closing backtick
    const backtickEnd = arrayContent.indexOf('`', backtickStart + 1);
    if (backtickEnd === -1) break;
    
    const snippet = arrayContent.substring(backtickStart + 1, backtickEnd);
    snippets.push(snippet);
    i = backtickEnd + 1;
  }
  
  return snippets;
}

async function main() {
  const codeSnippetsPath = path.join(__dirname, '..', 'codeSnippets.ts');
  const jsonOutputPath = path.join(__dirname, '..', 'codeSnippets.json');
  
  // Read the current file
  const fileContent = fs.readFileSync(codeSnippetsPath, 'utf-8');
  
  // Extract raw snippets by parsing text (no import needed)
  const rawSnippets = extractRawSnippets(fileContent);
  console.log(`Found ${rawSnippets.length} raw snippets`);
  
  // Generate the computed objects
  const computedObjects = createCodeSnippetObjects(rawSnippets);
  console.log('Generated computed objects with word, curly brace, and parenthesis indices');
  
  // Write to JSON file
  fs.writeFileSync(jsonOutputPath, JSON.stringify(computedObjects, null, 2));
  
  console.log(`✅ Successfully wrote ${computedObjects.length} snippets to codeSnippets.json`);
}

main().catch(console.error);
