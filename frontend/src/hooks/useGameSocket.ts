import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameState } from '../types/multiplayer';
import { EMPTY_TASK } from '../types/multiplayer';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const MATCHMAKING_URL = import.meta.env.VITE_MATCHMAKING_URL || 'ws://localhost:3002';

interface UseGameSocketReturn {
  // State
  isConnected: boolean;
  isConnecting: boolean;
  gameState: GameState;
  error: string | null;
  queuePosition: number | null;
  
  // Actions
  createRoom: (playerName: string) => void;
  joinRoom: (roomId: string, playerName: string) => void;
  quickMatch: (playerName: string) => void;
  cancelQuickMatch: () => void;
  leaveRoom: () => void;
  readyToPlay: () => void;
  sendCursorMove: (offset: number) => void;
  sendEditorText: (text: string) => void;
  sendTaskComplete: () => void;
  clearResetFlag: () => void;
  getMatchToken: () => string | null;
}

const initialGameState: Omit<GameState, 'myPlayerId'> = {
  roomId: null,
  roomState: 'idle',
  players: [],
  task: EMPTY_TASK,
  taskQueue: [],
  num_tasks: 0,
  countdown: null,
  startTime: null,
  rankings: null,
  shouldResetEditor: false,
};

export function useGameSocket(): UseGameSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const matchmakingWsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>({ ...initialGameState, myPlayerId: null });
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  
  const pendingPlayerNameRef = useRef<string | null>(null);
  const quickMatchCancelledRef = useRef(false);
  const matchTokenRef = useRef<string | null>(null);

  // Setup socket event listeners
  const setupSocketListeners = useCallback((socket: Socket) => {
    socket.on('connect', () => {
      setIsConnected(true);
      setIsConnecting(false);
      setGameState(prev => ({
        ...prev,
        myPlayerId: socket.id || null,
      }));
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket.IO connect error:', err.message);
      setIsConnecting(false);
    });

    // Room events
    socket.on('room:created', ({ roomId, player }) => {
      setGameState(prev => ({
        ...prev,
        roomId,
        roomState: 'waiting',
        players: [player],
      }));
    });

    socket.on('room:joined', ({ roomId, players }) => {
      setGameState(prev => ({
        ...prev,
        roomId,
        roomState: 'waiting',
        players,
      }));
    });

    socket.on('room:player_joined', ({ player }) => {
      setGameState(prev => ({
        ...prev,
        players: [...prev.players, player],
      }));
    });

    socket.on('room:player_left', ({ playerId }) => {
      setGameState(prev => ({
        ...prev,
        players: (() => {
          const player = prev.players.find(p => p.id === playerId);
          if (!player) {
            return prev.players;
          }

          const keepOnScoreboard = prev.roomState === 'countdown' || prev.roomState === 'racing' || prev.roomState === 'finished';
          if (!keepOnScoreboard) {
            return prev.players.filter(p => p.id !== playerId);
          }

          return prev.players.map(p =>
            p.id === playerId ? { ...p, leftRace: true } : p
          );
        })(),
      }));
    });

    socket.on('room:player_ready', ({ playerId }) => {
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p =>
          p.id === playerId ? { ...p, readyToPlay: true } : p
        ),
      }));
    });

    socket.on('room:reset', ({ players }) => {
      setGameState(prev => ({
        ...prev,
        roomState: 'waiting',
        players,
        task: EMPTY_TASK,
        taskQueue: [],
        countdown: null,
        startTime: null,
        rankings: null,
        shouldResetEditor: false,
      }));
    });

    socket.on('room:error', ({ message }) => {
      console.error('Room error:', message);
      setError(message);
      setTimeout(() => setError(null), 3000);
    });

    // Game events
    socket.on('game:countdown', ({ seconds }) => {
      setGameState(prev => ({
        ...prev,
        roomState: 'countdown',
        countdown: seconds,
      }));
    });

    socket.on('game:start', ({ startTime, initialTask, tasks, num_tasks }) => {
      setGameState(prev => ({
        ...prev,
        roomState: 'racing',
        countdown: null,
        startTime,
        taskQueue: tasks,
        task: initialTask || tasks[0] || EMPTY_TASK,
        num_tasks,
      }));
    });

    socket.on('game:player_finished_task', ({ playerId, taskProgress }) => {
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p =>
          p.id === playerId ? { ...p, taskProgress: taskProgress } : p
        ),
        task: playerId === prev.myPlayerId
          ? (prev.taskQueue[taskProgress] || EMPTY_TASK)
          : prev.task,
      }));
    });

    socket.on('game:opponent_finished_task', ({ playerId, taskProgress }) => {
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p =>
          p.id === playerId ? { ...p, taskProgress: taskProgress } : p
        ),
      }));
    });

    socket.on('game:player_finished', ({ playerId, time }) => {
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p =>
          p.id === playerId ? { ...p, isFinished: true, finishTime: time } : p
        ),
        task: playerId === prev.myPlayerId ? EMPTY_TASK : prev.task,
      }));
    });

    socket.on('game:complete', ({ rankings }) => {
      setGameState(prev => ({
        ...prev,
        roomState: 'finished',
        rankings,
        players: prev.players.map(p => ({ ...p, cursorOffset: 0, taskProgress: 0, isFinished: false, leftRace: false, readyToPlay: false })),
      }));
    });

    socket.on('game:validation_failed', () => {
      setGameState(prev => ({
        ...prev,
        shouldResetEditor: true,
      }));
    });
  }, []);

  // Connect to game server, optionally with a match token for auth
  const connectSocket = useCallback((url: string, token?: string) => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    matchTokenRef.current = token || null;

    const socket = io(url, {
      transports: ['websocket', 'polling'],
      auth: token ? { token } : undefined,
    });

    socketRef.current = socket;
    setupSocketListeners(socket);
  }, [setupSocketListeners]);

  // Connect on mount to the persistent game server (no auth needed for private rooms)
  useEffect(() => {
    connectSocket(BACKEND_URL);
    return () => {
      socketRef.current?.disconnect();
    };
  }, [connectSocket]);

  // Connect to matchmaking service and join the game room when matched
  const connectToMatchedRoom = useCallback((connectionUrl: string, roomId: string, playerName: string, token?: string): boolean => {
    // For quick match, reconnect with the auth token
    connectSocket(connectionUrl, token);

    if (quickMatchCancelledRef.current) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return false;
    }

    socketRef.current?.emit('room:join_matched', { roomId, playerName });
    return true;
  }, [connectSocket]);

  // Actions
  const createRoom = useCallback((playerName: string) => {
    if (socketRef.current) {
      matchTokenRef.current = null;
      socketRef.current.emit('room:create', { playerName });
    }
  }, []);

  const joinRoom = useCallback((roomId: string, playerName: string) => {
    if (socketRef.current) {
      matchTokenRef.current = null;
      socketRef.current.emit('room:join', { roomId: roomId.toUpperCase(), playerName });
    }
  }, []);

  const quickMatch = useCallback((playerName: string) => {
    try {
      quickMatchCancelledRef.current = false;
      setIsConnecting(true);
      setError(null);
      setQueuePosition(null);
      pendingPlayerNameRef.current = playerName;

      if (matchmakingWsRef.current) {
        matchmakingWsRef.current.close();
      }

      const ws = new WebSocket(MATCHMAKING_URL);
      matchmakingWsRef.current = ws;

      ws.onopen = () => {
        if (quickMatchCancelledRef.current) { ws.close(); return; }
        ws.send(JSON.stringify({ type: 'queue:join', playerName }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case 'queue:joined':
              setQueuePosition(msg.position);
              break;

            case 'queue:position':
              setQueuePosition(msg.position);
              break;

            case 'queue:left':
              setQueuePosition(null);
              setIsConnecting(false);
              break;

            case 'match:found': {
              setQueuePosition(null);
              ws.close();
              matchmakingWsRef.current = null;

              if (quickMatchCancelledRef.current) break;
              
              connectToMatchedRoom(
                msg.connectionUrl, 
                msg.roomId, 
                pendingPlayerNameRef.current || playerName,
                msg.token,
              );
              break;
            }

            case 'error':
              console.error('Matchmaking error:', msg.message);
              setError(msg.message);
              break;
          }
        } catch (err) {
          console.error('Failed to parse matchmaking message:', err);
        }
      };

      ws.onclose = () => {
        matchmakingWsRef.current = null;
      };

      ws.onerror = () => {
        console.error('Matchmaking WebSocket error');
        setError('Failed to connect to matchmaking server');
        setIsConnecting(false);
        setQueuePosition(null);
      };

    } catch (err: any) {
      console.error('Quick match failed:', err);
      setError(`Quick match failed: ${err?.message || 'Unknown error'}`);
      setIsConnecting(false);
    }
  }, [connectToMatchedRoom]);

  const cancelQuickMatch = useCallback(() => {
    quickMatchCancelledRef.current = true;
    matchTokenRef.current = null;

    if (matchmakingWsRef.current) {
      try {
        matchmakingWsRef.current.send(JSON.stringify({ type: 'queue:leave' }));
      } catch {
        // WebSocket may already be closing
      }
      matchmakingWsRef.current.close();
      matchmakingWsRef.current = null;
    }

    if (socketRef.current?.connected) {
      socketRef.current.emit('room:leave');
    }

    setQueuePosition(null);
    setIsConnecting(false);
    setError(null);
    setGameState(prev => ({
      ...initialGameState,
      myPlayerId: prev.myPlayerId,
    }));
    pendingPlayerNameRef.current = null;
  }, []);

  const leaveRoom = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('room:leave');
      setGameState(prev => ({ ...initialGameState, myPlayerId: prev.myPlayerId }));
    }
    matchTokenRef.current = null;
  }, []);

  const readyToPlay = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('player:ready_to_play');
      setGameState(prev => ({ ...prev, roomState: 'waiting' }));
    }
  }, []);

  const sendCursorMove = useCallback((offset: number) => {
    if (socketRef.current && gameState.task.type === 'navigate' && gameState.roomState === 'racing') {
      socketRef.current.emit('player:cursor', { offset });
    }
  }, [gameState.roomState, gameState.task.type]);

  const sendEditorText = useCallback((text: string) => {
    if (socketRef.current && gameState.task.type === 'delete' && gameState.roomState === 'racing') {
      socketRef.current.emit('player:editorText', { text });
    }
  }, [gameState.roomState, gameState.task.type]);

  const sendTaskComplete = useCallback(() => {
    if (socketRef.current && gameState.roomState === 'racing') {
      socketRef.current.emit('player:task_complete');
    }
  }, [gameState.roomState]);

  const clearResetFlag = useCallback(() => {
    setGameState(prev => ({ ...prev, shouldResetEditor: false }));
  }, []);

  const getMatchToken = useCallback(() => matchTokenRef.current, []);

  // Cleanup matchmaking WebSocket on unmount
  useEffect(() => {
    return () => {
      if (matchmakingWsRef.current) {
        matchmakingWsRef.current.close();
      }
    };
  }, []);

  return {
    isConnected,
    isConnecting,
    gameState,
    error,
    queuePosition,
    createRoom,
    joinRoom,
    quickMatch,
    cancelQuickMatch,
    leaveRoom,
    readyToPlay,
    sendCursorMove,
    sendEditorText,
    sendTaskComplete,
    clearResetFlag,
    getMatchToken,
  };
}
