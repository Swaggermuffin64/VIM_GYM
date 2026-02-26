import React, { useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Vim, getCM } from '@replit/codemirror-vim';
import type { CodeMirrorV } from '@replit/codemirror-vim';
import { Transaction } from '@codemirror/state';

import { useGameSocket } from '../hooks/useGameSocket';
import type { KeystrokeEvent, TaskKeystrokeSubmission } from '../types/keystroke';
import { Lobby } from '../components/Lobby';
import { WaitingRoom } from '../components/WaitingRoom';
import { RaceCountdown } from '../components/RaceCountdown';
import { RaceResults } from '../components/RaceResults';
import { setTargetPosition, setTargetRange } from '../extensions/targetHighlight';
import { setDeleteMode, setAllowedDeleteRange, allowReset, setUndoBarrier } from '../extensions/readOnlyNavigation';
import { VimRaceEditor, VimRaceEditorHandle, editorColors as colors } from '../components/VimRaceEditor';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${colors.bgDark} 0%, #0f0f1a 100%)`,
  },
  raceContainer: {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    padding: '16px 24px',
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    borderRadius: '12px',
    border: `1px solid ${colors.border}`,
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
    textShadow: `0 0 20px ${colors.primaryGlow}`,
  },
  timer: {
    fontSize: '36px',
    fontWeight: 700,
    color: colors.warning,
    fontFamily: '"JetBrains Mono", monospace',
    textShadow: `0 0 20px ${colors.warning}40`,
    letterSpacing: '2px',
  },
  taskBanner: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.primary}40`,
    borderRadius: '12px',
    padding: '20px 28px',
    marginBottom: '24px',
    boxShadow: `0 0 30px ${colors.primaryGlow}, inset 0 1px 0 rgba(255,255,255,0.05)`,
  },
  taskType: {
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '2px',
    color: colors.primaryLight,
    marginBottom: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  taskDescription: {
    fontSize: '18px',
    fontWeight: 500,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
    lineHeight: 1.5,
  },
  editorsContainer: {
    display: 'flex',
    gap: '24px',
  },
  editorPanel: {
    flex: 1,
  },
  editorLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: colors.textSecondary,
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  editorWrapper: {
    borderRadius: '12px',
    overflow: 'hidden',
    border: `1px solid ${colors.border}`,
    boxShadow: `0 8px 32px rgba(0, 0, 0, 0.4), 0 0 1px ${colors.primary}40`,
  },
  finishedBadge: {
    background: `linear-gradient(135deg, ${colors.success} 0%, ${colors.successLight} 100%)`,
    color: colors.bgDark,
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    boxShadow: `0 0 12px ${colors.success}60`,
  },
  waitingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '350px',
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.success}40`,
    borderRadius: '12px',
    padding: '40px',
    boxShadow: `0 0 40px ${colors.success}20`,
  },
  waitingTitle: {
    fontSize: '28px',
    fontWeight: 700,
    color: colors.successLight,
    marginBottom: '16px',
    fontFamily: '"JetBrains Mono", monospace',
    textShadow: `0 0 20px ${colors.success}60`,
  },
  waitingText: {
    fontSize: '16px',
    color: colors.textMuted,
    fontFamily: '"JetBrains Mono", monospace',
  },
  waitingTime: {
    fontSize: '40px',
    fontWeight: 700,
    color: colors.success,
    marginTop: '20px',
    fontFamily: '"JetBrains Mono", monospace',
    textShadow: `0 0 30px ${colors.success}80`,
    letterSpacing: '2px',
  },
  opponentCursor: {
    position: 'relative' as const,
  },
  leaveButton: {
    padding: '10px 20px',
    fontSize: '14px',
    background: 'transparent',
    border: `1px solid ${colors.secondary}`,
    borderRadius: '8px',
    color: colors.secondary,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 600,
    transition: 'all 0.2s ease',
  },
  resetTaskButton: {
    padding: '8px 14px',
    fontSize: '12px',
    background: 'transparent',
    border: `1px solid ${colors.secondary}`,
    borderRadius: '8px',
    color: colors.secondary,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 600,
    marginLeft: 'auto',
  },
  scoreboard: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '20px',
    minWidth: '250px',
  },
  scoreboardTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: colors.textPrimary,
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    borderBottom: `1px solid ${colors.border}`,
    paddingBottom: '12px',
  },
  scoreboardPlayer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: `1px solid ${colors.border}30`,
    color: colors.textSecondary,
    fontSize: '14px',
    fontFamily: '"JetBrains Mono", monospace',
  },
};

