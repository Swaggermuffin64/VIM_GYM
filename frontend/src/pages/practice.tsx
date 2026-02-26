import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Vim, getCM } from '@replit/codemirror-vim';
import type { CodeMirrorV } from '@replit/codemirror-vim';
import { Transaction } from '@codemirror/state';

import { Task } from '../types/task';
import type { KeystrokeEvent, TaskKeystrokeSubmission } from '../types/keystroke';
import { setTargetPosition, setTargetRange } from '../extensions/targetHighlight';
import { setDeleteMode, setAllowedDeleteRange, allowReset, setUndoBarrier } from '../extensions/readOnlyNavigation';
import { VimRaceEditor, VimRaceEditorHandle, editorColors as colors } from '../components/VimRaceEditor';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

interface TaskSummary {
  taskIndex: number;
  taskId: string;
  taskType: Task['type'];
  durationMs: number;
  keyCount: number;
  keySequence: string;
  codePreview: string;
  highlightFrom: number | null;
  highlightTo: number | null;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${colors.bgDark} 0%, #0f0f1a 100%)`,
  },
  raceContainer: {
    padding: '24px',
    maxWidth: '1200px',
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
  exitButton: {
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
  taskBanner: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.primary}40`,
    borderRadius: '12px',
    padding: '20px 28px',
    marginBottom: '24px',
    boxShadow: `0 0 30px ${colors.primaryGlow}, inset 0 1px 0 rgba(255,255,255,0.05)`,
  },
  taskBannerComplete: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.success}60`,
    borderRadius: '12px',
    padding: '20px 28px',
    marginBottom: '24px',
    boxShadow: `0 0 30px ${colors.success}30, inset 0 1px 0 rgba(255,255,255,0.05)`,
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
  taskHint: {
    fontSize: '13px',
    color: colors.textMuted,
    marginTop: '12px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  mainContent: {
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
  sidebar: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '20px',
  },
  sidebarColumn: {
    minWidth: '280px',
  },
  sidebarControls: {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
  },
  keyLogContainer: {
    marginTop: '16px',
    borderTop: `1px solid ${colors.border}`,
    paddingTop: '14px',
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
    minHeight: '64px',
    maxHeight: '120px',
    overflowY: 'auto' as const,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    background: colors.bgCard,
    padding: '8px',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '12px',
    color: colors.textSecondary,
    lineHeight: 1.5,
  },
  keyLogEmpty: {
    color: colors.textMuted,
  },
  sidebarTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: colors.textPrimary,
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    borderBottom: `1px solid ${colors.border}`,
    paddingBottom: '12px',
  },
  progressRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: `1px solid ${colors.border}30`,
    color: colors.textSecondary,
    fontSize: '14px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  progressBar: {
    width: '100%',
    height: '8px',
    background: colors.bgCard,
    borderRadius: '4px',
    overflow: 'hidden',
    marginTop: '16px',
  },
  progressFill: {
    height: '100%',
    background: `linear-gradient(90deg, ${colors.primary}, ${colors.secondary})`,
    transition: 'width 0.3s ease',
    borderRadius: '4px',
  },
  toggleButton: {
    width: '90%',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: colors.textPrimary,
    background: `${colors.primary}20`,
    border: `1px solid ${colors.primary}60`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
    marginTop: '12px',
  },
  restartButton: {
    width: '90%',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: colors.textPrimary,
    background: `${colors.primary}20`,
    border: `1px solid ${colors.primary}60`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    marginTop: '12px',
    transition: 'all 0.2s ease',
  },
  resetTaskButton: {
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: 600,
    color: colors.secondary,
    background: 'transparent',
    border: `1px solid ${colors.secondary}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
    marginLeft: 'auto',
  },
  sessionComplete: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 'calc(100vh - 180px)',
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.success}40`,
    borderRadius: '12px',
    padding: '40px',
    boxShadow: `0 0 40px ${colors.success}20`,
  },
  completeTitle: {
    fontSize: '32px',
    fontWeight: 700,
    color: colors.successLight,
    marginBottom: '16px',
    fontFamily: '"JetBrains Mono", monospace',
    textShadow: `0 0 20px ${colors.success}60`,
  },
  completeText: {
    fontSize: '16px',
    color: colors.textMuted,
    fontFamily: '"JetBrains Mono", monospace',
    marginBottom: '8px',
  },
  completeTime: {
    fontSize: '48px',
    fontWeight: 700,
    color: colors.success,
    marginTop: '20px',
    fontFamily: '"JetBrains Mono", monospace',
    textShadow: `0 0 30px ${colors.success}80`,
    letterSpacing: '2px',
  },
  completeButtons: {
    display: 'flex',
    gap: '16px',
    marginTop: '32px',
  },
  completeButton: {
    padding: '14px 32px',
    fontSize: '16px',
    fontWeight: 600,
    color: colors.bgDark,
    background: `linear-gradient(135deg, ${colors.success} 0%, ${colors.successLight} 100%)`,
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    boxShadow: `0 0 20px ${colors.success}60`,
  },
  summaryList: {
    width: '50%',
    marginTop: '24px',
    borderTop: `1px solid ${colors.border}`,
    paddingTop: '16px',
  },
  summaryItem: {
    border: `1px solid ${colors.border}`,
    background: colors.bgCard,
    borderRadius: '10px',
    padding: '12px',
    marginBottom: '12px',
  },
  summaryItemHeader: {
    display: 'block',
    fontFamily: '"JetBrains Mono", monospace',
    marginBottom: '6px',
    color: colors.textPrimary,
    fontSize: '16px',
    fontWeight: 600,
  },
  summaryTaskType: {
    color: colors.primaryLight,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '14px',
    marginBottom: '8px',
  },
  summaryMeta: {
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '14px',
    marginBottom: '6px',
  },
  summaryKeys: {
    color: colors.textMuted,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '14px',
    lineHeight: 1.4,
  },
  summaryCodeLabel: {
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '14px',
    marginTop: '8px',
    marginBottom: '6px',
  },
  summaryCodeBox: {
    background: '#0a0a0f',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    overflow: 'hidden',
  },
  summaryCodeRow: {
    display: 'flex',
    alignItems: 'stretch',
  },
  summaryCodeLineNo: {
    width: '36px',
    color: colors.textMuted,
    background: '#12121a',
    borderRight: `1px solid ${colors.border}`,
    padding: '2px 6px',
    textAlign: 'right' as const,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    userSelect: 'none' as const,
  },
  summaryCodeLineText: {
    flex: 1,
    color: colors.textPrimary,
    padding: '2px 8px',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    lineHeight: 1.4,
    whiteSpace: 'pre' as const,
    overflow: 'hidden',
  },
  summaryHighlightNavigate: {
    backgroundColor: 'rgba(6, 182, 212, 0.35)',
    outline: '1px solid #06b6d4',
  },
  summaryHighlightDelete: {
    backgroundColor: 'rgba(236, 72, 153, 0.35)',
    outline: '1px solid #ec4899',
  },
  homeButton: {
    padding: '14px 32px',
    fontSize: '16px',
    fontWeight: 600,
    color: colors.textSecondary,
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
  nextTaskHint: {
    fontSize: '14px',
    color: colors.successLight,
    marginTop: '16px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  // Ready screen styles
  readyWrapper: {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${colors.bgDark} 0%, #0f0f1a 100%)`,
    display: 'flex',
    flexDirection: 'column' as const,
    position: 'relative' as const,
    overflow: 'hidden',
  },
  topBanner: {
    width: '100%',
    padding: '16px 32px',
    background: '#000000',
    flexShrink: 0,
    position: 'relative' as const,
    zIndex: 2,
  },
  topBannerTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
    margin: 0,
  },
  readyMainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
  },
  bgGlow1: {
    position: 'absolute' as const,
    top: '10%',
    left: '10%',
    width: '500px',
    height: '500px',
    background: `radial-gradient(circle, ${colors.primaryGlow} 0%, transparent 70%)`,
    filter: 'blur(80px)',
    pointerEvents: 'none' as const,
  },
  bgGlow2: {
    position: 'absolute' as const,
    bottom: '10%',
    right: '10%',
    width: '500px',
    height: '500px',
    background: `radial-gradient(circle, rgba(236, 72, 153, 0.3) 0%, transparent 70%)`,
    filter: 'blur(80px)',
    pointerEvents: 'none' as const,
  },
  readyContainer: {
    maxWidth: '480px',
    margin: '0 auto',
    padding: '64px 32px',
    textAlign: 'center' as const,
    position: 'relative' as const,
    zIndex: 1,
  },
  readyTitle: {
    fontSize: '42px',
    fontWeight: 800,
    color: colors.textPrimary,
    marginBottom: '12px',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    letterSpacing: '-1px',
  },
  readySubtitle: {
    fontSize: '16px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
    marginBottom: '48px',
    lineHeight: 1.6,
  },
  readyCard: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '16px',
    padding: '28px',
    marginBottom: '24px',
  },
  readyCardTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: colors.textMuted,
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1.5px',
  },
  readyInfo: {
    fontSize: '14px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
    lineHeight: 1.8,
  },
  readyButton: {
    width: '100%',
    padding: '16px 24px',
    fontSize: '16px',
    fontWeight: 600,
    color: colors.bgDark,
    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
    letterSpacing: '0.5px',
    boxShadow: `0 0 20px ${colors.primaryGlow}`,
    marginBottom: '12px',
  },
  backButton: {
    width: '100%',
    padding: '14px 24px',
    fontSize: '14px',
    fontWeight: 500,
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    color: colors.textMuted,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
};

