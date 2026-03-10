import type { codeSnippet, DeleteStrategy } from "../types.js";
import { getLineFromOffset, resolveKeyOffset, multiKeyResolve, findMaxFactor} from "./graphInfra.js";

function isCountToken(token: string): boolean {
    // In Vim, numeric counts are positive integers (1+). '0' is a motion.
    return /^[1-9]\d*$/.test(token);
}

function getLastMotionToken(sequence: string[]): string | undefined {
    for (let i = sequence.length - 1; i >= 0; i--) {
        const token = sequence[i];
        if (!token || isCountToken(token)) continue;
        return token;
    }
    return undefined;
}

function getMotionPreferenceScore(sequence: string[]): number {
    const lastMotion = getLastMotionToken(sequence);
    if (!lastMotion) return 0;
    const motionType = lastMotion[0];
    if (motionType === 'f' || motionType === 'F') return 2;
    if (motionType === 't' || motionType === 'T') return 1;
    return 0;
}

function hasTargetedFindMotion(sequence: string[]): boolean {
    return sequence.some(token => {
        if (!token || isCountToken(token)) return false;
        const motionType = token[0];
        return motionType === 'f' || motionType === 'F' || motionType === 't' || motionType === 'T';
    });
}

function shouldPreferCandidateOnTie(candidateSequence: string[], currentSequence: string[]): boolean {
    // Primary tie-breaker: fewer tokens in the sequence.
    if (candidateSequence.length !== currentSequence.length) {
        return candidateSequence.length < currentSequence.length;
    }

    const candidateHasTargetedFind = hasTargetedFindMotion(candidateSequence);
    const currentHasTargetedFind = hasTargetedFindMotion(currentSequence);
    // Prefer simpler motions (no f/F/t/T) when path lengths tie.
    if (candidateHasTargetedFind !== currentHasTargetedFind) {
        return !candidateHasTargetedFind;
    }

    // If both use targeted find motions, prefer f/F over t/T.
    return getMotionPreferenceScore(candidateSequence) > getMotionPreferenceScore(currentSequence);
}

function getMotionKeysForOffset(offset: number, codeSnippet: codeSnippet): string[] {
    const baseKeys = ['h', 'j', 'k', 'l', 'w', 'e', 'b', '0', '$'];
    const lineNumber = getLineFromOffset(offset, codeSnippet);
    const precomputedKeys = codeSnippet.precomputed?.motionKeysByLine[lineNumber];
    if (precomputedKeys && precomputedKeys.length > 0) {
        return precomputedKeys;
    }
    const lineRange = codeSnippet.lineOffsetRanges[lineNumber];
    if (!lineRange) return baseKeys;

    const [lineStart, lineEndExclusive] = lineRange;
    const lineText = codeSnippet.code.slice(lineStart, lineEndExclusive);
    const uniqueChars = new Set<string>(lineText);

    const targetedKeys: string[] = [];
    for (const char of uniqueChars) {
        targetedKeys.push(`f${char}`, `F${char}`, `t${char}`, `T${char}`);
    }
    return [...baseKeys, ...targetedKeys];
}

// START LAZY DIJKSTRA CREATION
interface vimCursorState {
    offset: number;
    preferredX: number;
}

interface dijkstraStateInfo {
    distance: number;
    sequence: string[];
}

interface heapEntry {
    stateKey: string;
    distance: number;
}

class minHeap {
    private data: heapEntry[] = [];

    isEmpty(): boolean {
        return this.data.length === 0;
    }

    push(entry: heapEntry): void {
        this.data.push(entry);
        this.bubbleUp(this.data.length - 1);
    }

    pop(): heapEntry | undefined {
        if (this.data.length === 0) return undefined;
        if (this.data.length === 1) return this.data.pop();
        const top = this.data[0];
        const last = this.data.pop();
        if (!top || !last) return top;
        this.data[0] = last;
        this.bubbleDown(0);
        return top;
    }

    private bubbleUp(index: number): void {
        let curr = index;
        while (curr > 0) {
            const parent = Math.floor((curr - 1) / 2);
            const currItem = this.data[curr];
            const parentItem = this.data[parent];
            if (!currItem || !parentItem || parentItem.distance <= currItem.distance) break;
            this.data[curr] = parentItem;
            this.data[parent] = currItem;
            curr = parent;
        }
    }