const MultiplayerGame: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') as 'quick' | 'private' | null;

  const {
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
    clearResetFlag,
  } = useGameSocket();

  const editorRef = useRef<VimRaceEditorHandle>(null);
  const timerRef = useRef<number>(0);
  const [elapsedTime, setElapsedTime] = React.useState(0);
  const [editorReadyTick, setEditorReadyTick] = React.useState(0);

  // Stable refs for callbacks used in CodeMirror extensions
  const sendCursorMoveRef = useRef(sendCursorMove);
  const sendEditorTextRef = useRef(sendEditorText);
  useEffect(() => { sendCursorMoveRef.current = sendCursorMove; }, [sendCursorMove]);
  useEffect(() => { sendEditorTextRef.current = sendEditorText; }, [sendEditorText]);

  const me = gameState.players.find(p => p.id === gameState.myPlayerId);

  // Handle cursor movement (uses ref to always get latest sendCursorMove)
  const handleCursorChange = useCallback((offset: number) => {
    sendCursorMoveRef.current(offset);
  }, []);

  // Handle document changes (send new text to server for validation)
  const handleDocChange = useCallback((text: string) => {
    sendEditorTextRef.current(text);
  }, []);

  const keystrokeTaskIdRef = useRef<string | null>(null);
  const keystrokeTaskTypeRef = useRef<TaskKeystrokeSubmission['taskType']>('navigate');
  const keystrokeTaskStartedAtRef = useRef<number>(Date.now());
  const taskKeystrokesRef = useRef<KeystrokeEvent[]>([]);
  const submittedTaskIdsRef = useRef<Set<string>>(new Set());

  const submitTaskKeystrokes = useCallback(async (taskId: string, taskType: TaskKeystrokeSubmission['taskType']) => {
    if (submittedTaskIdsRef.current.has(taskId) || !gameState.myPlayerId) return;

    const payload: TaskKeystrokeSubmission = {
      source: 'multiplayer',
      taskId,
      taskType,
      startedAt: keystrokeTaskStartedAtRef.current,
      completedAt: Date.now(),
      roomId: gameState.roomId || undefined,
      playerId: gameState.myPlayerId,
      events: taskKeystrokesRef.current,
    };

    submittedTaskIdsRef.current.add(taskId);

    try {
      await fetch(`${API_BASE}/api/task/keystrokes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('Failed to submit multiplayer keystrokes:', error);
    }
  }, [gameState.myPlayerId, gameState.roomId]);

  const handleTaskKeyStroke = useCallback((event: KeystrokeEvent) => {
    if (gameState.roomState !== 'racing' || me?.isFinished || !keystrokeTaskIdRef.current) return;

    const dtMs = Math.max(0, Date.now() - keystrokeTaskStartedAtRef.current);
    taskKeystrokesRef.current.push({
      ...event,
      dtMs,
    });
  }, [gameState.roomState, me?.isFinished]);

  const resetCurrentTask = useCallback(() => {
    const view = editorRef.current?.view;
    if (!view || !gameState.task.id) return;

    editorRef.current?.resetUndoHistory();

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: gameState.task.codeSnippet,
      },
      effects: [allowReset.of(true), setUndoBarrier.of(true)],
      annotations: Transaction.addToHistory.of(false),
    });

    if (gameState.task.type === 'navigate') {
      view.dispatch({
        effects: [
          setTargetPosition.of(gameState.task.targetOffset),
          setDeleteMode.of(false),
          setAllowedDeleteRange.of(null),
        ],
      });
    } else if (gameState.task.type === 'delete') {
      view.dispatch({
        effects: [
          setTargetRange.of(gameState.task.targetRange),
          setDeleteMode.of(true),
          setAllowedDeleteRange.of(gameState.task.targetRange),
        ],
      });
    }

    const cm = getCM(view);
    if (cm?.state?.vim) {
      Vim.handleEx(cm as CodeMirrorV, 'nohlsearch');
    }

    view.focus();
  }, [gameState.task]);

  useEffect(() => {
    const handleResetHotkey = (e: KeyboardEvent) => {
      if (e.key !== 'F6') return;
      if (gameState.roomState !== 'racing' || me?.isFinished || !gameState.task.id) return;

      e.preventDefault();
      e.stopPropagation();
      resetCurrentTask();
    };

    window.addEventListener('keydown', handleResetHotkey, { capture: true });
    return () => window.removeEventListener('keydown', handleResetHotkey, { capture: true });
  }, [gameState.roomState, gameState.task.id, me?.isFinished, resetCurrentTask]);

  const handleEditorReady = useCallback(() => {
    currentTaskIdRef.current = null;
    keystrokeTaskIdRef.current = null;
    setEditorReadyTick((prev) => prev + 1);
  }, []);

  // Timer effect
  useEffect(() => {
    if (gameState.roomState === 'racing' && gameState.startTime) {
      const interval = setInterval(() => {
        setElapsedTime(Date.now() - gameState.startTime!);
      }, 100);
      timerRef.current = interval as unknown as number;
      return () => clearInterval(interval);
    } else {
      setElapsedTime(0);
    }
  }, [gameState.roomState, gameState.startTime]);

  // Track the current task ID to detect task transitions
  const currentTaskIdRef = useRef<string | null>(null);

  // Reset task tracking when not racing (between games)
  useEffect(() => {
    if (gameState.roomState !== 'racing') {
      currentTaskIdRef.current = null;
      keystrokeTaskIdRef.current = null;
      taskKeystrokesRef.current = [];
    }
    if (gameState.roomState === 'idle' || gameState.roomState === 'waiting') {
      submittedTaskIdsRef.current.clear();
    }
  }, [gameState.roomState]);

  // Keep keystroke collection aligned with task transitions.
  useEffect(() => {
    if (gameState.roomState !== 'racing' || !gameState.task.id) return;

    const activeTaskId = keystrokeTaskIdRef.current;
    if (!activeTaskId) {
      keystrokeTaskIdRef.current = gameState.task.id;
      keystrokeTaskTypeRef.current = gameState.task.type;
      keystrokeTaskStartedAtRef.current = Date.now();
      taskKeystrokesRef.current = [];
      return;
    }

    if (activeTaskId !== gameState.task.id) {
      void submitTaskKeystrokes(activeTaskId, keystrokeTaskTypeRef.current);
      keystrokeTaskIdRef.current = gameState.task.id;
      keystrokeTaskTypeRef.current = gameState.task.type;
      keystrokeTaskStartedAtRef.current = Date.now();
      taskKeystrokesRef.current = [];
    }
  }, [gameState.roomState, gameState.task.id, gameState.task.type, submitTaskKeystrokes]);

  // Set up task highlights (initial + transitions)
  useEffect(() => {
    const view = editorRef.current?.view;
    if (!view || !gameState.task.id) return;
    if (currentTaskIdRef.current === gameState.task.id) return;

    // Replace doc for every new task. allowReset bypasses readOnlyNavigation
    // so full-snippet swaps are always permitted.
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: gameState.task.codeSnippet,
      },
      effects: [allowReset.of(true), setUndoBarrier.of(true)],
      annotations: Transaction.addToHistory.of(false),
    });
    currentTaskIdRef.current = gameState.task.id;

    // Clear any active search highlighting from /, *, # between tasks.
    const cm = getCM(view);
    if (cm?.state?.vim) {
      Vim.handleEx(cm as CodeMirrorV, 'nohlsearch');
    }

    // Set up highlights based on task type
    if (gameState.task.type === 'navigate') {
      view.dispatch({
        effects: [
          setTargetPosition.of(gameState.task.targetOffset),
          setDeleteMode.of(false),
          setAllowedDeleteRange.of(null),
        ],
      });
    } else if (gameState.task.type === 'delete') {
      view.dispatch({
        effects: [
          setTargetRange.of(gameState.task.targetRange),
          setDeleteMode.of(true),
          setAllowedDeleteRange.of(gameState.task.targetRange),
        ],
      });
    }
    view.focus();
  }, [gameState.task, editorReadyTick]);

  // Handle validation failure — reset editor to original task text
  useEffect(() => {
    if (!gameState.shouldResetEditor || !gameState.task.id) return;
    const view = editorRef.current?.view;
    if (!view) return;

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: gameState.task.codeSnippet,
      },
      effects: [allowReset.of(true), setUndoBarrier.of(true)],
      annotations: Transaction.addToHistory.of(false),
    });

    if (gameState.task.type === 'navigate') {
      view.dispatch({
        effects: setTargetPosition.of(gameState.task.targetOffset),
      });
    } else if (gameState.task.type === 'delete') {
      view.dispatch({
        effects: setTargetRange.of(gameState.task.targetRange),
      });
    }

    clearResetFlag();
  }, [gameState.shouldResetEditor, gameState.task, clearResetFlag]);

  // In quick play, "Play Again" should leave the current room and re-queue
  const requeue = useCallback(() => {
    const playerName = me?.name;
    cancelQuickMatch();
    if (playerName) {
      quickMatch(playerName);
    }
  }, [me?.name, cancelQuickMatch, quickMatch]);

  // Format time display
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const tenths = Math.floor((ms % 1000) / 100);
    return `${seconds}.${tenths}s`;
  };

  // Render based on game state
  if (gameState.roomState === 'idle') {
    return (
      <div style={styles.container}>
        <Lobby
          isConnected={isConnected}
          isConnecting={isConnecting}
          initialMode={initialMode}
          error={error}
          queuePosition={queuePosition}
          onCreateRoom={createRoom}
          onJoinRoom={joinRoom}
          onQuickMatch={quickMatch}
          onCancelQuickMatch={cancelQuickMatch}
        />
      </div>
    );
  }

  if (gameState.roomState === 'waiting') {
    // In quick play, leaving should fully clean up the matchmaking state
    // and reset to idle so the player can re-queue from the lobby.
    const handleLeave = initialMode === 'quick' ? cancelQuickMatch : leaveRoom;

    return (
      <div style={styles.container}>
        <WaitingRoom
          roomId={gameState.roomId!}
          players={gameState.players}
          myPlayerId={gameState.myPlayerId}
          isQuickPlay={initialMode === 'quick'}
          onReady={readyToPlay}
          onLeave={handleLeave}
        />
      </div>
    );
  }

  // Racing or finished state
  return (
    <div style={styles.container}>
      {gameState.roomState === 'countdown' && gameState.countdown !== null && (
        <RaceCountdown seconds={gameState.countdown} />
      )}

      {gameState.roomState === 'finished' && gameState.rankings && (
        <RaceResults
          rankings={gameState.rankings}
          myPlayerId={gameState.myPlayerId}
          onPlayAgain={initialMode === 'quick' ? requeue : readyToPlay}
          onLeave={initialMode === 'quick' ? cancelQuickMatch : leaveRoom}
        />
      )}

      <div style={styles.raceContainer}>
        <div style={styles.header}>
          <div style={styles.title}>Vim Racing</div>
          <div style={styles.timer}>{formatTime(elapsedTime)}</div>
          <button style={styles.leaveButton} onClick={leaveRoom}>
            Leave
          </button>
        </div>

        {gameState.task.id && (
          <div style={styles.taskBanner}>
            <div style={styles.taskType}>
              {gameState.task.type === 'navigate' ? 'Navigate to target' : 'Delete the highlighted text'}
            </div>
            <div style={styles.taskDescription}>{gameState.task.description}</div>
          </div>
        )}

        <div style={styles.editorsContainer}>
          {/* My Editor */}
          <div style={styles.editorPanel}>
            <div style={styles.editorLabel}>
              You ({me?.name || 'Player'})
              {me?.isFinished && (
                <span style={styles.finishedBadge}>
                  {formatTime(me.finishTime || 0)}
                </span>
              )}
              {!me?.isFinished && gameState.task.id && (
                <button style={styles.resetTaskButton} onClick={resetCurrentTask}>
                  Reset (F6)
                </button>
              )}
            </div>
            {me?.isFinished ? (
              <div style={styles.waitingContainer}>
                <div style={styles.waitingTitle}>Finished!</div>
                <div style={styles.waitingText}>Waiting for other players...</div>
                <div style={styles.waitingTime}>{formatTime(me.finishTime || 0)}</div>
              </div>
            ) : (
              <div style={styles.editorWrapper}>
                {gameState.task.id && (
                  <VimRaceEditor
                    ref={editorRef}
                    initialDoc={gameState.task.codeSnippet}
                    onReady={handleEditorReady}
                    onCursorChange={handleCursorChange}
                    onDocChange={handleDocChange}
                    onKeyStroke={handleTaskKeyStroke}
                  />
                )}
              </div>
            )}
          </div>

          {/* Scoreboard */}
          <div style={styles.scoreboard}>
            <div style={styles.scoreboardTitle}>Scoreboard</div>
            {gameState.players.map(player => (
              <div
                key={player.id}
                style={{
                  ...styles.scoreboardPlayer,
                  color: player.id === gameState.myPlayerId ? colors.primaryLight : colors.textSecondary,
                }}
              >
                <span>
                  {player.name}
                  {player.leftRace && (
                    <span style={{ color: colors.textMuted }}>
                      {' '} (left)
                    </span>
                  )}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: colors.textMuted }}>
                    {player.leftRace && !player.isFinished
                      ? 'DNF'
                      : `${player.taskProgress ?? 0}/${gameState.num_tasks ? gameState.num_tasks : 1}`}
                  </span>
                  {player.isFinished && (
                    <span style={styles.finishedBadge}>
                      {formatTime(player.finishTime || 0)}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiplayerGame;