const PracticeEditor: React.FC = () => {
  const navigate = useNavigate();
  const editorRef = useRef<VimRaceEditorHandle>(null);
  const timerRef = useRef<number>(0);

  // Practice session state
  const [isReady, setIsReady] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskProgress, setTaskProgress] = useState(0);
  const [numTasks, setNumTasks] = useState(0);
  const [isTaskComplete, setIsTaskComplete] = useState(false);
  const [isSessionComplete, setIsSessionComplete] = useState(false);
  const [relativeLineNumbers, setRelativeLineNumbers] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [finalTime, setFinalTime] = useState(0);
  const [editorReadyTick, setEditorReadyTick] = useState(0);
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  const [taskSummaries, setTaskSummaries] = useState<TaskSummary[]>([]);

  // Current task derived from state
  const currentTask = tasks[taskProgress] || null;

  // Use refs to avoid stale closures
  const tasksRef = useRef<Task[]>([]);
  const taskProgressRef = useRef(0);
  const isTaskCompleteRef = useRef(false);
  const currentTaskIdRef = useRef<string | null>(null);
  const taskStartedAtRef = useRef<number>(Date.now());
  const taskKeystrokesRef = useRef<KeystrokeEvent[]>([]);
  const submittedTaskIdsRef = useRef<Set<string>>(new Set());

  // Keep refs in sync with state
  useEffect(() => {
    tasksRef.current = tasks;
    taskProgressRef.current = taskProgress;
    isTaskCompleteRef.current = isTaskComplete;
  }, [tasks, taskProgress, isTaskComplete]);

  // Timer effect
  useEffect(() => {
    if (sessionStartTime && !isSessionComplete) {
      const interval = setInterval(() => {
        setElapsedTime(Date.now() - sessionStartTime);
      }, 100);
      timerRef.current = interval as unknown as number;
      return () => clearInterval(interval);
    }
  }, [sessionStartTime, isSessionComplete]);

  // Format time display
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const tenths = Math.floor((ms % 1000) / 100);
    return `${seconds}.${tenths}s`;
  };

  const formatKeyLabel = useCallback((key: string): string => {
    if (key === ' ') return 'Space';
    if (key === 'Escape') return 'Esc';
    if (key === 'ArrowLeft') return 'Left';
    if (key === 'ArrowRight') return 'Right';
    if (key === 'ArrowUp') return 'Up';
    if (key === 'ArrowDown') return 'Down';
    if (key === 'Control') return 'Ctrl';
    if (key === 'Meta') return 'Meta';
    if (key === 'Alt') return 'Alt';
    if (key === 'Shift') return 'Shift';
    return key;
  }, []);

  const formatTaskTypeLabel = useCallback((taskType: Task['type']): string => {
    if (taskType === 'navigate') return 'Navigate';
    if (taskType === 'delete') return 'Delete';
    if (taskType === 'insert') return 'Insert';
    return 'Change';
  }, []);

  const getTaskHighlightRange = useCallback((task: Task): { from: number | null; to: number | null } => {
    if (task.type === 'navigate') {
      return { from: task.targetOffset, to: task.targetOffset + 1 };
    }
    if (task.type === 'delete') {
      return { from: task.targetRange.from, to: task.targetRange.to };
    }
    return { from: null, to: null };
  }, []);

  const submitTaskKeystrokes = useCallback(async (
    task: Task,
    snapshot?: { startedAt: number; completedAt: number; events: KeystrokeEvent[] }
  ) => {
    if (submittedTaskIdsRef.current.has(task.id)) return;

    const startedAt = snapshot?.startedAt ?? taskStartedAtRef.current;
    const completedAt = snapshot?.completedAt ?? Date.now();
    const events = snapshot?.events ?? taskKeystrokesRef.current;

    const payload: TaskKeystrokeSubmission = {
      source: 'practice',
      taskId: task.id,
      taskType: task.type,
      startedAt,
      completedAt,
      events,
    };

    submittedTaskIdsRef.current.add(task.id);

    try {
      await fetch(`${API_BASE}/api/task/keystrokes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('Failed to submit task keystrokes:', error);
    }
  }, []);

  const handleTaskKeyStroke = useCallback((event: KeystrokeEvent) => {
    const currentTaskId = currentTaskIdRef.current;
    if (!currentTaskId || isTaskCompleteRef.current || isSessionComplete) return;

    const dtMs = Math.max(0, Date.now() - taskStartedAtRef.current);
    taskKeystrokesRef.current.push({
      ...event,
      dtMs,
    });
    const keyLabel = formatKeyLabel(event.key);
    setRecentKeys((prev) => [...prev, keyLabel].slice(-40));
  }, [formatKeyLabel, isSessionComplete]);

  // Start practice session when user clicks Ready
  const handleReady = useCallback(() => {
    setIsReady(true);
  }, []);

  // Setup a task in the editor (replace doc + configure highlights)
  const setupTaskInEditor = useCallback((task: Task) => {
    const view = editorRef.current?.view;
    if (!view) return;

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: task.codeSnippet,
      },
      effects: [allowReset.of(true), setUndoBarrier.of(true)],
      annotations: Transaction.addToHistory.of(false),
    });

    // Reset search highlights between tasks so `/`, `*`, and `#`
    // don't carry visual state into the next snippet.
    const cm = getCM(view);
    if (cm?.state?.vim) {
      Vim.handleEx(cm as CodeMirrorV, 'nohlsearch');
    }

    currentTaskIdRef.current = task.id;
    taskStartedAtRef.current = Date.now();
    taskKeystrokesRef.current = [];
    setRecentKeys([]);

    if (task.type === 'navigate') {
      view.dispatch({
        effects: [
          setTargetPosition.of(task.targetOffset),
          setDeleteMode.of(false),
          setAllowedDeleteRange.of(null),
        ],
      });
    } else if (task.type === 'delete') {
      view.dispatch({
        effects: [
          setTargetRange.of(task.targetRange),
          setDeleteMode.of(true),
          setAllowedDeleteRange.of(task.targetRange),
        ],
      });
    }
  }, []);

  // Fetch a new practice session (state only — task setup handled by effect)
  const fetchPracticeSession = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/task/practice`);
      const data = await response.json();

      setTasks(data.tasks);
      setNumTasks(data.numTasks);
      setTaskProgress(0);
      setIsTaskComplete(false);
      isTaskCompleteRef.current = false;
      setIsSessionComplete(false);
      setSessionStartTime(Date.now());
      setElapsedTime(0);
      setFinalTime(0);
      currentTaskIdRef.current = null;
      taskKeystrokesRef.current = [];
      submittedTaskIdsRef.current.clear();
      setRecentKeys([]);
      setTaskSummaries([]);
    } catch (error) {
      console.error('Failed to fetch practice session:', error);
    }
  }, []);

  // Trigger initial fetch when user clicks Ready
  useEffect(() => {
    if (isReady) {
      fetchPracticeSession();
    }
  }, [isReady, fetchPracticeSession]);

  // Set up the first task when tasks are loaded (or reloaded on restart)
  useEffect(() => {
    if (tasks.length === 0 || taskProgress !== 0) return;
    setupTaskInEditor(tasks[0]);
    editorRef.current?.view?.focus();
  }, [tasks, taskProgress, setupTaskInEditor, editorReadyTick]);

  // Advance to next task
  const advanceToNextTask = useCallback(() => {
    const nextProgress = taskProgressRef.current + 1;

    if (nextProgress >= tasksRef.current.length) {
      setIsSessionComplete(true);
      setFinalTime(elapsedTime);
      const view = editorRef.current?.view;
      if (view) {
        view.dispatch({
          effects: [
            setTargetPosition.of(null),
            setDeleteMode.of(false),
          ],
        });
      }
      return;
    }

    setTaskProgress(nextProgress);
    setIsTaskComplete(false);
    isTaskCompleteRef.current = false;

    const nextTask = tasksRef.current[nextProgress];
    if (nextTask) {
      setupTaskInEditor(nextTask);
      editorRef.current?.view?.focus();
    }
  }, [setupTaskInEditor, elapsedTime]);

  // Handle task completion
  const handleTaskComplete = useCallback(() => {
    isTaskCompleteRef.current = true; // Set ref synchronously before blur
    setIsTaskComplete(true);

    const completedTask = tasksRef.current[taskProgressRef.current];
    if (completedTask) {
      const startedAt = taskStartedAtRef.current;
      const completedAt = Date.now();
      const eventsSnapshot = [...taskKeystrokesRef.current];
      const keyLabels = eventsSnapshot.map((event) => formatKeyLabel(event.key));
      const visibleKeyCount = 30;
      const keySequence = keyLabels.length <= visibleKeyCount
        ? keyLabels.join(' ')
        : `${keyLabels.slice(0, visibleKeyCount).join(' ')} ... (+${keyLabels.length - visibleKeyCount})`;
      const highlight = getTaskHighlightRange(completedTask);

      setTaskSummaries((prev) => [
        ...prev,
        {
          taskIndex: taskProgressRef.current + 1,
          taskId: completedTask.id,
          taskType: completedTask.type,
          durationMs: Math.max(0, completedAt - startedAt),
          keyCount: eventsSnapshot.length,
          keySequence,
          codePreview: completedTask.codeSnippet,
          highlightFrom: highlight.from,
          highlightTo: highlight.to,
        },
      ]);

      void submitTaskKeystrokes(completedTask, {
        startedAt,
        completedAt,
        events: eventsSnapshot,
      });
    }

    const view = editorRef.current?.view;
    if (view) {
      view.dispatch({
        effects: [
          setTargetPosition.of(null),
          setDeleteMode.of(false),
        ],
      });
      view.contentDOM.blur();
    }
  }, [formatKeyLabel, getTaskHighlightRange, submitTaskKeystrokes]);

  // Listen for Enter key to advance when task is complete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTaskComplete && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        advanceToNextTask();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isTaskComplete, advanceToNextTask]);

  // Toggle relative line numbers
  const toggleRelativeLineNumbers = useCallback(() => {
    const newValue = !relativeLineNumbers;
    setRelativeLineNumbers(newValue);
    editorRef.current?.setRelativeLineNumbers(newValue);
  }, [relativeLineNumbers]);

  const resetCurrentTask = useCallback(() => {
    const current = tasksRef.current[taskProgressRef.current];
    if (!current) return;

    isTaskCompleteRef.current = false;
    setIsTaskComplete(false);
    editorRef.current?.resetUndoHistory();
    setupTaskInEditor(current);
    editorRef.current?.view?.focus();
  }, [setupTaskInEditor]);

  useEffect(() => {
    const handleResetHotkey = (e: KeyboardEvent) => {
      if (e.key !== 'F6') return;
      if (!isReady || isSessionComplete || !currentTask) return;

      e.preventDefault();
      e.stopPropagation();
      resetCurrentTask();
    };

    window.addEventListener('keydown', handleResetHotkey, { capture: true });
    return () => window.removeEventListener('keydown', handleResetHotkey, { capture: true });
  }, [isReady, isSessionComplete, currentTask, resetCurrentTask]);

  // Handle cursor position changes (for navigate tasks)
  const handleCursorChange = useCallback((offset: number) => {
    const currentTasks = tasksRef.current;
    const progress = taskProgressRef.current;
    const completed = isTaskCompleteRef.current;

    const task = currentTasks[progress];
    if (task && task.type === 'navigate' && !completed) {
      if (offset === task.targetOffset) {
        handleTaskComplete();
      }
    }
  }, [handleTaskComplete]);

  // Handle editor text changes (for delete tasks)
  const handleEditorChange = useCallback((newText: string) => {
    const currentTasks = tasksRef.current;
    const progress = taskProgressRef.current;
    const completed = isTaskCompleteRef.current;

    const task = currentTasks[progress];
    if (task && task.type === 'delete' && !completed) {
      if (newText === task.expectedResult) {
        handleTaskComplete();
      }
    }
  }, [handleTaskComplete]);

  const handleEditorReady = useCallback(() => {
    setEditorReadyTick((prev) => prev + 1);
  }, []);

  // Progress percentage
  const progressPercent = numTasks > 0 ? ((taskProgress + (isTaskComplete ? 1 : 0)) / numTasks) * 100 : 0;

  // Task type display
  const getTaskTypeDisplay = (task: Task | null) => {
    if (!task) return { label: 'Loading...' };
    if (task.type === 'navigate') return { label: 'Navigate to target' };
    return { label: 'Delete the highlighted text' };
  };

  const taskDisplay = getTaskTypeDisplay(currentTask);

  const renderSummarySnippet = useCallback((summary: TaskSummary): React.ReactNode => {
    const lines = summary.codePreview.split('\n');
    const lineStarts: number[] = [];
    let cursor = 0;
    for (let i = 0; i < lines.length; i++) {
      lineStarts.push(cursor);
      cursor += lines[i]!.length + 1;
    }

    const highlightFrom = summary.highlightFrom;
    const highlightTo = summary.highlightTo;
    const hasHighlight = highlightFrom !== null && highlightTo !== null && highlightTo > highlightFrom;

    let focusLine = 0;
    if (hasHighlight) {
      for (let i = 0; i < lines.length; i++) {
        const lineStart = lineStarts[i]!;
        const lineEnd = lineStart + lines[i]!.length;
        if (highlightFrom >= lineStart && highlightFrom <= lineEnd) {
          focusLine = i;
          break;
        }
      }
    }

    const previewLineLimit = 8;
    const startLine = Math.max(0, focusLine - Math.floor(previewLineLimit / 2));
    const endLine = Math.min(lines.length, startLine + previewLineLimit);
    const highlightStyle = summary.taskType === 'delete' ? styles.summaryHighlightDelete : styles.summaryHighlightNavigate;

    return (
      <>
        {lines.slice(startLine, endLine).map((line, idx) => {
          const lineIndex = startLine + idx;
          const lineStart = lineStarts[lineIndex]!;
          const lineEnd = lineStart + line.length;

          if (!hasHighlight) {
            return (
              <div key={`line-${lineIndex}`} style={styles.summaryCodeRow}>
                <div style={styles.summaryCodeLineNo}>{lineIndex + 1}</div>
                <div style={styles.summaryCodeLineText}>{line || ' '}</div>
              </div>
            );
          }

          const overlapStart = Math.max(highlightFrom, lineStart);
          const overlapEnd = Math.min(highlightTo, lineEnd);
          const hasLineOverlap = overlapEnd > overlapStart;

          if (!hasLineOverlap) {
            return (
              <div key={`line-${lineIndex}`} style={styles.summaryCodeRow}>
                <div style={styles.summaryCodeLineNo}>{lineIndex + 1}</div>
                <div style={styles.summaryCodeLineText}>{line || ' '}</div>
              </div>
            );
          }

          const localStart = overlapStart - lineStart;
          const localEnd = overlapEnd - lineStart;
          const before = line.slice(0, localStart);
          const marked = line.slice(localStart, localEnd) || ' ';
          const after = line.slice(localEnd);

          return (
            <div key={`line-${lineIndex}`} style={styles.summaryCodeRow}>
              <div style={styles.summaryCodeLineNo}>{lineIndex + 1}</div>
              <div style={styles.summaryCodeLineText}>
                {before}
                <span style={highlightStyle}>{marked}</span>
                {after}
              </div>
            </div>
          );
        })}
      </>
    );
  }, []);

  // Ready screen before practice starts
  if (!isReady) {
    return (
      <div style={styles.readyWrapper}>
        <div style={styles.topBanner}>
          <div style={styles.topBannerTitle}>VIM_GYM</div>
        </div>
        <div style={styles.readyMainContent}>
          <div style={styles.bgGlow1} />
          <div style={styles.bgGlow2} />
          <div style={styles.readyContainer}>
            <h1 style={styles.readyTitle}>Practice Mode</h1>
            <p style={styles.readySubtitle}>
              Hone your Vim skills with navigation and deletion challenges.
            </p>

            <div style={styles.readyCard}>
              <div style={styles.readyCardTitle}>What to expect</div>
              <div style={styles.readyInfo}>
                Navigate to highlighted targets using Vim motions<br />
                Delete highlighted text using Vim commands<br />
                Complete all tasks as fast as you can
              </div>
            </div>

            <button style={styles.readyButton} onClick={handleReady}>
              Ready
            </button>
            <button style={styles.backButton} onClick={() => navigate('/')}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.raceContainer}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.title}>Vim Racing - Practice</div>
          <div style={styles.timer}>{formatTime(isSessionComplete ? finalTime : elapsedTime)}</div>
          <button style={styles.exitButton} onClick={() => navigate('/')}>
            Exit
          </button>
        </div>

        {isSessionComplete ? (
          <div style={styles.sessionComplete}>
            <div style={styles.completeTitle}>Practice Summary</div>
            <div style={styles.completeText}>Completed {numTasks} tasks</div>
            <div style={styles.completeTime}>{formatTime(finalTime)}</div>
            <div style={styles.completeButtons}>
              <button style={styles.completeButton} onClick={fetchPracticeSession}>
                Restart
              </button>
              <button style={styles.homeButton} onClick={() => navigate('/')}>
                Home
              </button>
            </div>
            <div style={styles.summaryList}>
              {taskSummaries.length === 0 && (
                <div style={styles.summaryKeys}>No task details recorded for this run.</div>
              )}
              {taskSummaries.map((summary) => {
                const speed = summary.durationMs > 0
                  ? (summary.keyCount / (summary.durationMs / 1000)).toFixed(2)
                  : '0.00';
                return (
                  <div key={summary.taskId} style={styles.summaryItem}>
                    <div style={styles.summaryItemHeader}>
                      Task {summary.taskIndex}
                    </div>
                    <div style={styles.summaryTaskType}>
                      Type: {formatTaskTypeLabel(summary.taskType)}
                    </div>
                    <div style={styles.summaryMeta}>
                      Speed: {speed} keys/s
                    </div>
                    <div style={styles.summaryMeta}>
                      Duration: {formatTime(summary.durationMs)}
                    </div>
                    <div style={styles.summaryMeta}>
                      Key Events: {summary.keyCount}
                    </div>
                    <div style={styles.summaryKeys}>
                      Keys: {summary.keySequence || 'No key events recorded'}
                    </div>
                    <div style={styles.summaryCodeLabel}>Snippet</div>
                    <div style={styles.summaryCodeBox}>
                      {renderSummarySnippet(summary)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            {/* Task Banner */}
            <div style={isTaskComplete ? styles.taskBannerComplete : styles.taskBanner}>
              <div style={{
                ...styles.taskType,
                color: isTaskComplete ? colors.successLight : colors.primaryLight,
              }}>
                {isTaskComplete ? 'Complete!' : taskDisplay.label}
                <span style={{ color: colors.textMuted, marginLeft: '8px' }}>
                  ({taskProgress + 1}/{numTasks})
                </span>
              </div>
              <div style={styles.taskDescription}>
                {currentTask?.description || 'Loading task...'}
              </div>
              {!isTaskComplete && currentTask?.type === 'navigate' && (
                <div style={styles.taskHint}>
                  Use vim motions: <code>gg</code> <code>G</code> <code>w</code> <code>b</code> <code>f</code> <code>$</code> <code>0</code>
                </div>
              )}
              {!isTaskComplete && currentTask?.type === 'delete' && (
                <div style={styles.taskHint}>
                  Use vim delete: <code>dw</code> <code>dd</code> <code>d$</code> <code>di{'{'}</code> <code>da(</code>
                </div>
              )}
              {isTaskComplete && (
                <div style={styles.nextTaskHint}>
                  Press Enter for next task
                </div>
              )}
            </div>

            {/* Main Content */}
            <div style={styles.mainContent}>
              {/* Editor */}
              <div style={styles.editorPanel}>
                <div style={styles.editorLabel}>
                  Editor
                  {currentTask && (
                    <button
                      style={styles.resetTaskButton}
                      onClick={resetCurrentTask}
                    >
                      Reset (F6)
                    </button>
                  )}
                </div>
                <div style={styles.editorWrapper}>
                  <VimRaceEditor
                    ref={editorRef}
                    initialDoc="// Loading practice session..."
                    onReady={handleEditorReady}
                    onCursorChange={handleCursorChange}
                    onDocChange={handleEditorChange}
                    onKeyStroke={handleTaskKeyStroke}
                    shouldAllowBlur={() => isTaskCompleteRef.current}
                  />
                </div>
              </div>

              {/* Sidebar */}
              <div style={styles.sidebarColumn}>
                <div style={styles.sidebar}>
                  <div style={styles.sidebarTitle}>Progress</div>

                  <div style={styles.progressRow}>
                    <span>Tasks Completed</span>
                    <span style={{ color: colors.primaryLight }}>
                      {taskProgress + (isTaskComplete ? 1 : 0)}/{numTasks}
                    </span>
                  </div>

                  <div style={styles.progressRow}>
                    <span>Time</span>
                    <span style={{ color: colors.warning }}>
                      {formatTime(elapsedTime)}
                    </span>
                  </div>

                  <div style={styles.progressBar}>
                    <div style={{ ...styles.progressFill, width: `${progressPercent}%` }} />
                  </div>

                  <div style={styles.keyLogContainer}>
                    <div style={styles.keyLogTitle}>Keys Pressed (Current Task)</div>
                    <div style={styles.keyLogBox}>
                      {recentKeys.length > 0
                        ? recentKeys.join(' ')
                        : <span style={styles.keyLogEmpty}>No keys yet...</span>}
                    </div>
                  </div>
                </div>

                <div style={styles.sidebarControls}>
                  <button
                    style={styles.toggleButton}
                    onClick={toggleRelativeLineNumbers}
                  >
                    {relativeLineNumbers ? '[x] ' : '[ ] '}Relative Line Numbers
                  </button>

                  <button style={styles.restartButton} onClick={fetchPracticeSession}>
                    Restart Session
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PracticeEditor;