    private bubbleDown(index: number): void {
        let curr = index;
        const size = this.data.length;
        while (true) {
            const left = 2 * curr + 1;
            const right = left + 1;
            let smallest = curr;

            const smallestItem = this.data[smallest];
            const leftItem = this.data[left];
            const rightItem = this.data[right];

            if (left < size && smallestItem && leftItem && leftItem.distance < smallestItem.distance) {
                smallest = left;
            }
            const nextSmallestItem = this.data[smallest];
            if (right < size && nextSmallestItem && rightItem && rightItem.distance < nextSmallestItem.distance) {
                smallest = right;
            }
            if (smallest === curr) break;

            const currItem = this.data[curr];
            const swapItem = this.data[smallest];
            if (!currItem || !swapItem) break;
            this.data[curr] = swapItem;
            this.data[smallest] = currItem;
            curr = smallest;
        }
    }
}

function encodeStateKey(state: vimCursorState): string {
    return `${state.offset}:${state.preferredX}`;
}

function decodeStateKey(key: string): vimCursorState {
    const [offsetString, preferredXString] = key.split(":");
    return {
        offset: Number(offsetString),
        preferredX: Number(preferredXString),
    };
}

interface lazyNeighbor {
    to: vimCursorState;
    weight: number;
    keySequence: string[];
}

function getLazyNeighbors(state: vimCursorState, codeSnippet: codeSnippet): lazyNeighbor[] {
    const neighbors: lazyNeighbor[] = [];
    const vimKeys = getMotionKeysForOffset(state.offset, codeSnippet);

    for (const key of vimKeys) {
        const keyMaxFactor = findMaxFactor(state.offset, key, codeSnippet, state.preferredX);
        if (keyMaxFactor <= 0) continue;

        const allKeyOffsets = multiKeyResolve(
            state.offset,
            key,
            keyMaxFactor,
            codeSnippet,
            state.preferredX
        );

        allKeyOffsets.forEach((tuple, idx) => {
            const [nextOffset, nextPreferredX] = tuple;
            if (nextOffset < 0 || nextPreferredX < 0) return;

            const keySequence: string[] = [];
            if (idx !== 0) keySequence.push(String(idx + 1));
            keySequence.push(key);

            const extraWeight = key.length - 1; // f/t/F/T include target char
            neighbors.push({
                to: { offset: nextOffset, preferredX: nextPreferredX },
                weight: idx + 1 + extraWeight,
                keySequence,
            });
        });
    }

    return neighbors;
}

export function shortestVimSequenceLazy(
    codeSnippet: codeSnippet,
    startingOffset: number,
    targetOffset: number,
    startingPreferredX?: number
): [totalWeight: number, keySequence: string[]] {
    const startLine = getLineFromOffset(startingOffset, codeSnippet);
    const startLineRange = startLine >= 0 ? codeSnippet.lineOffsetRanges[startLine] : undefined;
    const defaultPreferredX = startLineRange ? startingOffset - startLineRange[0] : 0;
    const startState: vimCursorState = {
        offset: startingOffset,
        preferredX: startingPreferredX ?? defaultPreferredX,
    };

    const heap = new minHeap();
    const bestByState = new Map<string, dijkstraStateInfo>();

    const startKey = encodeStateKey(startState);
    bestByState.set(startKey, { distance: 0, sequence: [] });
    heap.push({ stateKey: startKey, distance: 0 });

    while (!heap.isEmpty()) {
        const currentEntry = heap.pop();
        if (!currentEntry) break;

        const currentBest = bestByState.get(currentEntry.stateKey);
        if (!currentBest || currentEntry.distance > currentBest.distance) {
            continue; // stale heap entry
        }

        const currentState = decodeStateKey(currentEntry.stateKey);
        if (currentState.offset === targetOffset) {
            return [currentBest.distance, currentBest.sequence];
        }

        const neighbors = getLazyNeighbors(currentState, codeSnippet);
        for (const neighbor of neighbors) {
            const neighborKey = encodeStateKey(neighbor.to);
            const candidateDistance = currentBest.distance + neighbor.weight;
            const candidateSequence = [...currentBest.sequence, ...neighbor.keySequence];
            const existing = bestByState.get(neighborKey);

            const isShorterPath = !existing || candidateDistance < existing.distance;
            const isPreferredTie =
                !!existing &&
                candidateDistance === existing.distance &&
                shouldPreferCandidateOnTie(candidateSequence, existing.sequence);

            if (!isShorterPath && !isPreferredTie) continue;

            bestByState.set(neighborKey, {
                distance: candidateDistance,
                sequence: candidateSequence,
            });
            heap.push({ stateKey: neighborKey, distance: candidateDistance });
        }
    }

    return [-1, []];
}

