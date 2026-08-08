import React, { useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Vim, getCM } from '@replit/codemirror-vim';
import type { CodeMirrorV } from '@replit/codemirror-vim';
import { Transaction } from '@codemirror/state';

import { useGameSocket } from '../hooks/useGameSocket';
import type { Task, TaskSummary } from '../types/task';
import type { Ranking } from '../types/multiplayer';
import type {
  KeystrokeEvent,
  TaskKeystrokeSubmission,
} from '../types/keystroke';
import {
  formatKeyLabel,
  buildKeySequence,
  buildOptimalInfo,
} from '../utils/keyFormatting';
import type { PlayerTaskAverages } from '../utils/taskSummaries';
import { useAuth } from '../contexts/AuthContext';
import { Lobby } from '../components/Lobby';
import { WaitingRoom } from '../components/WaitingRoom';
import { RaceCountdown } from '../components/RaceCountdown';
import { RaceResults } from '../components/RaceResults';
import { TaskReviewOverlay } from '../components/TaskReviewOverlay';
import {
  setTargetPosition,
  setTargetRange,
  setYankRange,
  setPasteMarker,
  setYankConfirmed,
} from '../extensions/targetHighlight';
import {
  allowReset,
  EditBlockReason,
  setAllowedDeleteRange,
  setDeleteMode,
  setYankPasteMode,
  setYankPasteConfirmed,
  setAllowedPasteOffset,
  setUndoBarrier,
} from '../extensions/readOnlyNavigation';
import {
  VimRaceEditor,
  VimRaceEditorHandle,
  editorColors as colors,
} from '../components/VimRaceEditor';

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
  taskProgressInlineRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '14px',
    color: colors.textSecondary,
    fontSize: '13px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  progressBar: {
    width: '100%',
    height: '8px',
    background: colors.bgCard,
    borderRadius: '4px',
    overflow: 'hidden',
    marginTop: '12px',
  },
  progressFill: {
    height: '100%',
    background: `linear-gradient(90deg, ${colors.primary}, ${colors.secondary})`,
    transition: 'width 0.3s ease',
    borderRadius: '4px',
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
  blockedEditHint: {
    marginTop: '10px',
    minHeight: '18px',
    fontSize: '12px',
    color: colors.warning,
    fontFamily: '"JetBrains Mono", monospace',
    lineHeight: 1.4,
  },
  editorButtonRow: {
    display: 'flex',
    gap: '10px',
    marginTop: '10px',
  },
  lineNumbersButton: {
    padding: '8px 14px',
    fontSize: '12px',
    background: 'transparent',
    border: `1px solid ${colors.primary}`,
    borderRadius: '8px',
    color: colors.primary,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 600,
    marginTop: '10px',
  },
};

