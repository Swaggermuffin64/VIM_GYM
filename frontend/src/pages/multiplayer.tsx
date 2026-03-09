import React, { useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Vim, getCM } from '@replit/codemirror-vim';
import type { CodeMirrorV } from '@replit/codemirror-vim';
import { Transaction } from '@codemirror/state';

import { useGameSocket } from '../hooks/useGameSocket';
import type { Task, TaskSummary } from '../types/task';
import type { Ranking } from '../types/multiplayer';
import type { KeystrokeEvent, TaskKeystrokeSubmission } from '../types/keystroke';
import { formatKeyLabel, buildKeySequence, buildOptimalInfo } from '../utils/keyFormatting';
import type { PlayerTaskAverages } from '../utils/taskSummaries';
import { Lobby } from '../components/Lobby';
import { WaitingRoom } from '../components/WaitingRoom';
import { RaceCountdown } from '../components/RaceCountdown';
import { RaceResults } from '../components/RaceResults';
import { TaskReviewOverlay } from '../components/TaskReviewOverlay';
import { setTargetPosition, setTargetRange } from '../extensions/targetHighlight';
import { setDeleteMode, setAllowedDeleteRange, allowReset, setUndoBarrier } from '../extensions/readOnlyNavigation';
import { VimRaceEditor, VimRaceEditorHandle, editorColors as colors } from '../components/VimRaceEditor';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const KEY_LOG_VISIBLE_KEYS = 5;

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
    marginTop: '10px',
  },
  scoreboard: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '20px',
    width: '250px',
    minWidth: '250px',
    maxWidth: '250px',
    boxSizing: 'border-box' as const,
  },
  rightColumn: {
    width: '250px',
    minWidth: '250px',
    maxWidth: '250px',
    flex: '0 0 250px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '14px',
    boxSizing: 'border-box' as const,
    overflow: 'hidden' as const,
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
  keyLogContainer: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '14px',
    width: '250px',
    minWidth: '250px',
    maxWidth: '250px',
    boxSizing: 'border-box' as const,
    overflow: 'hidden' as const,
  },
  keyLogTitle: {
    fontSize: '12px',
    color: colors.textMuted,
    fontFamily: '"JetBrains Mono", monospace',
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
    marginBottom: '10px',
  },
  keyLogBox: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box' as const,
    minHeight: '48px',
    maxHeight: '48px',
    overflowY: 'hidden' as const,
    overflowX: 'hidden' as const,
    // Single-line key log, anchored to the right so newest keys stay visible.
    whiteSpace: 'nowrap' as const,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    background: colors.bgCard,
    padding: '8px 12px 8px 8px',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '24px',
    fontWeight: 700,
    color: '#ffffff',
    lineHeight: 1.4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyLogBoxEmpty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center' as const,
  },
  keyLogEmpty: {
    color: colors.textMuted,
    fontSize: '14px',
  },
};

