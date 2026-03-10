import type { codeSnippet, IntTuple } from "../types.js";

const WANTED_EOL_RELATIVE_X = Number.MAX_SAFE_INTEGER;
//return zero indexed line for any offset
export function getLineFromOffset(offset: number, codeSnippet: codeSnippet) {
    const precomputedLine = codeSnippet.precomputed?.offsetToLine[offset];
    if (precomputedLine !== undefined) {
        return precomputedLine;
    }
    const allLineOffsets = codeSnippet.lineOffsetRanges;
    for (let i = 0; i < allLineOffsets.length; i++) {

        const lineOffsets = allLineOffsets[i];

        if (!lineOffsets || lineOffsets.length < 2) continue;
        // Treat newline boundary as belonging to this line so motions like '$'
        // don't fall back to stale savedRelativeX when cursor is at EOL boundary.
        if (offset >= lineOffsets[0] && offset <= lineOffsets[1]){
            return i;
        }
    }
    return -1;
}

export function resolveKeyOffset(offset: number, key: string, codeSnippet: codeSnippet, savedRelativeX: number): IntTuple {
    const lineOffsetRanges = codeSnippet.lineOffsetRanges;
    if (!lineOffsetRanges) return [offset, savedRelativeX];
    const lineStartOffsets = codeSnippet.precomputed?.lineStartOffsets ?? lineOffsetRanges.map(range => range[0]);
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
            // Vim default: h does not wrap to previous line.
            if (offset <= lineStart) {
               return [offset, savedRelativeX];
            }
            const newOffset = offset - 1;
            return [newOffset, newOffset - lineStart];
        }

        case 'l': {
            // Vim default: l does not wrap to next line.
            if (offset >= lineEnd) {
                return [offset, savedRelativeX];
            }
            const newOffset = offset + 1;
            return [newOffset, newOffset - lineStart];
        }

        case '0': {
            // Move to first character in the current line.
            return [lineStart, 0];
        }

        case '$': {
            // Move to last character in the current line and keep "want EOL" goal for j/k.
            return [lineEnd, WANTED_EOL_RELATIVE_X];
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

            // Vim "$ then j/k" behavior: keep jumping to EOL.
            if (savedRelativeX === WANTED_EOL_RELATIVE_X) {
                return [nextLineRange[1] - 1, WANTED_EOL_RELATIVE_X];
            }

            // If goal column is larger than next line, clamp cursor but keep goal column.
            const nextLineLength = nextLineRange[1] - nextLineRange[0];
            if (nextLineLength <= savedRelativeX) {      //including newline so <=
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

            // Vim "$ then j/k" behavior: keep jumping to EOL.
            if (savedRelativeX === WANTED_EOL_RELATIVE_X) {
                return [prevLineRange[1] - 1, WANTED_EOL_RELATIVE_X];
            }

            // If goal column is larger than previous line, clamp cursor but keep goal column.
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
        case 'e': {
            // Move to end of current word, or next word if already at end/in whitespace.
            if (offset === codeSnippet.code.length - 1) {
                return [offset, savedRelativeX];
            }
            const words = codeSnippet.wordIndices;
            if (words.length === 0) return [offset, savedRelativeX];

            const currentWordIndex = findWordIndex(offset, codeSnippet);
            const currentWord = words[currentWordIndex];
            if (!currentWord) return [offset, savedRelativeX];
            const [currentWordStart, currentWordEndExclusive] = currentWord;
            const currentWordEnd = currentWordEndExclusive - 1;
            const nextWord = words[currentWordIndex + 1];

            let targetWord = currentWord;
            // If currently at/after the end of this word, or in trailing whitespace for this word,
            // advance to next word when possible.
            if ((offset >= currentWordEnd || offset >= currentWordEndExclusive) && nextWord) {
                targetWord = nextWord;
            }
            // Before first word start (e.g. leading spaces) should stay with current word.
            if (offset < currentWordStart) {
                targetWord = currentWord;
            }

            const targetEndExclusive = targetWord[1];
            if (targetEndExclusive === undefined) return [offset, savedRelativeX];
            const newOffset = targetEndExclusive - 1;
            const newLineNumber = getLineFromOffset(newOffset, codeSnippet);
            const newLineStart = lineStartOffsets[newLineNumber];
            if (newLineStart === undefined) return [offset, savedRelativeX];
            return [newOffset, newOffset - newLineStart];
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
    // factor is provided separately; keep key literal so '0' works as motion.
    const normalizedFactor = Math.max(0, Math.floor(factor));
    const positions = [];
    let offset = initialOffset;
    let relativeX = startingRelativeX;
    for (let i = 0; i < normalizedFactor; i++) {
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
