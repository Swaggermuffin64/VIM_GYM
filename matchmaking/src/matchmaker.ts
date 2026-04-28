import { WebSocket } from 'ws';
import { randomBytes } from 'crypto';
import { Mutex } from 'async-mutex';
import type { QueuedPlayer, ServerMessage, MatchResult } from './types.js';
import { signMatchToken } from './auth.js';

export class Matchmaker {
  private queue: Map<string, QueuedPlayer> = new Map();
  private mutex = new Mutex();
  private readonly gameServerUrl: string;
  private readonly playersPerMatch: number;
  private retryScheduled: boolean = false;
  private readonly retryDelayMs: number = 3000;

  constructor(options?: {
    playersPerMatch?: number;
    retryDelayMs?: number;
    gameServerUrl?: string;
  }) {
    this.gameServerUrl =
      options?.gameServerUrl ||
      process.env.GAME_SERVER_URL ||
      'http://localhost:3001';
    this.playersPerMatch = options?.playersPerMatch ?? 2;
    this.retryDelayMs = options?.retryDelayMs ?? 3000;
  }

  start() {
    console.log('🎮 Matchmaker started');
    console.log(`   Players per match: ${this.playersPerMatch}`);
    console.log(`   Game server: ${this.gameServerUrl}`);
  }

  stop() {
    console.log('🛑 Matchmaker stopped');
  }

  async addPlayer(player: QueuedPlayer): Promise<void> {
    const shouldTryMatch = await this.mutex.runExclusive(() => {
      this.queue.set(player.id, player);
      console.log(
        `Player "${player.name}" (${player.id}) joined queue (size: ${this.queue.size})`
      );
      return this.queue.size >= this.playersPerMatch;
    });

    if (shouldTryMatch) {
      this.tryMatch();
    }
  }

  async removePlayer(playerId: string): Promise<boolean> {
    return this.mutex.runExclusive(() => {
      const player = this.queue.get(playerId);
      if (player) {
        this.queue.delete(playerId);
        console.log(`Player "${player.name}" (${playerId}) left queue`);
        return true;
      }
      return false;
    });
  }

  async removePlayerBySocket(socket: WebSocket): Promise<boolean> {
    return this.mutex.runExclusive(() => {
      for (const [id, player] of this.queue) {
        if (player.socket === socket) {
          this.queue.delete(id);
          console.log(`Player "${player.name}" (${id}) left queue`);
          return true;
        }
      }
      return false;
    });
  }

  getQueueSize(): number {
    return this.queue.size;
  }

  private scheduleRetry(): void {
    if (this.retryScheduled) return;

    this.retryScheduled = true;
    console.log(
      `🔄 Scheduling retry in ${this.retryDelayMs}ms (queue size: ${this.queue.size})`
    );

    setTimeout(() => {
      this.retryScheduled = false;
      if (this.queue.size >= this.playersPerMatch) {
        console.log(`🔄 Retrying match for ${this.queue.size} queued players`);
        this.tryMatch();
      }
    }, this.retryDelayMs);
  }

  groupPlayers(): {
    roomGroups: QueuedPlayer[][];
    groupedPlayers: QueuedPlayer[];
  } {
    const roomGroups: QueuedPlayer[][] = [];
    let currentGroup: QueuedPlayer[] = [];
    const playerArray = Array.from(this.queue.values());
    for (let i = 0; i < this.queue.size; i++) {
      const currPlayer = playerArray[i];
      currentGroup.push(currPlayer);
      if (currentGroup.length === this.playersPerMatch) {
        roomGroups.push(currentGroup);
        currentGroup = [];
      }
    }

    // Only include leftover group if it has enough players
    if (currentGroup.length >= this.playersPerMatch) {
      roomGroups.push(currentGroup);
    }

    const groupedPlayers = roomGroups.flat();
    return {
      roomGroups,
      groupedPlayers,
    };
  }

  private async tryMatch() {
    const tryMatchStartTime = performance.now();

    const result = await this.mutex.runExclusive(() => {
      if (this.queue.size < this.playersPerMatch) {
        return null;
      }

      const { roomGroups, groupedPlayers } = this.groupPlayers();

      for (const player of groupedPlayers) {
        this.queue.delete(player.id);
      }

      return { roomGroups, groupedPlayers };
    });

    if (!result) {
      console.log('Failed to group players');
      return;
    }

    const { roomGroups, groupedPlayers } = result;
    if (!groupedPlayers) {
      return;
    }
    console.log(
      `🎯 Matching ${groupedPlayers.length} players:`,
      groupedPlayers.map((p) => p.name).join(', ')
    );
    console.log(
      `⏱️ [tryMatch] Grouped players (${(performance.now() - tryMatchStartTime).toFixed(0)}ms)`
    );

    try {
      const matchResults = roomGroups.map((roomGroup) =>
        this.assignRoom(roomGroup)
      );
      console.log(
        `⏱️ [tryMatch] All rooms assigned (${(performance.now() - tryMatchStartTime).toFixed(0)}ms for ${roomGroups.length} room(s))`
      );

      for (let i = 0; i < roomGroups.length; i++) {
        const roomGroup = roomGroups[i];
        const matchResult = matchResults[i];

        console.log(`✅ Match created: ${matchResult.roomId}`);

        for (const player of roomGroup) {
          const token = signMatchToken(player.id, matchResult.roomId);
          this.send(player.socket, {
            type: 'match:found',
            roomId: matchResult.roomId,
            connectionUrl: matchResult.connectionUrl,
            players: matchResult.players,
            ...(token ? { token } : {}),
          });
        }
      }

      console.log(
        `⏱️ [tryMatch] Complete (${(performance.now() - tryMatchStartTime).toFixed(0)}ms total)`
      );
    } catch (err: unknown) {
      console.error(
        '❌ Failed to create match:',
        err instanceof Error ? err.message : err
      );

      await this.mutex.runExclusive(() => {
        for (const player of groupedPlayers) {
          this.queue.set(player.id, player);
          this.send(player.socket, {
            type: 'error',
            message: 'Failed to create match, you have been re-queued',
          });
        }
      });

      this.scheduleRetry();
    }
  }

  private assignRoom(players: QueuedPlayer[]): MatchResult {
    const roomId = randomBytes(8).toString('hex');

    return {
      roomId,
      connectionUrl: this.gameServerUrl,
      players: players.map((p) => ({ id: p.id, name: p.name })),
    };
  }

  private send(socket: WebSocket, message: ServerMessage) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }
}