interface shortestAnyTargetResult {
    targetOffset: number;
    weight: number;
    sequence: string[];
}

function shortestVimSequenceLazyToAnyTarget(
    codeSnippet: codeSnippet,
    startingOffset: number,
    targetOffsets: number[],
    startingPreferredX?: number
): shortestAnyTargetResult | null {
    const uniqueTargets = new Set<number>(
        targetOffsets.filter(offset => offset >= 0 && offset < codeSnippet.code.length)
    );
    if (uniqueTargets.size === 0) return null;

    const startLine = getLineFromOffset(startingOffset, codeSnippet);
    const startLineRange = startLine >= 0 ? codeSnippet.lineOffsetRanges[startLine] : undefined;
    const defaultPreferredX = startLineRange ? startingOffset - startLineRange[0] : 0;
    const startState: vimCursorState = {
        offset: startingOffset,
        preferredX: startingPreferredX ?? defaultPreferredX,
    };

    const heap = new minHeap();
    const bestByState = new Map<string, dijkstraStateInfo>();

    const startKey = encodeStateKey(startState);
    bestByState.set(startKey, { distance: 0, sequence: [] });
    heap.push({ stateKey: startKey, distance: 0 });

    let bestTarget: shortestAnyTargetResult | null = null;

    while (!heap.isEmpty()) {
        const currentEntry = heap.pop();
        if (!currentEntry) break;

        if (bestTarget && currentEntry.distance > bestTarget.weight) {
            break;
        }

        const currentBest = bestByState.get(currentEntry.stateKey);
        if (!currentBest || currentEntry.distance > currentBest.distance) {
            continue; // stale heap entry
        }

        const currentState = decodeStateKey(currentEntry.stateKey);
        if (uniqueTargets.has(currentState.offset)) {
            if (
                !bestTarget ||
                currentBest.distance < bestTarget.weight ||
                (currentBest.distance === bestTarget.weight &&
                    shouldPreferCandidateOnTie(currentBest.sequence, bestTarget.sequence))
            ) {
                bestTarget = {
                    targetOffset: currentState.offset,
                    weight: currentBest.distance,
                    sequence: currentBest.sequence,
                };
            }
            continue;
        }

        const neighbors = getLazyNeighbors(currentState, codeSnippet);
        for (const neighbor of neighbors) {
            const neighborKey = encodeStateKey(neighbor.to);
            const candidateDistance = currentBest.distance + neighbor.weight;
            const candidateSequence = [...currentBest.sequence, ...neighbor.keySequence];
            const existing = bestByState.get(neighborKey);

            const isShorterPath = !existing || candidateDistance < existing.distance;
            const isPreferredTie =
                !!existing &&
                candidateDistance === existing.distance &&
                shouldPreferCandidateOnTie(candidateSequence, existing.sequence);

            if (!isShorterPath && !isPreferredTie) continue;

            bestByState.set(neighborKey, {
                distance: candidateDistance,
                sequence: candidateSequence,
            });
            heap.push({ stateKey: neighborKey, distance: candidateDistance });
        }
    }

    return bestTarget;
}

interface deletePlanCandidate {
    sequence: string[];
    weight: number;
}

export interface deleteRecommendation {
    recommendedSequence: string[];
    recommendedWeight: number;
}

interface shortestPathCacheEntry {
    weight: number;
    sequence: string[];
}

const SHORTEST_PATH_CACHE_MAX_ENTRIES = 10000;
const shortestPathCache = new Map<string, shortestPathCacheEntry>();

function getSnippetCacheId(codeSnippet: codeSnippet): string {
    // Stable enough for generated snippets; combine length and start sample to reduce collisions.
    const sample = codeSnippet.code.slice(0, 64);
    return `${codeSnippet.code.length}:${sample}`;
}

function buildShortestPathCacheKey(
    codeSnippet: codeSnippet,
    startOffset: number,
    startPreferredX: number,
    targetOffset: number
): string {
    return `${getSnippetCacheId(codeSnippet)}|${startOffset}|${startPreferredX}|${targetOffset}`;
}

