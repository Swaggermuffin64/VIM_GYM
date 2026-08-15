/**
 * Tests for Matchmaker queue management and grouping.
 * Sockets are fakes with readyState OPEN capturing sent messages; a real
 * game server is never contacted because assignRoom only builds a payload.
 */
import { describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { Matchmaker } from './matchmaker.js';
import type { QueuedPlayer } from './types.js';

function makePlayer(
  id: string,
  name: string
): QueuedPlayer & {
  sent: unknown[];
} {
  const sent: unknown[] = [];
  const socket = {
    readyState: WebSocket.OPEN,
    send: (raw: string) => sent.push(JSON.parse(raw)),
  };
  return {
    id,
    name,
    socket: socket as never,
    queuedAt: Date.now(),
    sent,
  } as never;
}

describe('Matchmaker', () => {
  it('queues a single player without matching', async () => {
    const mm = new Matchmaker({
      playersPerMatch: 2,
      gameServerUrl: 'http://gs',
    });
    await mm.addPlayer(makePlayer('p1', 'Alice'));
    expect(mm.getQueueSize()).toBe(1);
  });

  it('removePlayer removes only the named player', async () => {
    const mm = new Matchmaker({
      playersPerMatch: 3,
      gameServerUrl: 'http://gs',
    });
    await mm.addPlayer(makePlayer('p1', 'Alice'));
    await mm.addPlayer(makePlayer('p2', 'Bob'));
    expect(await mm.removePlayer('p1')).toBe(true);
    expect(await mm.removePlayer('p1')).toBe(false);
    expect(mm.getQueueSize()).toBe(1);
  });

  it('groupPlayers drops a remainder smaller than playersPerMatch', async () => {
    // playersPerMatch 4 lets us queue 3 players without triggering a match
    const mm = new Matchmaker({
      playersPerMatch: 4,
      gameServerUrl: 'http://gs',
    });
    await mm.addPlayer(makePlayer('p1', 'A'));
    await mm.addPlayer(makePlayer('p2', 'B'));
    await mm.addPlayer(makePlayer('p3', 'C'));
    const { roomGroups, groupedPlayers } = mm.groupPlayers();
    expect(roomGroups).toHaveLength(0); // 3 < 4: no full group forms
    expect(groupedPlayers).toHaveLength(0);
  });

  it('matches two players and sends match:found to both', async () => {
    const mm = new Matchmaker({
      playersPerMatch: 2,
      gameServerUrl: 'http://gs',
    });
    const p1 = makePlayer('p1', 'Alice');
    const p2 = makePlayer('p2', 'Bob');
    await mm.addPlayer(p1);
    await mm.addPlayer(p2);

    // tryMatch runs fire-and-forget after addPlayer; wait for the sends.
    await vi.waitFor(() => {
      expect(p1.sent.length).toBeGreaterThan(0);
      expect(p2.sent.length).toBeGreaterThan(0);
    });

    const msg = p1.sent[0] as {
      type: string;
      roomId: string;
      connectionUrl: string;
      players: { id: string; name: string }[];
    };
    expect(msg.type).toBe('match:found');
    expect(msg.connectionUrl).toBe('http://gs');
    expect(msg.players.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    expect((p2.sent[0] as { roomId: string }).roomId).toBe(msg.roomId);
    expect(mm.getQueueSize()).toBe(0);
  });
});
