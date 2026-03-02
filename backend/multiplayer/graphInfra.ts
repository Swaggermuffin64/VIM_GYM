import type { codeSnippet } from "../types.js";
import { getLineFromOffset, resolveKeyOffset } from "./vimMotionsGraph.js";
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

export function buildSnippetGraph(codeSnippet: codeSnippet): vimGraph {
    //graph using vim keystrokes # as edge weight and vim 
    // for each offset, connect to nodes reachable by hjkl and their multiples
    const vimKeys=['h', 'j', 'k', 'l']; 
    const offsetToNode: vimGraph = {};

    for (let i=0; i<codeSnippet.code.length; i++) {
        const associatedCharacter = codeSnippet.code[i];
        if (associatedCharacter===undefined) continue; 
        const newNode: offsetNode = {offset: i, connections: [], associatedCharacter}
        offsetToNode[i] = newNode;
    }

    for (let i=0; i<codeSnippet.code.length; i++) {
        //going to start with states representing single key presses w/o factors
        for (const key of vimKeys) {
           const lineNumber = getLineFromOffset(i, codeSnippet.lineOffsetRanges); 
           if (!codeSnippet.lineOffsetRanges || !codeSnippet.lineOffsetRanges[lineNumber]) continue;
           const startingRelativeX = i - codeSnippet.lineOffsetRanges[lineNumber][0];
           const [offset, relativeX] = resolveKeyOffset(i, key, codeSnippet, startingRelativeX);
           if (offset == i) continue; //no self nodes
           const ourNode = offsetToNode[i]
           const otherNode = offsetToNode[offset];
           if (!otherNode || !ourNode) continue;
           const newEdge: vimEdge = {weight: 1, otherNode, keySequence: [key]};
           ourNode.connections.push(newEdge);
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
    const dijkstraList: dijkstraNodeInfo[] = [];
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
            if (possibleNewMin < connectedNodeInfo.shortestPath) {
                connectedNodeInfo.shortestPath = possibleNewMin;
                connectedNodeInfo.shortestSequence = [...currentShortestPath.shortestSequence, ...edge.keySequence];
            }
        }
        currentShortestPath.visited = true;
        currentNodeIndex = findNextDijkstraStart(dijkstraList);
        console.log(currentNodeIndex);
    }
    if (!dijkstraList[targetOffset]) return [-1,[]];
    return [dijkstraList[targetOffset].shortestPath, dijkstraList[targetOffset]?.shortestSequence];

    // use dijkstras algorithm, return key sequence, weight
}
const exampleCodeSnippet = CODE_SNIPPIT_OBJECTS[0]; 
if (exampleCodeSnippet) {
    const graph = buildSnippetGraph(exampleCodeSnippet);
    const [w, seq] = shortestVimSequence(graph, exampleCodeSnippet, 0, 98);
    console.log(w, seq);
}