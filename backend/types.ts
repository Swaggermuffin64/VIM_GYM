// Shared task types for vim racing

export type TaskType = 'navigate' | 'delete' | 'yank_paste';

// Delete strategies - maps to vim commands
export type DeleteStrategy =
  | 'WORD' // dw, d2w, d3w
  | 'CURLY_BRACE' // da{
  | 'INNER_CURLY_BRACE' // di{
  | 'PARENTHESIS' // da(
  | 'INNER_PARENTHESIS' // di(
  | 'BRACKET' // da[
  | 'INNER_BRACKET' // di[
  | 'RANDOM'; // arbitrary range

export interface Position {
  line: number; // 1-indexed line number
  col: number; // 0-indexed column
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
  /** Text before the target range — precomputed at generation time. */
  prefix: string;
  /** Text after the target range — precomputed at generation time. */
  suffix: string;
  /** Original text within the target range — precomputed at generation time. */
  originalMiddle: string;
  strategy: DeleteStrategy;
  recommendedSequence?: string[];
  recommendedWeight?: number;
}

export type YankStrategy = 'WORD' | 'LINE' | 'BRACKET';

export interface YankPasteTask {
  id: string;
  type: 'yank_paste';
  description: string;
  codeSnippet: string;
  yankRange: { from: number; to: number };
  pasteOffset: number;
  /** All acceptable paste results (p/P, linewise/characterwise). */
  expectedResults: string[];
  yankedText: string;
  strategy: YankStrategy;
  /** For LINE strategy, true signals linewise paste behavior. */
  linewise?: boolean;
  recommendedSequence?: string[];
  recommendedWeight?: number;
}

export type Task = PositionTask | DeleteTask | YankPasteTask;

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
