import { Task, PositionTask } from './task'
// Multiplayer types for frontend

// Default empty task used before game starts
export const EMPTY_TASK: PositionTask = {
  id: '',
  type: 'navigate',
  description: '',
  codeSnippet: '',
  targetPosition: { line: 1, col: 0 },
  targetOffset: 0,
};

export interface Player {
  id: string;
  name: string;
  cursorOffset: number;
  taskProgress: number;
  isFinished: boolean;
  leftRace?: boolean;
  readyToPlay: boolean;
  finishTime?: number;
}

export interface GameTask {
  id: string;
  type: 'navigate';
  description: string;
  codeSnippet: string;
  targetPosition: { line: number; col: number };
  targetOffset: number;
}

export interface Ranking {
  playerId: string;
  playerName: string;
  time: number;
  position: number;
}

export type RoomState = 'idle' | 'waiting' | 'countdown' | 'racing' | 'finished';

export interface GameState {
  roomId: string | null;
  roomState: RoomState;
  players: Player[];
  task: Task;
  taskQueue: Task[];
  num_tasks: number;
  countdown: number | null;
  startTime: number | null;
  rankings: Ranking[] | null;
  myPlayerId: string | null;
  shouldResetEditor: boolean;  // Set to true when validation fails, cleared after reset
}