const MultiplayerGame: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
    getMatchToken,
  } = useGameSocket();

  const editorRef = useRef<VimRaceEditorHandle>(null);
  const timerRef = useRef<number>(0);
  const [elapsedTime, setElapsedTime] = React.useState(0);
  const [editorReadyTick, setEditorReadyTick] = React.useState(0);
  const [recentKeys, setRecentKeys] = React.useState<string[]>([]);
  const [showTaskReview, setShowTaskReview] = React.useState(false);
  const [taskSummaries, setTaskSummaries] = React.useState<TaskSummary[]>([]);
  const [raceFinishTime, setRaceFinishTime] = React.useState(0);
  const [playerAveragesById, setPlayerAveragesById] = React.useState<Record<string, PlayerTaskAverages>>({});

  const taskSummariesRef = useRef<TaskSummary[]>([]);
  const currentTaskObjRef = useRef<Task | null>(null);
  const taskIndexCounterRef = useRef(0);

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
    const keyLabel = formatKeyLabel(event.key);
    if (keyLabel) {
      setRecentKeys((prev) => [...prev, keyLabel].slice(-40));
    }
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
      setRecentKeys([]);
    }
    if (gameState.roomState === 'idle' || gameState.roomState === 'waiting') {
      submittedTaskIdsRef.current.clear();
      taskSummariesRef.current = [];
      currentTaskObjRef.current = null;
      taskIndexCounterRef.current = 0;
      setTaskSummaries([]);
      setShowTaskReview(false);
      setPlayerAveragesById({});
    }
  }, [gameState.roomState]);

  // Keep keystroke collection aligned with task transitions.
  // Also build task summaries for the review screen.
  useEffect(() => {
    if (gameState.roomState !== 'racing' || !gameState.task.id) return;

    const activeTaskId = keystrokeTaskIdRef.current;
    if (!activeTaskId) {
      keystrokeTaskIdRef.current = gameState.task.id;
      keystrokeTaskTypeRef.current = gameState.task.type;
      keystrokeTaskStartedAtRef.current = Date.now();
      taskKeystrokesRef.current = [];
      // Only initialize index once per race. If this branch runs again mid-race
      // (e.g. editor ready callback timing), do not rewind progress.
      if (!currentTaskObjRef.current || taskIndexCounterRef.current === 0) {
        currentTaskObjRef.current = gameState.task;
        taskIndexCounterRef.current = 1;
      } else {
        currentTaskObjRef.current = gameState.task;
      }
      setRecentKeys([]);
      return;
    }

    if (activeTaskId !== gameState.task.id) {
      const completedTask = currentTaskObjRef.current;
      if (completedTask && completedTask.id === activeTaskId) {
        const eventsSnapshot = [...taskKeystrokesRef.current];
        const completedAt = Date.now();
        const { optimalSequence, ourSolutionKeyCount } = buildOptimalInfo(completedTask);
        const summary: TaskSummary = {
          taskIndex: taskIndexCounterRef.current,
          taskId: completedTask.id,
          taskType: completedTask.type,
          task: completedTask,
          durationMs: Math.max(0, completedAt - keystrokeTaskStartedAtRef.current),
          keyCount: eventsSnapshot.length,
          keySequence: buildKeySequence(eventsSnapshot),
          optimalSequence,
          ourSolutionKeyCount,
        };
        taskSummariesRef.current = [...taskSummariesRef.current, summary];
        taskIndexCounterRef.current += 1;
      }

      void submitTaskKeystrokes(activeTaskId, keystrokeTaskTypeRef.current);
      keystrokeTaskIdRef.current = gameState.task.id;
      keystrokeTaskTypeRef.current = gameState.task.type;
      keystrokeTaskStartedAtRef.current = Date.now();
      taskKeystrokesRef.current = [];
      currentTaskObjRef.current = gameState.task;
      setRecentKeys([]);
    }
  }, [gameState.roomState, gameState.task.id, gameState.task.type, gameState.task, submitTaskKeystrokes]);

  // Capture any remaining last-task summary and flush the ref into state.
  const flushTaskSummaries = useCallback(() => {
    const completedTask = currentTaskObjRef.current;
    if (completedTask && completedTask.id) {
      const alreadyCaptured = taskSummariesRef.current.some(s => s.taskId === completedTask.id);
      if (!alreadyCaptured) {
        const eventsSnapshot = [...taskKeystrokesRef.current];
        const completedAt = Date.now();
        const { optimalSequence, ourSolutionKeyCount } = buildOptimalInfo(completedTask);
        const summary: TaskSummary = {
          taskIndex: taskIndexCounterRef.current,
          taskId: completedTask.id,
          taskType: completedTask.type,
          task: completedTask,
          durationMs: Math.max(0, completedAt - keystrokeTaskStartedAtRef.current),
          keyCount: eventsSnapshot.length,
          keySequence: buildKeySequence(eventsSnapshot),
          optimalSequence,
          ourSolutionKeyCount,
        };
        taskSummariesRef.current = [...taskSummariesRef.current, summary];
      }
    }
    setTaskSummaries([...taskSummariesRef.current]);
  }, []);

  // Flush summaries when the current player finishes (first finisher, while
  // still racing). This lets them review tasks while waiting for opponents.
  const earlyFlushDoneRef = useRef(false);
  useEffect(() => {
    if (!me?.isFinished) {
      earlyFlushDoneRef.current = false;
      return;
    }
    if (earlyFlushDoneRef.current) return;
    earlyFlushDoneRef.current = true;
    flushTaskSummaries();
    setRaceFinishTime(me.finishTime || elapsedTime);
  }, [me?.isFinished, me?.finishTime, elapsedTime, flushTaskSummaries]);

  // Also flush when roomState transitions to 'finished'. This covers the
  // last-place finisher, where game:player_finished and game:complete are
  // batched by React 18 so me?.isFinished is never observed as true.
  const finalFlushDoneRef = useRef(false);
  useEffect(() => {
    if (gameState.roomState !== 'finished') {
      finalFlushDoneRef.current = false;
      return;
    }
    if (finalFlushDoneRef.current) return;
    finalFlushDoneRef.current = true;
    flushTaskSummaries();
    setRaceFinishTime(me?.finishTime || elapsedTime);
  }, [gameState.roomState, me?.finishTime, elapsedTime, flushTaskSummaries]);

  // Build rankings to display. Use official rankings from game:complete when
  // available, otherwise construct interim rankings from player finish data.
  const displayRankings: Ranking[] | null = React.useMemo(() => {
    if (gameState.rankings) return gameState.rankings;
    if (!me?.isFinished) return null;

    const finished = gameState.players
      .filter(p => p.isFinished && p.finishTime)
      .sort((a, b) => (a.finishTime || 0) - (b.finishTime || 0))
      .map((p, i): Ranking => ({
        playerId: p.id,
        playerName: p.name,
        time: p.finishTime || 0,
        position: i + 1,
      }));

    const unfinished = gameState.players
      .filter(p => !p.isFinished)
      .map((p, i): Ranking => ({
        playerId: p.id,
        playerName: p.name,
        time: 0,
        position: finished.length + i + 1,
      }));

    return [...finished, ...unfinished];
  }, [gameState.rankings, gameState.players, me?.isFinished]);

  const showResultsOverlay = !showTaskReview && displayRankings !== null;

  useEffect(() => {
    if (initialMode !== 'quick') return;
    if (!gameState.roomId) return;
    if (!me?.isFinished && gameState.roomState !== 'finished') return;
    const matchToken = getMatchToken();
    if (!matchToken) return;

    let cancelled = false;
    const fetchPlayerAverages = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/multiplayer/stats/${gameState.roomId}`, {
          headers: {
            Authorization: `Bearer ${matchToken}`,
          },
        });
        const payload = await response.json() as {
          success: boolean;
          players?: Array<{
            playerId: string;
            taskCount: number;
            keysPerSecond: number;
            avgDurationMs: number;
            avgKeys: number;
          }>;
        };
        if (!payload.success || !Array.isArray(payload.players) || cancelled) return;

        const nextById: Record<string, PlayerTaskAverages> = {};
        for (const player of payload.players) {
          nextById[player.playerId] = {
            taskCount: player.taskCount,
            keysPerSecond: player.keysPerSecond,
            avgDurationMs: player.avgDurationMs,
            avgKeys: player.avgKeys,
          };
        }
        if (!cancelled) {
          setPlayerAveragesById(nextById);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch multiplayer player averages:', error);
        }
      }
    };

    void fetchPlayerAverages();
    return () => {
      cancelled = true;
    };
  }, [initialMode, gameState.roomId, gameState.roomState, gameState.players, me?.isFinished, getMatchToken]);

  const recentKeysDisplay = React.useMemo(() => {
    if (recentKeys.length === 0) return '';
    return recentKeys.slice(-KEY_LOG_VISIBLE_KEYS).join(' ');
  }, [recentKeys]);

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

      {showResultsOverlay && (
        <RaceResults
          rankings={displayRankings}
          myPlayerId={gameState.myPlayerId}
          raceComplete={gameState.roomState === 'finished'}
          playerAveragesById={playerAveragesById}
          onPlayAgain={initialMode === 'quick' ? requeue : readyToPlay}
          onLeave={initialMode === 'quick' ? cancelQuickMatch : leaveRoom}
          onReviewTasks={taskSummaries.length > 0 ? () => setShowTaskReview(true) : undefined}
        />
      )}

      {showTaskReview && taskSummaries.length > 0 && (
        <TaskReviewOverlay
          taskSummaries={taskSummaries}
          totalTime={raceFinishTime}
          onBack={() => setShowTaskReview(false)}
          onPracticeTasks={() => {
            const practiceTasks = taskSummaries.map(s => s.task);
            navigate('/practice', { state: { tasks: practiceTasks } });
          }}
          onPlayAgain={initialMode === 'quick' ? requeue : readyToPlay}
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
            {me?.isFinished ? (
              <div style={styles.waitingContainer}>
                <div style={styles.waitingTitle}>Finished!</div>
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
            {!me?.isFinished && gameState.task.id && (
              <button style={styles.resetTaskButton} onClick={resetCurrentTask}>
                Reset (F6)
              </button>
            )}
          </div>

          <div style={styles.rightColumn}>
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
            <div style={styles.keyLogContainer}>
              <div style={styles.keyLogTitle}>Keys Pressed (Current Task)</div>
              <div
                style={
                  recentKeys.length > 0
                    ? styles.keyLogBox
                    : { ...styles.keyLogBox, ...styles.keyLogBoxEmpty }
                }
              >
                {recentKeys.length > 0
                  ? recentKeysDisplay
                  : <span style={styles.keyLogEmpty}>No keys yet...</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiplayerGame;
