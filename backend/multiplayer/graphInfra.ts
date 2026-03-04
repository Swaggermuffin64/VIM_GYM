import type { codeSnippet, IntTuple } from "../types.js";
import { CODE_SNIPPIT_OBJECTS } from "../codeSnippets.js";
import { buildSnippetGraph, shortestVimSequence } from "./vimGraph.js";
//Function that takes in a offset for a code snippet and calculates all offsets vim motions would bring you to
function logCodeOffsets(codeSnippet: codeSnippet){
    let i = 0;
    for (const char of codeSnippet.code) {
        if (char === '\n') {
            console.log('NEWLINE AT', i);
        }
        else {
            console.log(char, i);
        }
        i++;
    }
    console.log("length", codeSnippet.code.length)
}
//return zero indexed line for any offset
export function getLineFromOffset(offset: number, codeSnippet: codeSnippet) {
    const allLineOffsets = codeSnippet.lineOffsetRanges;
    for (let i = 0; i < allLineOffsets.length; i++) {

        const lineOffsets = allLineOffsets[i];

        if (!lineOffsets || lineOffsets.length < 2) continue;
        if (offset >= lineOffsets[0] && offset < lineOffsets[1]){
            return i;
        }
    }
    return -1;
}

export function resolveKeyOffset(offset: number, key: string, codeSnippet: codeSnippet, savedRelativeX: number): IntTuple {
    const lineOffsetRanges = codeSnippet.lineOffsetRanges;
    if (!lineOffsetRanges) return [offset, savedRelativeX];
    const lineStartOffsets = lineOffsetRanges.map(range => range[0]);
    const lineEndOffsets = lineOffsetRanges.map(range => range[1] - 1); // don't include newline
    const lineNumber = getLineFromOffset(offset, codeSnippet);
    const totalLines = lineOffsetRanges.length;
    const currentLineRange = lineOffsetRanges[lineNumber];
    if (!currentLineRange) return [offset, savedRelativeX];
    const [lineStart, lineEndExclusive] = currentLineRange;
    const lineEnd = lineEndExclusive - 1;
    const motion = key[0];
    const targetChar = key.length > 1 ? key.slice(1) : "";

    switch (motion) {
        case 'h': {
            //TODO, fix savedRelativeX logic
            //doesn't move if at 0
            if (offset === 0) {
               return [0, savedRelativeX]; 
            }
            // for both cases under, savedRelative X changes
            // if at start of line, go to line above, skip \n
            let newRelativeX: number; 
            let newOffset: number;
            // if moving up to the line before
            if (lineStartOffsets.includes(offset)) {
                const prevLineRange = lineOffsetRanges[lineNumber-1]; 
                if (!prevLineRange) return [-1, -1];
                newOffset = offset - 2;
                newRelativeX = newOffset - prevLineRange[0];
                return [newOffset, newRelativeX];
            } 
            // otherwise in middle of line, just -1 
            const currentLineRange = lineOffsetRanges[lineNumber];
            if (!currentLineRange) return [-1, -1];
            newOffset = offset-1;
            newRelativeX = newOffset - currentLineRange[0];
            return [newOffset, newRelativeX];
        }

        case 'l': {
            if (offset === codeSnippet.code.length - 1) {
                return [codeSnippet.code.length - 1, savedRelativeX]
            }
            // for both cases under, savedRelativeX changes 
            let newRelativeX: number; 
            let newOffset: number;
            if (lineEndOffsets.includes(offset)) {
                newRelativeX = 0; //always start of next line
                return [offset + 2, newRelativeX];  //considering newline jump
            }
            const currentLineRange = lineOffsetRanges[lineNumber];
            if (!currentLineRange) return [-1, -1];
            newOffset = offset+1;
            newRelativeX = newOffset - currentLineRange[0];
            return [newOffset, newRelativeX];
        }

        case 'j': {
            // if on last line we can't move down
            if (lineNumber === totalLines - 1) {
                return [offset, savedRelativeX];
            }
            // cases from here need to respect savedRelativeX
            const currentLineRange = lineOffsetRanges[lineNumber];
            const nextLineRange = lineOffsetRanges[lineNumber + 1];
            if (!currentLineRange || !nextLineRange) return [offset, savedRelativeX];

            // cases if savedRelativeX is larger than the next line
            
            const nextLineLength = nextLineRange[1] - nextLineRange[0];
            if (nextLineLength <= savedRelativeX) {      //including newline so <=
                // move to end of next line
                return [nextLineRange[1]-1, savedRelativeX];
            }

            return [nextLineRange[0]+savedRelativeX, savedRelativeX];
        }

        case 'k': {
            if (lineNumber === 0) { //can't move up if at top line
                return [offset, savedRelativeX];
            }
            const currentLineRange = lineOffsetRanges[lineNumber];
            const prevLineRange = lineOffsetRanges[lineNumber-1];
            if (!currentLineRange || !prevLineRange) return [offset, savedRelativeX];

            //cases if savedRelativeX larger than above line

            const prevLineLength = prevLineRange[1]-prevLineRange[0];
            if (prevLineLength <= savedRelativeX) {
                return [prevLineRange[1]-1, savedRelativeX];
            }
            return [prevLineRange[0]+savedRelativeX, savedRelativeX]
        }
        case 'w': {
            //don't move at end
            if (offset === codeSnippet.code.length - 1) {
                return [offset, savedRelativeX]
            }
            //otherwise, find current/previous word index
            const currWordIndex = findWordIndex(offset, codeSnippet);
            //move to next word, if at last word, go to last char of file
            const nextWordIndices = codeSnippet.wordIndices[currWordIndex+1];
            const currentLineStart = lineStartOffsets[lineNumber];
            if (currentLineStart === undefined) return [-1, -1];
            //if end is blank spaces
            if (!nextWordIndices) return [codeSnippet.code.length-1, (codeSnippet.code.length-1) - currentLineStart];
            const newOffset = nextWordIndices[0];
            const lineStart = lineStartOffsets[getLineFromOffset(nextWordIndices[0], codeSnippet)];
            if (lineStart === undefined) return [-1, -1];
            return [newOffset, newOffset-lineStart]; 
        }
        case 'b': {
            //don't move at start
            if (offset === 0){
                return [offset, savedRelativeX]
            }
            const currWordIndex = findWordIndex(offset, codeSnippet);
            const currWordRange = codeSnippet.wordIndices[currWordIndex];
            if (!currWordRange) return [offset, savedRelativeX];

            const [currWordStart] = currWordRange;
            const previousWordRange = codeSnippet.wordIndices[currWordIndex - 1];

            // Vim-like behavior: at a word start, b goes to previous word start.
            const newOffset = offset === currWordStart && previousWordRange ? previousWordRange[0] : currWordStart;
            const newLineNumber = getLineFromOffset(newOffset, codeSnippet);
            const newLineStart = lineStartOffsets[newLineNumber];
            if (newLineStart === undefined) return [offset, savedRelativeX];
            return [newOffset, newOffset - newLineStart];
        }

        case 'f': {
            if (!targetChar) return [offset, savedRelativeX];
            const searchStart = offset + 1;
            if (searchStart > lineEnd) return [offset, savedRelativeX];
            const foundOffset = codeSnippet.code.indexOf(targetChar, searchStart);
            if (foundOffset === -1 || foundOffset > lineEnd) return [offset, savedRelativeX];
            return [foundOffset, foundOffset - lineStart];
        }

        case 'F': {
            if (!targetChar) return [offset, savedRelativeX];
            const searchEnd = offset - 1;
            if (searchEnd < lineStart) return [offset, savedRelativeX];
            const lineText = codeSnippet.code.slice(lineStart, searchEnd + 1);
            const localFoundOffset = lineText.lastIndexOf(targetChar);
            if (localFoundOffset === -1) return [offset, savedRelativeX];
            const foundOffset = lineStart + localFoundOffset;
            return [foundOffset, foundOffset - lineStart];
        }

        case 't': {
            if (!targetChar) return [offset, savedRelativeX];
            const searchStart = offset + 1;
            if (searchStart > lineEnd) return [offset, savedRelativeX];
            const foundOffset = codeSnippet.code.indexOf(targetChar, searchStart);
            if (foundOffset === -1 || foundOffset > lineEnd) return [offset, savedRelativeX];
            const newOffset = foundOffset - 1;
            if (newOffset < lineStart) return [offset, savedRelativeX];
            return [newOffset, newOffset - lineStart];
        }

        case 'T': {
            if (!targetChar) return [offset, savedRelativeX];
            const searchEnd = offset - 1;
            if (searchEnd < lineStart) return [offset, savedRelativeX];
            const lineText = codeSnippet.code.slice(lineStart, searchEnd + 1);
            const localFoundOffset = lineText.lastIndexOf(targetChar);
            if (localFoundOffset === -1) return [offset, savedRelativeX];
            const foundOffset = lineStart + localFoundOffset;
            const newOffset = foundOffset + 1;
            if (newOffset > lineEnd) return [offset, savedRelativeX];
            return [newOffset, newOffset - lineStart];
        }

    }
    return [-1, -1];
}

