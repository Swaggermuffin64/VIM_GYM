import type { WebSocket } from 'ws';

export interface QueuedPlayer {
  id: string;
  name: string;
  socket: WebSocket;
  queuedAt: number;
}

export interface MatchResult {
  roomId: string;
  connectionUrl: string;
  players: Array<{ id: string; name: string }>;
}

// Messages from client to server
export type ClientMessage =
  | { type: 'queue:join'; playerName: string; token?: string }
  | { type: 'queue:leave' }
  | { type: 'ping' };

// Messages from server to client
export type ServerMessage =
  | { type: 'queue:joined'; playerId: string }
  | { type: 'queue:left' }
  | {
      type: 'match:found';
      roomId: string;
      connectionUrl: string;
      players: Array<{ id: string; name: string }>;
      token?: string;
    }
  | { type: 'error'; message: string }
  | { type: 'pong' };
