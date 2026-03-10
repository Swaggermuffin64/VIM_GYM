// Shared task types for vim racing

export type TaskType = 'navigate' | 'delete' | 'insert' | 'change';

// Delete strategies - maps to vim commands
export type DeleteStrategy = 
  | 'WORD'              // dw, d2w, d3w
  | 'CURLY_BRACE'       // da{
  | 'INNER_CURLY_BRACE' // di{
  | 'PARENTHESIS'       // da(
  | 'INNER_PARENTHESIS' // di(
  | 'BRACKET'           // da[
  | 'INNER_BRACKET'     // di[
  | 'RANDOM';           // arbitrary range

export interface Position {
  line: number;  // 1-indexed line number
  col: number;   // 0-indexed column
}

export interface PositionTask {
  id: string;
  type: 'navigate';
  description: string;
  codeSnippet: string;
  targetPosition: Position;
  // Character offset in the document (for CodeMirror highlighting)
  targetOffset: number;
  // Optional backend recommendation for fastest vim path.
  recommendedSequence?: string[];
  recommendedWeight?: number;
}

export interface DeleteTask {
  id: string;
  type: 'delete';
  description: string;
  codeSnippet: string;
  targetRange: { from: number; to: number };
  expectedResult: string;
  strategy: DeleteStrategy;
  recommendedSequence?: string[];
  recommendedWeight?: number;
}

export interface ChangeTask {
  id: string;
  type: 'change';
  description: string;
  codeSnippet: string;
  targetRange: { from: number; to: number };
  newText: string;
  expectedResult: string;
}

export type Task = PositionTask | DeleteTask | ChangeTask;

export interface TaskResponse {
  task: Task;
  startTime: number;
}

export interface PracticeSummary {
  totalTasks: number;
  navigateTasks: number;
  deleteTasks: number;
  navigateTasksWithRecommendation: number;
  deleteTasksWithRecommendation: number;
}

export type KeystrokeSource = 'practice' | 'multiplayer';

export interface KeystrokeEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  dtMs: number;
}

export interface TaskKeystrokeSubmission {
  source: KeystrokeSource;
  taskId: string;
  taskType: TaskType;
  startedAt: number;
  completedAt: number;
  roomId?: string;
  playerId?: string;
  events: KeystrokeEvent[];
}

export interface codeSnippet {
  code: string;
  wordIndices: IntTuple[];
  curlyBraceIndices: IntTuple[];
  parenthesisIndices: IntTuple[];
  bracketIndices: IntTuple[];
  lineOffsetRanges: IntTuple[];
  precomputed?: {
    lineStartOffsets: number[];
    // Maps each character offset to its 0-indexed line.
    offsetToLine: number[];
    // Per-line motion keys to avoid rebuilding find-char keys repeatedly.
    motionKeysByLine: string[][];
  };
}

export type IntTuple = [number, number];