function setCachedShortestPathResult(key: string, value: shortestPathCacheEntry): void {
    if (shortestPathCache.has(key)) {
        shortestPathCache.delete(key);
    }
    shortestPathCache.set(key, value);
    if (shortestPathCache.size > SHORTEST_PATH_CACHE_MAX_ENTRIES) {
        const oldestKey = shortestPathCache.keys().next().value;
        if (oldestKey) {
            shortestPathCache.delete(oldestKey);
        }
    }
}

function getShortestVimSequenceLazyMemoized(
    codeSnippet: codeSnippet,
    startingOffset: number,
    targetOffset: number,
    startingPreferredX: number
): [totalWeight: number, keySequence: string[]] {
    const key = buildShortestPathCacheKey(
        codeSnippet,
        startingOffset,
        startingPreferredX,
        targetOffset
    );
    const cached = shortestPathCache.get(key);
    if (cached) {
        return [cached.weight, [...cached.sequence]];
    }

    const [weight, sequence] = shortestVimSequenceLazy(
        codeSnippet,
        startingOffset,
        targetOffset,
        startingPreferredX
    );
    setCachedShortestPathResult(key, { weight, sequence: [...sequence] });
    return [weight, sequence];
}

function getOffsetColumn(codeSnippet: codeSnippet, offset: number): number {
    const line = getLineFromOffset(offset, codeSnippet);
    const lineRange = line >= 0 ? codeSnippet.lineOffsetRanges[line] : undefined;
    if (!lineRange) return 0;
    return offset - lineRange[0];
}

function expandSequenceToKeystrokeCount(sequence: string[]): number {
    return sequence.reduce((sum, token) => sum + token.length, 0);
}

function replaySequenceEndState(
    codeSnippet: codeSnippet,
    initialOffset: number,
    initialPreferredX: number,
    sequence: string[]
): vimCursorState {
    let offset = initialOffset;
    let preferredX = initialPreferredX;
    let pendingCount: number | null = null;

    for (const token of sequence) {
        if (isCountToken(token)) {
            pendingCount = Number(token);
            continue;
        }
        const repeatCount = pendingCount ?? 1;
        pendingCount = null;
        for (let i = 0; i < repeatCount; i++) {
            [offset, preferredX] = resolveKeyOffset(offset, token, codeSnippet, preferredX);
        }
    }
    return { offset, preferredX };
}

function getBestCandidate(candidates: deletePlanCandidate[]): deletePlanCandidate | null {
    if (candidates.length === 0) return null;
    let best = candidates[0]!;
    for (let i = 1; i < candidates.length; i++) {
        const candidate = candidates[i]!;
        if (candidate.weight < best.weight) {
            best = candidate;
        }
    }
    return best;
}

function buildSingleAnchorDeletePlan(
    codeSnippet: codeSnippet,
    startingOffset: number,
    startingPreferredX: number,
    anchorOffset: number,
    actionKeys: string[]
): deletePlanCandidate | null {
    const [navWeight, navSequence] = getShortestVimSequenceLazyMemoized(
        codeSnippet,
        startingOffset,
        anchorOffset,
        startingPreferredX
    );
    if (navWeight < 0) return null;
    return {
        sequence: [...navSequence, ...actionKeys],
        weight: navWeight + expandSequenceToKeystrokeCount(actionKeys),
    };
}

function buildAnyAnchorDeletePlan(
    codeSnippet: codeSnippet,
    startingOffset: number,
    startingPreferredX: number,
    anchorOffsets: number[],
    actionKeys: string[]
): deletePlanCandidate | null {
    const bestNavigation = shortestVimSequenceLazyToAnyTarget(
        codeSnippet,
        startingOffset,
        anchorOffsets,
        startingPreferredX
    );
    if (!bestNavigation) return null;
    return {
        sequence: [...bestNavigation.sequence, ...actionKeys],
        weight: bestNavigation.weight + expandSequenceToKeystrokeCount(actionKeys),
    };
}

