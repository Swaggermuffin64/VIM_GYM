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

function isLetter(char: string): boolean {
  return /^[a-zA-Z]$/.test(char);
}

function getWordIndices(code: string): IntTuple[] {
  let lag = 0;
  let foundWord = false;
  let wordIndiceArray: IntTuple[] = [];
  
  for (let lead = 0; lead < code.length; lead++) {
    const leadChar = code[lead];
    const isLeadLetter = isLetter(leadChar ?? '');
    const isLastChar = lead === code.length - 1;
    
    // Start of a new word
    if (isLeadLetter && !foundWord) {
      foundWord = true;
      lag = lead;
    }
    
    // End of word: either hit non-letter or reached end of string
    if (foundWord && (!isLeadLetter || isLastChar)) {
      const wordEnd = isLeadLetter ? lead + 1 : lead;
      wordIndiceArray.push([lag, wordEnd]);
      foundWord = false;
    }
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
      let code_object: codeSnippet = {
        code: code_snippet,
        wordIndices: getWordIndices(code_snippet),
        curlyBraceIndices: getCurlyBraceIndices(code_snippet),
        parenthesisIndices: getParenthesisIndices(code_snippet),
        bracketIndices: getBracketIndices(code_snippet),
        lineOffsetRanges: getNewlineOffsets(code_snippet),
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
