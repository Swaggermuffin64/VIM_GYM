// Task types matching backend

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
  line: number;  // 1-indexed
  col: number;   // 0-indexed
}

export interface PositionTask {
  id: string;
  type: 'navigate';
  description: string;
  codeSnippet: string;
  targetPosition: Position;
  targetOffset: number;
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

export type Task = PositionTask | DeleteTask;

export interface TaskResponse {
  task: Task;
  startTime: number;
}

export interface TaskSummary {
  taskIndex: number;
  taskId: string;
  taskType: Task['type'];
  task: Task;
  durationMs: number;
  keyCount: number;
  keySequence: string;
  optimalSequence?: string;
  ourSolutionKeyCount?: number;
}

export interface PracticeSummary {
  totalTasks: number;
  navigateTasks: number;
  deleteTasks: number;
  navigateTasksWithRecommendation: number;
  deleteTasksWithRecommendation: number;
}