function buildVisualDeletePlan(
    codeSnippet: codeSnippet,
    startingOffset: number,
    startingPreferredX: number,
    firstAnchor: number,
    secondAnchor: number
): deletePlanCandidate | null {
    const [firstNavWeight, firstNavSequence] = getShortestVimSequenceLazyMemoized(
        codeSnippet,
        startingOffset,
        firstAnchor,
        startingPreferredX
    );
    if (firstNavWeight < 0) return null;

    const firstEndState = replaySequenceEndState(
        codeSnippet,
        startingOffset,
        startingPreferredX,
        firstNavSequence
    );

    const [secondNavWeight, secondNavSequence] = getShortestVimSequenceLazyMemoized(
        codeSnippet,
        firstEndState.offset,
        secondAnchor,
        firstEndState.preferredX
    );
    if (secondNavWeight < 0) return null;

    return {
        sequence: [...firstNavSequence, 'v', ...secondNavSequence, 'd'],
        weight: firstNavWeight + 1 + secondNavWeight + 1,
    };
}

function getDeleteRangeForCountedE(
    codeSnippet: codeSnippet,
    offset: number,
    count: number
): [number, number] | null {
    if (count < 1 || codeSnippet.wordIndices.length === 0) return null;
    const startLineNumber = getLineFromOffset(offset, codeSnippet);
    const startLineRange = startLineNumber >= 0 ? codeSnippet.lineOffsetRanges[startLineNumber] : undefined;
    if (!startLineRange) return null;

    let currOffset = offset;
    let currPreferredX = currOffset - startLineRange[0];

    for (let i = 0; i < count; i++) {
        const [nextOffset, nextPreferredX] = resolveKeyOffset(currOffset, 'e', codeSnippet, currPreferredX);
        if (nextOffset === currOffset) {
            // No further e-motion available from this position.
            return null;
        }
        currOffset = nextOffset;
        currPreferredX = nextPreferredX;
    }

    // d{count}e deletes through the target character (inclusive).
    return [offset, Math.min(codeSnippet.code.length, currOffset + 1)];
}

function getMatchingCountedEMotions(
    codeSnippet: codeSnippet,
    from: number,
    to: number
): number[] {
    const matches: number[] = [];
    for (let count = 1; count <= codeSnippet.wordIndices.length; count++) {
        const simulatedRange = getDeleteRangeForCountedE(codeSnippet, from, count);
        if (!simulatedRange) continue;
        const [simulatedFrom, simulatedTo] = simulatedRange;
        if (simulatedFrom === from && simulatedTo === to) {
            matches.push(count);
        }
    }
    return matches;
}

function uniqueValidOffsets(offsets: number[], codeLength: number): number[] {
    const unique = new Set<number>();
    for (const offset of offsets) {
        if (offset >= 0 && offset < codeLength) unique.add(offset);
    }
    return [...unique];
}

function getInnerPairsForStrategy(codeSnippet: codeSnippet, strategy: DeleteStrategy): codeSnippet["curlyBraceIndices"] {
    if (strategy === 'INNER_CURLY_BRACE') return codeSnippet.curlyBraceIndices;
    if (strategy === 'INNER_PARENTHESIS') return codeSnippet.parenthesisIndices;
    return codeSnippet.bracketIndices;
}

function getInnermostContainingPair(
    pairs: codeSnippet["curlyBraceIndices"],
    offset: number
): [number, number] | null {
    let bestPair: [number, number] | null = null;
    let bestSpan = Number.MAX_SAFE_INTEGER;
    for (const pair of pairs) {
        const [openOffset, closeOffsetExclusive] = pair;
        if (offset < openOffset || offset >= closeOffsetExclusive) continue;
        const span = closeOffsetExclusive - openOffset;
        if (span < bestSpan) {
            bestSpan = span;
            bestPair = pair;
        }
    }
    return bestPair;
}

function getNextPairInFile(
    pairs: codeSnippet["curlyBraceIndices"],
    offset: number
): [number, number] | null {
    let nextPair: [number, number] | null = null;
    for (const pair of pairs) {
        const [openOffset] = pair;
        if (openOffset < offset) continue;
        if (!nextPair || openOffset < nextPair[0]) {
            nextPair = pair;
        }
    }
    return nextPair;
}

