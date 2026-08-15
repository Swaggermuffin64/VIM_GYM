// Shared multiplayer types
import type { Task } from '../types.js';
import type { LeaderboardRanks } from '../db/leaderboard.js';
//NEED TO SYNC MAX PLAYERS WITH MATCHMAKING SERVICE
export const MAX_PLAYERS_PER_ROOM = 2;

export interface Player {
  id: string;
  name: string;
  taskProgress: number;
  isFinished: boolean;
  /** True when player leaves after the race lifecycle has started */
  leftRace?: boolean;
  readyToPlay: boolean;
  finishTime?: number;
  /** Server-side only: timestamp when the current task was presented */
  taskStartedAt?: number;
  /** Server-side only: last validated editor buffer for the current delete task */
  editorBuffer?: string;
  /** Server-side only: Supabase user id when the socket is authenticated. */
  userId?: string;
}

/**
 * A completed task attempt waiting for the games row to be created.
 * gameId is filled in when the pending game session resolves.
 */
export interface PendingTaskAttempt {
  userId: string;
  taskHash: string;
  playMode: string;
  durationMs: number;
}

export interface GameRoom {
  id: string;
  players: Map<string, Player>;
  tasks: Task[];
  num_tasks: number;
  state: 'waiting' | 'countdown' | 'racing' | 'finished';
  isPublic: boolean; // True for quick match rooms, false for private rooms
  isLoadTest?: boolean; // True if any player is a load test bot — skips leaderboard writes
  startTime?: number;
  countdownStart?: number;
  /** games.id row for this race; undefined until created / when stats skipped. */
  dbGameId?: number;
  /**
   * Attempts completed while createGameSession is still in flight.
   * Present only during that window; flushed (or dropped) when it resolves.
   */
  pendingAttempts?: PendingTaskAttempt[];
}

// Client → Server Events
export interface ClientToServerEvents {
  'room:create': (data: {
    playerName: string;
    roomId?: string;
    isPublic?: boolean;
  }) => void;
  'room:join': (data: { roomId: string; playerName: string }) => void;
  'room:join_matched': (data: { roomId: string; playerName: string }) => void;
  'room:quick_match': (data: { playerName: string }) => void;
  'room:leave': () => void;
  'player:ready_to_play': () => void;
  'player:editorText': (data: { text: string }) => void;
  'player:task_complete': (data: { offset?: number; text?: string }) => void;
}

// Server → Client Events
export interface ServerToClientEvents {
  'room:created': (data: { roomId: string; player: Player }) => void;
  'room:joined': (data: { roomId: string; players: Player[] }) => void;
  'room:player_joined': (data: { player: Player }) => void;
  'room:player_left': (data: { playerId: string }) => void;
  'room:player_ready': (data: { playerId: string }) => void;
  'room:reset': (data: { players: Player[] }) => void;
  'room:error': (data: { message: string }) => void;
  'game:countdown': (data: { seconds: number }) => void;
  'game:start': (data: {
    startTime: number;
    initialTask: Task | undefined;
    tasks: Task[];
    num_tasks: number;
  }) => void;
  'game:opponent_finished_task': (data: {
    playerId: string;
    taskProgress: number;
  }) => void;
  'game:player_finished_task': (data: {
    playerId: string;
    taskProgress: number;
  }) => void;
  'game:validation_failed': (playerId: string) => void;
  'game:player_finished': (data: {
    playerId: string;
    time: number;
    position: number;
  }) => void;
  'game:complete': (data: {
    rankings: Array<{
      playerId: string;
      playerName: string;
      time: number;
      position: number;
      ranks?: LeaderboardRanks | null;
    }>;
  }) => void;
}

// For Socket.IO typing (no inter-server events yet)
export type InterServerEvents = Record<string, never>;

export interface SocketData {
  playerId: string;
  playerName: string;
  roomId?: string;
  /** Authenticated user ID from Supabase JWT or ephemeral match token ID */
  userId?: string;
  /** Profile display_name resolved from the authenticated user — authoritative name for this socket */
  displayName?: string;
  /** The roomId from the match token — used to enforce token/room binding */
  matchedRoomId?: string;
  /** Client IP address for connection limiting */
  clientIp?: string;
  /** True if this connection is from a load test — skips leaderboard writes */
  isLoadTest?: boolean;
}
