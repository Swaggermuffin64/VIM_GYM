import type { codeSnippet } from "../types.js";
import { getLineFromOffset, resolveKeyOffset, multiKeyResolve, findMaxFactor} from "./graphInfra.js";
import { CODE_SNIPPIT_OBJECTS } from "../codeSnippets.js";
// one way edge
interface vimEdge {
    weight: number,
    otherNode: offsetNode;
    keySequence: string[];
}
interface offsetNode {
    offset: number,
    connections: vimEdge[],
    associatedCharacter: string
}
interface dijkstraNodeInfo {
    node: offsetNode,
    shortestPath: number,
    shortestSequence: string[],
    visited: boolean, 
}

type vimGraph = Record<number, offsetNode>;

function isCountToken(token: string): boolean {
    return /^\d+$/.test(token);
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
    const baseKeys = ['h', 'j', 'k', 'l', 'w', 'b'];
    const lineNumber = getLineFromOffset(offset, codeSnippet);
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

export function buildSnippetGraph(codeSnippet: codeSnippet): vimGraph {
    //graph using vim keystrokes # as edge weight and vim 
    // for each offset, connect to nodes reachable by hjkl and their multiples
    const offsetToNode: vimGraph = {};

    for (let i=0; i<codeSnippet.code.length; i++) {
        const associatedCharacter = codeSnippet.code[i];
        if (associatedCharacter===undefined) continue; 
        const newNode: offsetNode = {offset: i, connections: [], associatedCharacter}
        offsetToNode[i] = newNode;
    }

    for (let i=0; i<codeSnippet.code.length; i++) {
        //going to start with states representing single key presses w/o factors
        const vimKeys = getMotionKeysForOffset(i, codeSnippet);
        for (const key of vimKeys) {
            const ourNode = offsetToNode[i];
            const lineNumber = getLineFromOffset(i, codeSnippet); 
            if (!ourNode || !codeSnippet.lineOffsetRanges || !codeSnippet.lineOffsetRanges[lineNumber]) continue;
            const startingRelativeX = i - codeSnippet.lineOffsetRanges[lineNumber][0];
            //find max factor, run multi resolve, map into edges add to connections
            const keyMaxFactor = findMaxFactor(i, key, codeSnippet, startingRelativeX); 
            const allKeyOffsets = multiKeyResolve(i, key, keyMaxFactor, codeSnippet, startingRelativeX);
            allKeyOffsets.forEach((tuple, idx) => {
                const currOffset = tuple[0];
                const otherNode = offsetToNode[currOffset];
                const keySequence = [];
                if (!otherNode) return;
                if (idx !== 0) keySequence.push(String(idx+1));
                keySequence.push(key);
                const extraWeight = key.length-1; //for f + <char> types
                const newEdge : vimEdge = { weight: idx+1+extraWeight, otherNode, keySequence};
                ourNode.connections.push(newEdge);
                //create edge for each
                // your logic here using tuple and idx
            });
        }

    }
    return offsetToNode;
}

function findNextDijkstraStart(dijkstraList: dijkstraNodeInfo[]): number {
    let currentMin = 998; //won't try unexplored nodes
    let nodeIndex = -1;
    for (let i = 0; i < dijkstraList.length; i++) {
        const nodeInfo = dijkstraList[i];
        if (!nodeInfo || nodeInfo.visited === true) continue;
        if (nodeInfo.shortestPath < currentMin) {
            currentMin = nodeInfo.shortestPath;
            nodeIndex = i;
        }
    }
    return nodeIndex;
}


export function shortestVimSequence(graph : vimGraph, codeSnippet: codeSnippet, startingOffset: number, 
targetOffset: number): [totalWeight: number, keySequence: string[]] {
    //Keep track of unvisited nodes and shortest paths, need to be able to find smallest unvisited
    //build list of nodes with [node, visitedbool, shortestPath]
    const lastCharOffset = codeSnippet.code.length;
    const dijkstraList: dijkstraNodeInfo[] = []; //should use a heap, however i do not care!
    const newLineIndexes = codeSnippet.lineOffsetRanges.map(lineRange => lineRange[1]);
    for (let i = 0; i < lastCharOffset; i++) {
        const node = graph[i];
        if (!node) continue;
        if (newLineIndexes.includes(i)){
            //placeholders for newlines
            dijkstraList.push({ node, shortestPath: i === startingOffset ? 0 : 999, shortestSequence: [], visited: true });
            continue;
        }
        dijkstraList.push({ node, shortestPath: i === startingOffset ? 0 : 999, shortestSequence: [], visited: false });
    }
    // Make a list with just the visited bools from dijkstraList
    let currentNodeIndex = 0;
    while (currentNodeIndex !== -1) {
        //explore current nodes connections
        const currentNode = graph[currentNodeIndex];
        const currentShortestPath = dijkstraList[currentNodeIndex];
        if (!currentNode || !currentShortestPath) continue;
        for (const edge of currentNode.connections){
            //possibleNewMin is distance to current Node + edgeWeight
            //must be smaller than current
            const connectedNodeOffset = edge.otherNode.offset;
            const connectedNodeInfo = dijkstraList[connectedNodeOffset];
            if (!connectedNodeInfo) continue;
            const possibleNewMin = currentShortestPath.shortestPath + edge.weight;
            const candidateSequence = [...currentShortestPath.shortestSequence, ...edge.keySequence];
            const isShorterPath = possibleNewMin < connectedNodeInfo.shortestPath;
            const isPreferredTie =
                possibleNewMin === connectedNodeInfo.shortestPath &&
                shouldPreferCandidateOnTie(candidateSequence, connectedNodeInfo.shortestSequence);
            if (isShorterPath || isPreferredTie) {
                connectedNodeInfo.shortestPath = possibleNewMin;
                connectedNodeInfo.shortestSequence = candidateSequence;
            }
        }
        currentShortestPath.visited = true;
        currentNodeIndex = findNextDijkstraStart(dijkstraList);
    }
    if (!dijkstraList[targetOffset]) return [-1,[]];
    return [dijkstraList[targetOffset].shortestPath, dijkstraList[targetOffset]?.shortestSequence];

    // use dijkstras algorithm, return key sequence, weight
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
const exampleCodeSnippet = CODE_SNIPPIT_OBJECTS[0]; 
if (exampleCodeSnippet) {
    const graph = buildSnippetGraph(exampleCodeSnippet);
    const startNode = graph[0];
//    if (startNode) {
//        console.log(
//            startNode.connections.map(({ weight, otherNode, keySequence }) => ({
//              weight,
//              otherOffset: otherNode.offset,
//              keySequence,
//            }))
//        );
//    }
    const [w, s] = shortestVimSequenceLazy(exampleCodeSnippet, 76, 0);
    console.log(w,s);
}