export function multiKeyResolve(initialOffset:number, key:string, factor: number, codeSnippet: codeSnippet, startingRelativeX: number): IntTuple[] {
    const positions = [];
    let offset = initialOffset;
    let relativeX = startingRelativeX;
    for (let i = 0; i < factor; i++) {
        [offset, relativeX] = resolveKeyOffset(offset, key, codeSnippet, relativeX);
        positions.push([offset, relativeX] as IntTuple);
    }
    return positions;
}

export function findMaxFactor(initialOffset: number, key:string, codeSnippet: codeSnippet, startingRelativeX: number) {
    let i = 0;
    let prevOffset = initialOffset; 
    let prevRelativeX = startingRelativeX;
    while (i < codeSnippet.code.length + 1) {
        const [currOffset, currRelativeX] = resolveKeyOffset(prevOffset, key, codeSnippet, prevRelativeX);
        if (currOffset === prevOffset) return i;
        prevOffset = currOffset;
        prevRelativeX = currRelativeX;
        i++;
    }
    return -1
}
export function findWordIndex(offset: number, codeSnippet: codeSnippet): number {
    const wordRanges = codeSnippet.wordIndices;
    for (const [i, [wordStart, afterWordEnd]] of wordRanges.entries()) {
        //if offset is within word, return word index
        if (offset >= wordStart && offset<afterWordEnd) {
            return i
        }
        const nextWordRange = codeSnippet.wordIndices[i+1];
        const nextWordStart = nextWordRange ? nextWordRange[0] : codeSnippet.code.length;
        if (offset >=afterWordEnd && offset<nextWordStart) {
            return i
        }
    }
    //case where offset is are spaces before the first space
    return 0;
}

const exampleCodeSnippet = CODE_SNIPPIT_OBJECTS[0] as codeSnippet;
logCodeOffsets(exampleCodeSnippet);
multiKeyResolve(23, 'l', 23, exampleCodeSnippet, 0);
const graph = buildSnippetGraph(exampleCodeSnippet);
console.log(exampleCodeSnippet.lineOffsetRanges);

const [w, seq] = shortestVimSequence(graph, exampleCodeSnippet, 76, 0);
console.log(w, seq);
//console.log(multiKeyResolve(16, 'f', 4, exampleCodeSnippet, 16));
//console.log(findMaxFactor(98, 'h', exampleCodeSnippet, 0));
//console.log(findWordIndex(98, exampleCodeSnippet));
//console.log(resolveKeyOffset(0, 'fa', exampleCodeSnippet, 0));