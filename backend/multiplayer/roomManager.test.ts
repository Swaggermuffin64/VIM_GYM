/**
 * Lifecycle tests for RoomManager — room create/join/leave, waiting-room
 * timeout, and readiness state. DB and task-pool dependencies are mocked;
 * sockets are minimal fakes capturing emitted events.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../taskPool.js', () => ({
  pickTasksFromCache: vi.fn(() =>
    Array.from({ length: 10 }, (_, i) => ({
      id: `task-${i}`,
      type: 'navigate' as const,
      description: 'Move cursor to the highlighted character',
      codeSnippet: 'abc\ndef',
      targetPosition: { line: 2, col: 1 },
      targetOffset: 5,
    }))
  ),
}));

vi.mock('../db/stats.js', () => ({
  upsertTasksOnFirstUse: vi.fn(async () => undefined),
  createGameSession: vi.fn(async () => undefined),
  finishGameSession: vi.fn(async () => undefined),
  insertTaskAttempt: vi.fn(async () => undefined),
}));

vi.mock('../db/leaderboard.js', () => ({
  insertMultiplayerRaceLeaderboardRows: vi.fn(async () => undefined),
}));

import { RoomManager } from './roomManager.js';

type Emitted = { event: string; data: unknown };

/**
 * Minimal stand-in for a socket.io Socket: records emits, tracks joins,
 * and supports `socket.to(room).emit(...)` broadcasts used by joinRoom.
 */
function makeFakeSocket(id: string) {
  const emitted: Emitted[] = [];
  const broadcastEmitted: { room: string; event: string; data: unknown }[] = [];
  return {
    id,
    data: {} as Record<string, unknown>,
    emitted,
    broadcastEmitted,
    emit(event: string, data?: unknown) {
      emitted.push({ event, data });
    },
    join: vi.fn(),
    leave: vi.fn(),
    /** socket.to(room) returns a broadcaster that emits to everyone else in the room */
    to(room: string) {
      return {
        emit: (event: string, data?: unknown) => {
          broadcastEmitted.push({ room, event, data });
        },
      };
    },
    // Convenience for assertions
    lastEmit(event: string): Emitted | undefined {
      return [...emitted].reverse().find((e) => e.event === event);
    },
  };
}

/** Minimal stand-in for the socket.io Server: records room broadcasts. */
function makeFakeIo() {
  const broadcasts: { room: string; event: string; data: unknown }[] = [];
  return {
    broadcasts,
    to(room: string) {
      return {
        emit: (event: string, data?: unknown) => {
          broadcasts.push({ room, event, data });
        },
      };
    },
    in(room: string) {
      return this.to(room);
    },
    socketsLeave: vi.fn(),
  };
}

describe('RoomManager lifecycle', () => {
  let io: ReturnType<typeof makeFakeIo>;
  let manager: RoomManager;

  beforeEach(() => {
    vi.useFakeTimers();
    io = makeFakeIo();
    // Fake io implements only what RoomManager calls; the cast is the point
    // of the fake.
    manager = new RoomManager(io as never);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('creates a private room with the creator as sole player', async () => {
    const socket = makeFakeSocket('p1');
    const room = await manager.createRoom(socket as never, 'Alice');
    expect(room).not.toBeNull();
    expect(room!.state).toBe('waiting');
    expect(room!.isPublic).toBe(false);
    expect(room!.players.size).toBe(1);
    expect(room!.players.get('p1')!.name).toBe('Alice');
    expect(socket.join).toHaveBeenCalledWith(room!.id);
    expect(socket.lastEmit('room:created')).toBeDefined();
    // Tasks were loaded from the pool (10 + finished sentinel)
    expect(room!.tasks.length).toBe(11);
  });

  it('rejects creating a room whose external id already exists', async () => {
    const s1 = makeFakeSocket('p1');
    const s2 = makeFakeSocket('p2');
    await manager.createRoom(s1 as never, 'Alice', 'ROOM01');
    const dup = await manager.createRoom(s2 as never, 'Bob', 'ROOM01');
    expect(dup).toBeNull();
    expect(s2.lastEmit('room:error')).toBeDefined();
  });

  it('lets a second player join and broadcasts the join', async () => {
    const s1 = makeFakeSocket('p1');
    const s2 = makeFakeSocket('p2');
    const room = await manager.createRoom(s1 as never, 'Alice');
    const joined = manager.joinRoom(s2 as never, room!.id, 'Bob');
    expect(joined).not.toBeNull();
    expect(joined!.players.size).toBe(2);
    // joinRoom broadcasts via socket.to(roomId), not socket.emit or io.to
    expect(
      s2.broadcastEmitted.some(
        (b) => b.room === room!.id && b.event === 'room:player_joined'
      )
    ).toBe(true);
  });

  it('rejects joining a room that does not exist', () => {
    const socket = makeFakeSocket('p1');
    const result = manager.joinRoom(socket as never, 'NOPE99', 'Alice');
    expect(result).toBeNull();
    expect(socket.lastEmit('room:error')).toBeDefined();
  });

  it('rejects joining a full room', async () => {
    const s1 = makeFakeSocket('p1');
    const s2 = makeFakeSocket('p2');
    const s3 = makeFakeSocket('p3');
    const room = await manager.createRoom(s1 as never, 'Alice');
    manager.joinRoom(s2 as never, room!.id, 'Bob');
    const third = manager.joinRoom(s3 as never, room!.id, 'Carol');
    expect(third).toBeNull();
    expect(s3.lastEmit('room:error')).toBeDefined();
  });

  it('removes a leaving player and eventually the empty room', async () => {
    const s1 = makeFakeSocket('p1');
    const room = await manager.createRoom(s1 as never, 'Alice');
    const roomId = room!.id;
    manager.leaveRoom(s1 as never);
    // Room is either destroyed immediately or after its cleanup timer
    vi.runAllTimers();
    expect(manager.getRoom(roomId)).toBeUndefined();
  });

  it('destroys a private room that never starts within the waiting timeout', async () => {
    const s1 = makeFakeSocket('p1');
    const room = await manager.createRoom(s1 as never, 'Alice');
    const roomId = room!.id;
    expect(manager.getRoom(roomId)).toBeDefined();
    // Private waiting timeout is 5 minutes
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(manager.getRoom(roomId)).toBeUndefined();
    // destroyRoom emits room:error with inactivity message (not room:destroyed)
    expect(
      io.broadcasts.some((b) => b.room === roomId && b.event === 'room:error')
    ).toBe(true);
  });
});
