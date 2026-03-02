import type { codeSnippet } from "../types.js";
import { getLineFromOffset, resolveKeyOffset, multiKeyResolve, findMaxFactor} from "./vimMotionsGraph.js";
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
            const ourNode = offsetToNode[i];
            const lineNumber = getLineFromOffset(i, codeSnippet.lineOffsetRanges); 
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
                const newEdge : vimEdge = { weight: idx+1, otherNode, keySequence};
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
            if (possibleNewMin < connectedNodeInfo.shortestPath) {
                connectedNodeInfo.shortestPath = possibleNewMin;
                connectedNodeInfo.shortestSequence = [...currentShortestPath.shortestSequence, ...edge.keySequence];
            }
        }
        currentShortestPath.visited = true;
        currentNodeIndex = findNextDijkstraStart(dijkstraList);
    }
    if (!dijkstraList[targetOffset]) return [-1,[]];
    return [dijkstraList[targetOffset].shortestPath, dijkstraList[targetOffset]?.shortestSequence];

    // use dijkstras algorithm, return key sequence, weight
}
const exampleCodeSnippet = CODE_SNIPPIT_OBJECTS[0]; 
//if (exampleCodeSnippet) {
//    const graph = buildSnippetGraph(exampleCodeSnippet);
//    console.log(
//        graph[24].connections.map(({ weight, otherNode, keySequence }) => ({
//          weight,
//          otherOffset: otherNode.offset,
//          keySequence,
//        }))
//    );
//const [w, seq] = shortestVimSequence(graph, exampleCodeSnippet, 86, 0);
//console.log(w, seq);
//}