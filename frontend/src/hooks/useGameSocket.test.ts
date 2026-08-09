// @vitest-environment jsdom
//
// Regression tests for the socket-leak bug: connectSocket awaits
// supabase.auth.getSession() before creating the socket, so a socket created
// after the mount effect's cleanup already ran (StrictMode double-mount, fast
// navigation) was orphaned — connected forever with nothing tracking it.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const getSession = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
    },
  },
}));

interface FakeSocket {
  id: string;
  connected: boolean;
  on: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

const createdSockets: FakeSocket[] = [];

function makeFakeSocket(): FakeSocket {
  const socket: FakeSocket = {
    id: `socket-${createdSockets.length}`,
    connected: true,
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(() => {
      socket.connected = false;
    }),
  };
  return socket;
}

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    const socket = makeFakeSocket();
    createdSockets.push(socket);
    return socket;
  }),
}));

const { useGameSocket } = await import('./useGameSocket');

/** Minimal stand-in for the matchmaking WebSocket so tests can drive the
 * quick-match flow (queue → match:found) without a real server. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.onclose?.();
  }
}
vi.stubGlobal('WebSocket', FakeWebSocket);

/** Resolves getSession with a deferred promise we control, so the test can
 * unmount/remount while connectSocket is still awaiting the session. */
function deferSession() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  getSession.mockReturnValueOnce(promise);
  return () => resolve({ data: { session: null } });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  createdSockets.length = 0;
  FakeWebSocket.instances.length = 0;
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: null } });
});

describe('useGameSocket connection lifecycle', () => {
  it('disconnects a socket whose creation finished after unmount', async () => {
    const resolveSession = deferSession();

    const { unmount } = renderHook(() => useGameSocket());
    unmount(); // cleanup runs while connectSocket is still awaiting the session

    resolveSession();
    await flush();

    expect(createdSockets).toHaveLength(1);
    expect(createdSockets[0].disconnect).toHaveBeenCalled();
  });

  it('leaves exactly one live socket after a StrictMode-style remount', async () => {
    const resolveFirst = deferSession();

    const first = renderHook(() => useGameSocket());
    first.unmount();

    const resolveSecond = deferSession();
    const second = renderHook(() => useGameSocket());

    resolveFirst();
    resolveSecond();
    await flush();

    const liveSockets = createdSockets.filter((s) => s.connected);
    expect(liveSockets).toHaveLength(1);

    second.unmount();
    await flush();
    expect(createdSockets.filter((s) => s.connected)).toHaveLength(0);
  });

  it('joins the matched room on the new game socket after match:found', async () => {
    const { result } = renderHook(() => useGameSocket());
    await flush(); // initial connect to the persistent game server completes

    act(() => {
      result.current.quickMatch('stinkyhat');
    });
    const ws = FakeWebSocket.instances[0];
    act(() => {
      ws.onopen?.();
      ws.onmessage?.({
        data: JSON.stringify({
          type: 'match:found',
          connectionUrl: 'http://game-server',
          roomId: 'ROOM42',
          token: 'match-token',
        }),
      });
    });
    await flush(); // reconnect to the matched game server completes

    const gameSocket = createdSockets[createdSockets.length - 1];
    expect(gameSocket.connected).toBe(true);
    expect(gameSocket.emit).toHaveBeenCalledWith('room:join_matched', {
      roomId: 'ROOM42',
      playerName: 'stinkyhat',
    });
  });
});