function getValidInnerTextObjectAnchors(
    codeSnippet: codeSnippet,
    strategy: DeleteStrategy,
    from: number,
    to: number
): number[] {
    const pairs = getInnerPairsForStrategy(codeSnippet, strategy);
    const targetOpen = from - 1;
    const targetCloseExclusive = to + 1;

    const targetExists = pairs.some(([openOffset, closeOffsetExclusive]) => {
        return openOffset === targetOpen && closeOffsetExclusive === targetCloseExclusive;
    });
    if (!targetExists) {
        return uniqueValidOffsets([from, Math.max(from, to - 1), from - 1, to], codeSnippet.code.length);
    }

    const validAnchors: number[] = [];
    for (let anchorOffset = 0; anchorOffset < codeSnippet.code.length; anchorOffset++) {
        // Vim-like text object resolution:
        // - If cursor is inside a pair, operate on that current (innermost) pair.
        // - Otherwise, operate on the next pair in file order.
        const containingPair = getInnermostContainingPair(pairs, anchorOffset);
        const effectivePair = containingPair ?? getNextPairInFile(pairs, anchorOffset);
        if (!effectivePair) continue;

        const [openOffset, closeOffsetExclusive] = effectivePair;
        const innerFrom = openOffset + 1;
        const innerTo = closeOffsetExclusive - 1;
        if (innerFrom === from && innerTo === to) {
            validAnchors.push(anchorOffset);
        }
    }

    return uniqueValidOffsets(
        [
            ...validAnchors,
            from,
            Math.max(from, to - 1),
            from - 1,
            to,
        ],
        codeSnippet.code.length
    );
}

export function getRecommendedDeleteSequence(
    codeSnippet: codeSnippet,
    strategy: DeleteStrategy,
    from: number,
    to: number,
    startingOffset = 0
): deleteRecommendation | null {
    const startingPreferredX = getOffsetColumn(codeSnippet, startingOffset);
    const inclusiveEnd = Math.max(from, to - 1);
    const candidates: deletePlanCandidate[] = [];

    if (strategy === 'WORD') {
        // Single-character target ranges are reliably handled by x.
        if (to === from + 1) {
            const xCandidate = buildSingleAnchorDeletePlan(
                codeSnippet,
                startingOffset,
                startingPreferredX,
                from,
                ['x']
            );
            if (xCandidate) candidates.push(xCandidate);
        }

        const matchingCounts = getMatchingCountedEMotions(
            codeSnippet,
            from,
            to
        );
        for (const count of matchingCounts) {
            const actionKeys = count === 1 ? ['d', 'e'] : ['d', String(count), 'e'];
            const candidate = buildSingleAnchorDeletePlan(
                codeSnippet,
                startingOffset,
                startingPreferredX,
                from,
                actionKeys
            );
            if (candidate) candidates.push(candidate);
        }
    }

    if (strategy === 'CURLY_BRACE' || strategy === 'PARENTHESIS' || strategy === 'BRACKET') {
        const anchors = uniqueValidOffsets([from, inclusiveEnd], codeSnippet.code.length);
        for (const anchor of anchors) {
            const candidate = buildSingleAnchorDeletePlan(
                codeSnippet,
                startingOffset,
                startingPreferredX,
                anchor,
                ['d', '%']
            );
            if (candidate) candidates.push(candidate);
        }
    }

    if (strategy === 'INNER_CURLY_BRACE' || strategy === 'INNER_PARENTHESIS' || strategy === 'INNER_BRACKET') {
        const textObjectChar = strategy === 'INNER_CURLY_BRACE' ? '{' : strategy === 'INNER_PARENTHESIS' ? '(' : '[';
        const anchors = getValidInnerTextObjectAnchors(codeSnippet, strategy, from, to);
        const candidate = buildAnyAnchorDeletePlan(
            codeSnippet,
            startingOffset,
            startingPreferredX,
            anchors,
            ['d', 'i', textObjectChar]
        );
        if (candidate) candidates.push(candidate);
    }

    if (strategy === 'RANDOM') {
        const aToB = buildVisualDeletePlan(
            codeSnippet,
            startingOffset,
            startingPreferredX,
            from,
            inclusiveEnd
        );
        if (aToB) candidates.push(aToB);

        const bToA = buildVisualDeletePlan(
            codeSnippet,
            startingOffset,
            startingPreferredX,
            inclusiveEnd,
            from
        );
        if (bToA) candidates.push(bToA);
    }

    const best = getBestCandidate(candidates);
    if (!best) return null;
    return {
        recommendedSequence: best.sequence,
        recommendedWeight: best.weight,
    };
}