const MultiplayerGame: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialMode = searchParams.get('mode') as 'quick' | 'private' | null;
  const { profile } = useAuth();

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
    sendEditorText,
    sendTaskComplete,
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
  const [playerAveragesById, setPlayerAveragesById] = React.useState<
    Record<string, PlayerTaskAverages>
  >({});
  const [blockedEditHint, setBlockedEditHint] = React.useState<string | null>(
    null
  );
  const [relativeLineNumbers, setRelativeLineNumbers] = React.useState(true);

  const taskSummariesRef = useRef<TaskSummary[]>([]);
  const currentTaskObjRef = useRef<Task | null>(null);
  const taskIndexCounterRef = useRef(0);
  const blockedHintTimerRef = useRef<number | null>(null);
  const yankConfirmedRef = useRef(false);
  const lastRegisterValueRef = useRef('');

  // Stable refs for callbacks used in CodeMirror extensions
  const sendEditorTextRef = useRef(sendEditorText);
  const sendTaskCompleteRef = useRef(sendTaskComplete);
  const currentTaskRef = useRef(gameState.task);
  useEffect(() => {
    sendEditorTextRef.current = sendEditorText;
  }, [sendEditorText]);
  useEffect(() => {
    sendTaskCompleteRef.current = sendTaskComplete;
  }, [sendTaskComplete]);
  useEffect(() => {
    currentTaskRef.current = gameState.task;
  }, [gameState.task]);

  const me = gameState.players.find((p) => p.id === gameState.myPlayerId);

  // Navigate task: detect completion client-side and notify server for verification.
  const handleCursorChange = useCallback((offset: number) => {
    const task = currentTaskRef.current;
    if (task.type === 'navigate' && offset === task.targetOffset) {
      sendTaskCompleteRef.current({ offset });
    }
  }, []);

  // Buffer-mutation tasks: stream text to keep server buffer current, and signal
  // completion separately when the text matches expectedResult.
  const handleDocChange = useCallback((text: string) => {
    const task = currentTaskRef.current;
    sendEditorTextRef.current(text);
    if (
      (task.type === 'delete' || task.type === 'yank_paste') &&
      ((task.type === 'yank_paste' && task.expectedResults.includes(text)) ||
        (task.type === 'delete' && text === task.expectedResult))
    ) {
      sendTaskCompleteRef.current({ text });
    }
  }, []);

  const getBlockedEditHint = useCallback((reason: EditBlockReason): string => {
    switch (reason) {
      case 'readOnlyTask':
        return 'This task is navigation-only; edits are disabled.';
      case 'insertNotAllowed':
        return 'Only deletions are allowed in this task.';
      case 'outsideAllowedRange':
        return 'Deletion blocked: command went outside the highlighted range.';
      case 'undoBarrier':
        return 'Undo is temporarily blocked right after reset.';
      case 'wrongPastePosition':
        return 'Wrong position — paste on the highlighted marker.';
      default:
        return 'Edit blocked by task constraints.';
    }
  }, []);

  const handleBlockedEdit = useCallback(
    (reason: EditBlockReason) => {
      setBlockedEditHint(getBlockedEditHint(reason));
      if (blockedHintTimerRef.current !== null) {
        window.clearTimeout(blockedHintTimerRef.current);
      }
      blockedHintTimerRef.current = window.setTimeout(() => {
        setBlockedEditHint(null);
        blockedHintTimerRef.current = null;
      }, 2400);
    },
    [getBlockedEditHint]
  );

  const keystrokeTaskIdRef = useRef<string | null>(null);
  const keystrokeTaskTypeRef =
    useRef<TaskKeystrokeSubmission['taskType']>('navigate');
  const keystrokeTaskStartedAtRef = useRef<number>(Date.now());
  const taskKeystrokesRef = useRef<KeystrokeEvent[]>([]);
  const submittedTaskIdsRef = useRef<Set<string>>(new Set());

  const submitTaskKeystrokes = useCallback(
    async (taskId: string, taskType: TaskKeystrokeSubmission['taskType']) => {
      if (submittedTaskIdsRef.current.has(taskId) || !gameState.myPlayerId)
        return;

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

      // gameId is intentionally omitted — the client does not know the
      // database game ID for multiplayer matches yet (follow-up item).
      const task = currentTaskObjRef.current;
      try {
        await fetch(`${API_BASE}/api/task/keystrokes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            ...(task?.contentHash ? { taskHash: task.contentHash } : {}),
          }),
        });
      } catch (error) {
        console.error('Failed to submit multiplayer keystrokes:', error);
      }
    },
    [gameState.myPlayerId, gameState.roomId]
  );

  const handleTaskKeyStroke = useCallback(
    (event: KeystrokeEvent) => {
      if (
        gameState.roomState !== 'racing' ||
        me?.isFinished ||
        !keystrokeTaskIdRef.current
      )
        return;

      const dtMs = Math.max(0, Date.now() - keystrokeTaskStartedAtRef.current);
      taskKeystrokesRef.current.push({
        ...event,
        dtMs,
      });
      const keyLabel = formatKeyLabel(event.key);
      if (keyLabel) {
        setRecentKeys((prev) => [...prev, keyLabel].slice(-40));
      }

      // Check vim register after each keystroke for yank_paste tasks
      if (!yankConfirmedRef.current) {
        requestAnimationFrame(() => {
          const task = currentTaskObjRef.current;
          if (!task || task.type !== 'yank_paste' || yankConfirmedRef.current)
            return;
          const regCtrl = Vim.getRegisterController();
          const yanked = regCtrl.unnamedRegister.toString();
          if (!yanked || yanked === lastRegisterValueRef.current) return;
          lastRegisterValueRef.current = yanked;
          if (yanked.replace(/\n$/, '') === task.yankedText) {
            yankConfirmedRef.current = true;
            const view = editorRef.current?.view;
            if (view) {
              view.dispatch({
                effects: [
                  setYankConfirmed.of(true),
                  setYankPasteConfirmed.of(true),
                  setAllowedPasteOffset.of(task.pasteOffset),
                  setPasteMarker.of(task.pasteOffset),
                ],
              });
            }
          } else if (yanked.length > 0) {
            setBlockedEditHint('Incorrect yank — yank the highlighted text.');
            if (blockedHintTimerRef.current !== null) {
              window.clearTimeout(blockedHintTimerRef.current);
            }
            blockedHintTimerRef.current = window.setTimeout(() => {
              setBlockedEditHint(null);
              blockedHintTimerRef.current = null;
            }, 2400);
          }
        });
      }
    },
    [gameState.roomState, me?.isFinished]
  );

  const resetCurrentTask = useCallback(() => {
    const view = editorRef.current?.view;
    if (!view || !gameState.task.id) return;

    editorRef.current?.resetUndoHistory();
    Vim.getRegisterController().unnamedRegister.clear();
    yankConfirmedRef.current = false;
    lastRegisterValueRef.current = '';

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: gameState.task.codeSnippet,
      },
      selection: { anchor: 0 },
      effects: [allowReset.of(true), setUndoBarrier.of(true)],
      annotations: Transaction.addToHistory.of(false),
    });

    if (gameState.task.type === 'navigate') {
      view.dispatch({
        effects: [
          setTargetPosition.of(gameState.task.targetOffset),
          setDeleteMode.of(false),
          setYankPasteMode.of(false),
          setAllowedDeleteRange.of(null),
        ],
      });
    } else if (gameState.task.type === 'delete') {
      view.dispatch({
        effects: [
          setTargetRange.of(gameState.task.targetRange),
          setDeleteMode.of(true),
          setYankPasteMode.of(false),
          setAllowedDeleteRange.of(gameState.task.targetRange),
        ],
      });
    } else if (gameState.task.type === 'yank_paste') {
      view.dispatch({
        effects: [
          setYankRange.of(gameState.task.yankRange),
          setPasteMarker.of(null),
          setDeleteMode.of(false),
          setYankPasteMode.of(true),
          setAllowedDeleteRange.of(null),
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
      if (
        gameState.roomState !== 'racing' ||
        me?.isFinished ||
        !gameState.task.id
      )
        return;

      e.preventDefault();
      e.stopPropagation();
      resetCurrentTask();
    };

    window.addEventListener('keydown', handleResetHotkey, { capture: true });
    return () =>
      window.removeEventListener('keydown', handleResetHotkey, {
        capture: true,
      });
  }, [
    gameState.roomState,
    gameState.task.id,
    me?.isFinished,
    resetCurrentTask,
  ]);

  const handleEditorReady = useCallback(() => {
    currentTaskIdRef.current = null;
    setEditorReadyTick((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (editorReadyTick === 0) return;
    editorRef.current?.setRelativeLineNumbers(relativeLineNumbers);
  }, [editorReadyTick, relativeLineNumbers]);

  useEffect(
    () => () => {
      if (blockedHintTimerRef.current !== null) {
        window.clearTimeout(blockedHintTimerRef.current);
      }
    },
    []
  );

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
        const { optimalSequence, ourSolutionKeyCount } =
          buildOptimalInfo(completedTask);
        const summary: TaskSummary = {
          taskIndex: taskIndexCounterRef.current,
          taskId: completedTask.id,
          taskType: completedTask.type,
          task: completedTask,
          durationMs: Math.max(
            0,
            completedAt - keystrokeTaskStartedAtRef.current
          ),
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
  }, [
    gameState.roomState,
    gameState.task.id,
    gameState.task.type,
    gameState.task,
    submitTaskKeystrokes,
  ]);

  // Capture any remaining last-task summary and flush the ref into state.
  const flushTaskSummaries = useCallback(() => {
    const completedTask = currentTaskObjRef.current;
    if (completedTask && completedTask.id) {
      const alreadyCaptured = taskSummariesRef.current.some(
        (s) => s.taskId === completedTask.id
      );
      if (!alreadyCaptured) {
        const eventsSnapshot = [...taskKeystrokesRef.current];
        const completedAt = Date.now();
        const { optimalSequence, ourSolutionKeyCount } =
          buildOptimalInfo(completedTask);
        const summary: TaskSummary = {
          taskIndex: taskIndexCounterRef.current,
          taskId: completedTask.id,
          taskType: completedTask.type,
          task: completedTask,
          durationMs: Math.max(
            0,
            completedAt - keystrokeTaskStartedAtRef.current
          ),
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
      .filter((p) => p.isFinished && p.finishTime)
      .sort((a, b) => (a.finishTime || 0) - (b.finishTime || 0))
      .map(
        (p, i): Ranking => ({
          playerId: p.id,
          playerName: p.name,
          time: p.finishTime || 0,
          position: i + 1,
        })
      );

    const unfinished = gameState.players
      .filter((p) => !p.isFinished)
      .map(
        (p, i): Ranking => ({
          playerId: p.id,
          playerName: p.name,
          time: 0,
          position: finished.length + i + 1,
        })
      );

    return [...finished, ...unfinished];
  }, [gameState.rankings, gameState.players, me?.isFinished]);

  const showResultsOverlay = !showTaskReview && displayRankings !== null;

  useEffect(() => {
    if (!gameState.roomId) return;
    if (!me?.isFinished && gameState.roomState !== 'finished') return;
    const matchToken = getMatchToken();

    let cancelled = false;
    const fetchPlayerAverages = async () => {
      try {
        const headers: HeadersInit = {};
        if (matchToken) {
          headers.Authorization = `Bearer ${matchToken}`;
        }
        const response = await fetch(
          `${API_BASE}/api/multiplayer/stats/${gameState.roomId}`,
          {
            headers,
          }
        );
        const payload = (await response.json()) as {
          success: boolean;
          players?: Array<{
            playerId: string;
            taskCount: number;
            keysPerSecond: number;
            avgDurationMs: number;
            avgKeys: number;
          }>;
        };
        if (!payload.success || !Array.isArray(payload.players) || cancelled)
          return;

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
  }, [
    gameState.roomId,
    gameState.roomState,
    gameState.players,
    me?.isFinished,
    getMatchToken,
  ]);

  const toggleRelativeLineNumbers = useCallback(() => {
    const newValue = !relativeLineNumbers;
    setRelativeLineNumbers(newValue);
    editorRef.current?.setRelativeLineNumbers(newValue);
  }, [relativeLineNumbers]);

  useEffect(() => {
    const handleLineNumbersHotkey = (e: KeyboardEvent) => {
      if (e.key !== 'F7') return;
      if (
        gameState.roomState !== 'racing' ||
        me?.isFinished ||
        !gameState.task.id
      )
        return;

      e.preventDefault();
      e.stopPropagation();
      toggleRelativeLineNumbers();
    };

    window.addEventListener('keydown', handleLineNumbersHotkey, {
      capture: true,
    });
    return () =>
      window.removeEventListener('keydown', handleLineNumbersHotkey, {
        capture: true,
      });
  }, [
    gameState.roomState,
    gameState.task.id,
    me?.isFinished,
    toggleRelativeLineNumbers,
  ]);

  const recentKeysDisplay = React.useMemo(() => {
    if (recentKeys.length === 0) return '';
    return recentKeys.slice(-KEY_LOG_VISIBLE_KEYS).join(' ');
  }, [recentKeys]);

  // Set up task highlights (initial + transitions)
  useEffect(() => {
    const view = editorRef.current?.view;
    if (!view || !gameState.task.id) return;
    if (currentTaskIdRef.current === gameState.task.id) return;
    setBlockedEditHint(null);
    yankConfirmedRef.current = false;
    lastRegisterValueRef.current = '';
    Vim.getRegisterController().unnamedRegister.clear();

    // Replace doc for every new task. allowReset bypasses readOnlyNavigation
    // so full-snippet swaps are always permitted.
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: gameState.task.codeSnippet,
      },
      selection: { anchor: 0 },
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
          setYankPasteMode.of(false),
          setAllowedDeleteRange.of(null),
        ],
      });
    } else if (gameState.task.type === 'delete') {
      view.dispatch({
        effects: [
          setTargetRange.of(gameState.task.targetRange),
          setDeleteMode.of(true),
          setYankPasteMode.of(false),
          setAllowedDeleteRange.of(gameState.task.targetRange),
        ],
      });
    } else if (gameState.task.type === 'yank_paste') {
      view.dispatch({
        effects: [
          setYankRange.of(gameState.task.yankRange),
          setPasteMarker.of(null),
          setDeleteMode.of(false),
          setYankPasteMode.of(true),
          setAllowedDeleteRange.of(null),
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

    // Reset yank state so re-yanking works after a validation failure
    yankConfirmedRef.current = false;
    lastRegisterValueRef.current = '';
    Vim.getRegisterController().unnamedRegister.clear();

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: gameState.task.codeSnippet,
      },
      selection: { anchor: 0 },
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
    } else if (gameState.task.type === 'yank_paste') {
      view.dispatch({
        effects: [
          setYankRange.of(gameState.task.yankRange),
          setPasteMarker.of(null),
          setYankPasteConfirmed.of(false),
          setAllowedPasteOffset.of(null),
        ],
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

  const myTaskProgress = me?.isFinished
    ? (gameState.num_tasks ?? 0)
    : (me?.taskProgress ?? 0);
  const taskCount = Math.max(1, gameState.num_tasks ?? 1);
  const taskProgressPercent = Math.min(100, (myTaskProgress / taskCount) * 100);

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
          relativeLineNumbersEnabled={relativeLineNumbers}
          onRelativeLineNumbersChange={setRelativeLineNumbers}
          playerName={profile?.display_name ?? ''}
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
          onReviewTasks={
            taskSummaries.length > 0 ? () => setShowTaskReview(true) : undefined
          }
        />
      )}

      {showTaskReview && taskSummaries.length > 0 && (
        <TaskReviewOverlay
          taskSummaries={taskSummaries}
          totalTime={raceFinishTime}
          onBack={() => setShowTaskReview(false)}
          onPracticeTasks={() => {
            const practiceTasks = taskSummaries.map((s) => s.task);
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
              {gameState.task.type === 'navigate'
                ? 'Navigate to target'
                : 'Delete the highlighted text'}
            </div>
            <div style={styles.taskDescription}>
              {gameState.task.description}
            </div>
            <div style={styles.taskProgressInlineRow}>
              <span>Tasks Completed</span>
              <span style={{ color: colors.primaryLight }}>
                {myTaskProgress}/{taskCount}
              </span>
            </div>
            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${taskProgressPercent}%`,
                }}
              />
            </div>
          </div>
        )}

        <div style={styles.editorsContainer}>
          {/* My Editor */}
          <div style={styles.editorPanel}>
            {me?.isFinished ? (
              <div style={styles.waitingContainer}>
                <div style={styles.waitingTitle}>Finished!</div>
                <div style={styles.waitingTime}>
                  {formatTime(me.finishTime || 0)}
                </div>
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
                    onBlockedEdit={handleBlockedEdit}
                    onKeyStroke={handleTaskKeyStroke}
                  />
                )}
              </div>
            )}
            {!me?.isFinished && gameState.task.id && (
              <div style={styles.editorButtonRow}>
                <button
                  style={styles.resetTaskButton}
                  onClick={resetCurrentTask}
                >
                  Reset (F6)
                </button>
                <button
                  style={styles.lineNumbersButton}
                  onClick={toggleRelativeLineNumbers}
                >
                  {relativeLineNumbers
                    ? 'Relative Lines (F7) ✓'
                    : 'Relative Lines (F7)'}
                </button>
              </div>
            )}
          </div>

          <div style={styles.rightColumn}>
            {/* Scoreboard */}
            <div style={styles.scoreboard}>
              <div style={styles.scoreboardTitle}>Scoreboard</div>
              {gameState.players.map((player) => (
                <div
                  key={player.id}
                  style={{
                    ...styles.scoreboardPlayer,
                    color:
                      player.id === gameState.myPlayerId
                        ? colors.primaryLight
                        : colors.textSecondary,
                  }}
                >
                  <span>
                    {player.name}
                    {player.leftRace && (
                      <span style={{ color: colors.textMuted }}> (left)</span>
                    )}
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
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
                {recentKeys.length > 0 ? (
                  recentKeysDisplay
                ) : (
                  <span style={styles.keyLogEmpty}>No keys yet...</span>
                )}
              </div>
              <div style={styles.blockedEditHint}>
                {blockedEditHint ?? '\u00A0'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiplayerGame;
