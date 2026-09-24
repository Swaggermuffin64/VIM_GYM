import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Vim, getCM } from '@replit/codemirror-vim';
import type { CodeMirrorV } from '@replit/codemirror-vim';
import { Transaction } from '@codemirror/state';

import type { PracticeSummary, Task, TaskSummary } from '../../types/task';
import { submitPracticeSession } from '../../api/leaderboard';
import type {
  RaceSessionConfig,
  RaceSessionData,
  RaceCompletionInfo,
} from '../../racing/raceSessionConfig';
import { submitTaskKeystrokes as postTaskKeystrokes } from '../../api/keystrokes';
import { useAuth } from '../../contexts/AuthContext';
import type {
  KeystrokeEvent,
  TaskKeystrokeSubmission,
} from '../../types/keystroke';
import {
  formatKeyLabel as sharedFormatKeyLabel,
  expandRecommendedSequence as sharedExpandRecommendedSequence,
  formatKeysForDisplay as sharedFormatKeysForDisplay,
  buildOptimalInfo,
} from '../../utils/keyFormatting';
import {
  setTargetPosition,
  setTargetRange,
  setYankRange,
  setPasteMarker,
  setYankConfirmed,
} from '../../extensions/targetHighlight';
import {
  allowReset,
  EditBlockReason,
  setAllowedDeleteRange,
  setDeleteMode,
  setYankPasteMode,
  setYankPasteConfirmed,
  setAllowedPasteResults,
  setUndoBarrier,
} from '../../extensions/readOnlyNavigation';
import {
  VimRaceEditor,
  VimRaceEditorHandle,
  editorColors as colors,
} from '../../components/VimRaceEditor';
import { SessionCompleteSummary } from '../../components/SessionCompleteSummary';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const KEY_LOG_VISIBLE_KEYS = 5;
const CHEATSHEET_DOCK_WIDTH = 'clamp(18rem, 22vw, 24rem)';
const CHEATSHEET_CONTAINER_SHIFT = 'clamp(2.375rem, 3.25vw, 3.5rem)';
const RACE_CONTAINER_LEFT_WITH_CHEATSHEET = `max(1.5rem, calc((100vw - 1200px) / 2 + ${CHEATSHEET_CONTAINER_SHIFT}))`;
const CHEATSHEET_DOCK_LEFT = `max(0.75rem, calc((${RACE_CONTAINER_LEFT_WITH_CHEATSHEET} - ${CHEATSHEET_DOCK_WIDTH}) / 2))`;
const CHEATSHEET_DOCK_GAP_PX = 24;
const ROOT_FONT_SIZE_PX = 16;

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const canDockCheatSheetForWidth = (viewportWidth: number): boolean => {
  const dockWidth = clamp(
    viewportWidth * 0.22,
    18 * ROOT_FONT_SIZE_PX,
    24 * ROOT_FONT_SIZE_PX
  );
  const containerShift = clamp(
    viewportWidth * 0.0325,
    2.375 * ROOT_FONT_SIZE_PX,
    3.5 * ROOT_FONT_SIZE_PX
  );
  const raceContainerLeft = Math.max(
    1.5 * ROOT_FONT_SIZE_PX,
    (viewportWidth - 1200) / 2 + containerShift
  );
  const dockLeft = Math.max(
    0.75 * ROOT_FONT_SIZE_PX,
    (raceContainerLeft - dockWidth) / 2
  );
  const dockRight = dockLeft + dockWidth;
  return dockRight + CHEATSHEET_DOCK_GAP_PX <= raceContainerLeft;
};

// TaskSummary imported from '../../types/task'

interface PracticeSessionResponse {
  tasks: Task[];
  numTasks: number;
  startTime: number;
  practiceSummary?: PracticeSummary;
  gameId: number | null;
}

const VIM_CHEATSHEET: Array<{
  title: string;
  items: Array<{ keys: string; description: string }>;
}> = [
  {
    title: 'Navigation',
    items: [
      { keys: 'h / j / k / l', description: 'Move left, down, up, right' },
      { keys: 'w / b / e', description: 'Jump by word start/back/end' },
      { keys: '0 / $', description: 'Go to line start/end' },
      { keys: 'f<char> / t<char>', description: 'Find a char on this line' },
      { keys: 'gg / G', description: 'Go to top / bottom of file' },
      { keys: '<count><motion>', description: 'Repeat motion (ex: 3j, 2w)' },
    ],
  },
  {
    title: 'Deletion',
    items: [
      { keys: 'x', description: 'Delete character under cursor' },
      {
        keys: 'dw / d<count>e',
        description: 'Delete word / multiple word-ends',
      },
      { keys: 'd$', description: 'Delete to end of line' },
      { keys: 'd%', description: 'Delete matching pair block' },
      { keys: 'di( di{ di[', description: 'Delete inside (), {}, []' },
      { keys: 'da( da{ da[', description: 'Delete around (), {}, []' },
      { keys: 'v ... d', description: 'Visual select then delete range' },
    ],
  },
];

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${colors.bgDark} 0%, #0f0f1a 100%)`,
  },
  // Same page shell, plus the containing block the results screen's ambient
  // glows are positioned against (and clipped by).
  summaryContainer: {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${colors.bgDark} 0%, #0f0f1a 100%)`,
    position: 'relative' as const,
    overflow: 'hidden' as const,
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
    padding: '12px 24px',
    fontSize: '15px',
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
    position: 'relative' as const,
  },
  taskBannerComplete: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.success}60`,
    borderRadius: '12px',
    padding: '20px 28px',
    marginBottom: '24px',
    boxShadow: `0 0 30px ${colors.success}30, inset 0 1px 0 rgba(255,255,255,0.05)`,
    position: 'relative' as const,
  },
  taskType: {
    fontSize: '15px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '1.2px',
    color: colors.primaryLight,
    marginBottom: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  taskDescription: {
    fontSize: '24px',
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
    marginTop: '0',
    minWidth: 0,
  },
  sidebarColumn: {
    flex: '0 0 320px',
    width: '320px',
    minWidth: 0,
  },
  leftCheatSheetDock: {
    position: 'fixed' as const,
    top: '140px',
    left: CHEATSHEET_DOCK_LEFT,
    width: CHEATSHEET_DOCK_WIDTH,
    zIndex: 1,
  },
  leftCheatSheetPanel: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '16px',
    maxHeight: 'calc(100vh - 170px)',
    overflowY: 'auto' as const,
  },
  leftCheatSheetHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '10px',
  },
  sidebarControls: {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'stretch',
    gap: '12px',
  },
  cheatSheetPanel: {
    marginTop: '8px',
    marginBottom: '8px',
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '16px',
  },
  cheatSheetTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: colors.textPrimary,
    marginBottom: '0',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  cheatSheetHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: `1px solid ${colors.border}`,
    paddingBottom: '10px',
    marginBottom: '12px',
  },
  cheatSheetToggle: {
    height: '44px',
    padding: '0 14px',
    fontSize: '14px',
    fontWeight: 700,
    color: colors.textSecondary,
    background: `${colors.border}22`,
    border: `1px solid ${colors.borderLight}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.6px',
  },
  cheatSheetSectionTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: colors.primaryLight,
    marginTop: '10px',
    marginBottom: '6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  cheatSheetRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 140px) minmax(0, 1fr)',
    gap: '8px',
    alignItems: 'start',
    padding: '4px 0',
  },
  cheatSheetKeys: {
    color: '#ffffff',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '0.2px',
  },
  cheatSheetDescription: {
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '12px',
    lineHeight: 1.4,
  },
  keyLogContainer: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '14px',
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
    height: '44px',
    padding: '0 14px',
    fontSize: '14px',
    fontWeight: 700,
    color: colors.textSecondary,
    background: `${colors.border}22`,
    border: `1px solid ${colors.borderLight}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.6px',
    transition: 'all 0.2s ease',
    marginTop: '12px',
  },
  sidebarControlButton: {
    width: '100%',
    height: '46px',
    padding: '0 14px',
    fontSize: '14px',
    fontWeight: 700,
    color: colors.textSecondary,
    background: `${colors.border}22`,
    border: `1px solid ${colors.borderLight}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    letterSpacing: '0.4px',
    transition: 'all 0.2s ease',
    position: 'relative' as const,
    textAlign: 'center' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarActionBase: {
    color: colors.textSecondary,
    background: '#000000',
    border: `1px solid ${colors.border}`,
  },
  sidebarToggleButton: {
    width: '100%',
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
    textAlign: 'left' as const,
  },
  sidebarControlButtonCheckable: {
    position: 'relative' as const,
    textAlign: 'left' as const,
    paddingRight: '34px',
  },
  sidebarControlButtonLabel: {
    display: 'block',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    textAlign: 'center' as const,
  },
  sidebarToggleCheck: {
    position: 'absolute' as const,
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: colors.successLight,
    fontWeight: 700,
  },
  sidebarActionsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '12px',
    width: '100%',
  },
  sidebarActionNewTasks: {
    color: colors.primaryLight,
    background: `${colors.primary}20`,
    border: `1px solid ${colors.primary}55`,
  },
  sidebarActionSameTasks: {
    color: colors.secondaryLight,
    background: `${colors.secondary}16`,
    border: `1px solid ${colors.secondary}55`,
  },
  restartButton: {
    width: '90%',
    height: '40px',
    padding: '0 16px',
    fontSize: '14px',
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
  restartSameButton: {
    width: '90%',
    height: '40px',
    padding: '0 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: colors.secondaryLight,
    background: `${colors.secondary}12`,
    border: `1px solid ${colors.secondary}55`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    marginTop: '12px',
    transition: 'all 0.2s ease',
  },
  resetTaskButton: {
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 600,
    color: colors.secondary,
    background: 'transparent',
    border: `1px solid ${colors.secondary}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
  editorActionRow: {
    display: 'flex',
    gap: '12px',
    marginTop: '10px',
    flexWrap: 'wrap' as const,
  },
  cheatsheetTaskButton: {
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 600,
    color: colors.successLight,
    background: 'transparent',
    border: `1px solid ${colors.successLight}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
  relativeLinesTaskButton: {
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 600,
    color: colors.primary,
    background: 'transparent',
    border: `1px solid ${colors.primary}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
  hintTaskButton: {
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 600,
    color: colors.warning,
    background: 'transparent',
    border: `1px solid ${colors.warning}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
  hintReveal: {
    marginTop: '8px',
    padding: '10px 14px',
    fontSize: '13px',
    fontFamily: '"JetBrains Mono", monospace',
    color: colors.warning,
    background: `${colors.warning}10`,
    border: `1px solid ${colors.warning}30`,
    borderRadius: '8px',
    lineHeight: 1.6,
  },
  completeText: {
    fontSize: '18px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
    marginBottom: '8px',
  },
  completeTime: {
    fontSize: '48px',
    fontWeight: 700,
    color: colors.primaryLight,
    marginTop: '20px',
    fontFamily: '"JetBrains Mono", monospace',
    textShadow: `0 0 30px ${colors.primaryGlow}`,
    letterSpacing: '2px',
  },
  summaryReplayTitle: {
    marginLeft: 'auto',
    fontFamily: '"JetBrains Mono", monospace',
    color: colors.textPrimary,
    fontSize: '24px',
    fontWeight: 600,
  },
  summaryTaskType: {
    color: colors.textMuted,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '15px',
    marginBottom: '8px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
  },
  summaryCodeRow: {
    display: 'flex',
    alignItems: 'stretch',
  },
  summaryCodeLineNo: {
    width: '36px',
    color: '#5c6370',
    background: '#21252b',
    borderRight: '1px solid #3e4451',
    padding: '2px 6px',
    textAlign: 'right' as const,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    userSelect: 'none' as const,
  },
  summaryCodeLineText: {
    flex: 1,
    color: '#abb2bf',
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
  summaryTokenKeyword: {
    color: '#c678dd',
  },
  summaryTokenType: {
    color: '#e5c07b',
  },
  summaryTokenString: {
    color: '#98c379',
  },
  summaryTokenNumber: {
    color: '#d19a66',
  },
  summaryTokenComment: {
    color: '#5c6370',
  },
  summaryTokenFunction: {
    color: '#61afef',
  },
  nextTaskHint: {
    fontSize: '14px',
    color: colors.successLight,
    position: 'absolute' as const,
    top: '20px',
    right: '28px',
    fontFamily: '"JetBrains Mono", monospace',
    pointerEvents: 'none' as const,
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
  readyDescription: {
    fontSize: '17px',
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
    lineHeight: 1.7,
    margin: '-28px 0 40px',
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
  readyOptionsGroup: {
    marginTop: '16px',
    borderTop: `1px solid ${colors.border}`,
    paddingTop: '14px',
  },
  readyOptionRow: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '8px 0',
  },
  readyOptionLabel: {
    color: colors.textSecondary,
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: '"JetBrains Mono", monospace',
    letterSpacing: '0.3px',
    userSelect: 'none' as const,
  },
  readyOptionCheck: {
    width: '18px',
    height: '18px',
    borderRadius: '4px',
    border: `1px solid ${colors.borderLight}`,
    background: colors.bgDark,
    boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.45)',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'transparent',
    fontSize: '13px',
    lineHeight: 1,
    fontWeight: 700,
    fontFamily: '"JetBrains Mono", monospace',
    userSelect: 'none' as const,
    cursor: 'pointer',
    padding: 0,
  },
  readyOptionCheckActive: {
    background: `${colors.success}1f`,
    border: `1px solid ${colors.success}`,
    boxShadow: `0 0 0 1px ${colors.success}33`,
    color: colors.success,
  },
  readyButton: {
    width: '100%',
    padding: '18px 24px',
    fontSize: '17px',
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
    padding: '16px 24px',
    fontSize: '15px',
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

interface PracticeLocationState {
  tasks?: Task[];
}

export interface RaceSessionPageProps {
  config: RaceSessionConfig;
  initialSession?: RaceSessionData;
  autoStart?: boolean;
}

export const RaceSessionPage: React.FC<RaceSessionPageProps> = ({
  config,
  initialSession,
  autoStart,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as PracticeLocationState | null;
  const { session } = useAuth();
  const editorRef = useRef<VimRaceEditorHandle>(null);
  const timerRef = useRef<number>(0);

  // Practice session state
  const [isReady, setIsReady] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [taskProgress, setTaskProgress] = useState(0);
  const [numTasks, setNumTasks] = useState(0);
  const [isTaskComplete, setIsTaskComplete] = useState(false);
  const [isSessionComplete, setIsSessionComplete] = useState(false);
  const [relativeLineNumbers, setRelativeLineNumbers] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [statsGameId, setStatsGameId] = useState<number | null>(null);
  const [finalTime, setFinalTime] = useState(0);
  const [editorReadyTick, setEditorReadyTick] = useState(0);
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  const [taskSummaries, setTaskSummaries] = useState<TaskSummary[]>([]);
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [blockedEditHint, setBlockedEditHint] = useState<string | null>(null);
  const [isNewTasksHovered, setIsNewTasksHovered] = useState(false);
  const [isSameTasksHovered, setIsSameTasksHovered] = useState(false);
  const [canDockCheatSheet, setCanDockCheatSheet] = useState(() => {
    if (typeof window === 'undefined') return false;
    return canDockCheatSheetForWidth(window.innerWidth);
  });
  const [completionInfo, setCompletionInfo] =
    useState<RaceCompletionInfo | null>(null);
  // True from the moment the finished run is submitted until the server's
  // placing comes back. The results screen shows a loading state for that
  // window instead of rendering half a card that resizes on arrival.
  const [isAwaitingCompletionInfo, setIsAwaitingCompletionInfo] =
    useState(false);

  // Current task derived from state
  const currentTask = tasks[taskProgress] || null;

  const currentTaskHint = useMemo(() => {
    if (!currentTask) return null;
    const { optimalSequence } = buildOptimalInfo(currentTask);
    return optimalSequence ?? null;
  }, [currentTask]);

  // Use refs to avoid stale closures
  const tasksRef = useRef<Task[]>([]);
  const taskProgressRef = useRef(0);
  const isTaskCompleteRef = useRef(false);
  const currentTaskIdRef = useRef<string | null>(null);
  const taskStartedAtRef = useRef<number>(Date.now());
  const taskKeystrokesRef = useRef<KeystrokeEvent[]>([]);
  const submittedTaskIdsRef = useRef<Set<string>>(new Set());
  const leaderboardSessionSubmittedRef = useRef(false);
  const skipLeaderboardRef = useRef(false);
  const isFetchingPracticeSessionRef = useRef(false);
  const blockedHintTimerRef = useRef<number | null>(null);
  const yankConfirmedRef = useRef(false);
  const lastRegisterValueRef = useRef('');

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

  useEffect(() => {
    if (!isSessionComplete || sessionStartTime == null) return;
    const taskList = tasksRef.current;
    if (taskList.length === 0) return;
    if (leaderboardSessionSubmittedRef.current) return;
    leaderboardSessionSubmittedRef.current = true;

    if (skipLeaderboardRef.current) return;

    const accessToken = session?.access_token;
    if (!accessToken) return;

    const duration_ms = Date.now() - sessionStartTime;
    setIsAwaitingCompletionInfo(true);
    void config
      .submitCompletion({
        accessToken,
        durationMs: duration_ms,
        tasks: taskList,
        gameId: statsGameId,
      })
      .then((result) => {
        setCompletionInfo(result);
      })
      .finally(() => {
        setIsAwaitingCompletionInfo(false);
      });
  }, [isSessionComplete, sessionStartTime, session, statsGameId, config]);

  useEffect(
    () => () => {
      if (blockedHintTimerRef.current !== null) {
        window.clearTimeout(blockedHintTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const handleResize = () => {
      setCanDockCheatSheet(canDockCheatSheetForWidth(window.innerWidth));
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Format time display
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const tenths = Math.floor((ms % 1000) / 100);
    return `${seconds}.${tenths}s`;
  };

  const formatKeyLabel = useCallback((key: string): string | null => {
    return sharedFormatKeyLabel(key);
  }, []);

  const expandRecommendedSequence = useCallback(
    (recommendedSequence: string[]): string[] => {
      return sharedExpandRecommendedSequence(recommendedSequence);
    },
    []
  );

  const formatKeysForDisplay = useCallback((keys: string[]): string => {
    return sharedFormatKeysForDisplay(keys);
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
      case 'wrongPastePosition': {
        const task = tasksRef.current[taskProgressRef.current];
        if (task?.type === 'yank_paste' && task.linewise === true) {
          return 'Wrong position — paste anywhere on the highlighted line.';
        }
        return 'Wrong position — paste on the highlighted marker.';
      }
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

  const submitTaskKeystrokes = useCallback(
    async (
      task: Task,
      snapshot?: {
        startedAt: number;
        completedAt: number;
        events: KeystrokeEvent[];
      }
    ) => {
      if (submittedTaskIdsRef.current.has(task.id)) return;

      const startedAt = snapshot?.startedAt ?? taskStartedAtRef.current;
      const completedAt = snapshot?.completedAt ?? Date.now();
      const events = snapshot?.events ?? taskKeystrokesRef.current;

      const payload: TaskKeystrokeSubmission = {
        source: config.mode,
        taskId: task.id,
        taskType: task.type,
        startedAt,
        completedAt,
        events,
      };

      submittedTaskIdsRef.current.add(task.id);

      await postTaskKeystrokes({
        payload,
        accessToken: session?.access_token,
        gameId: statsGameId,
        ...(task.contentHash ? { taskHash: task.contentHash } : {}),
      });
    },
    [statsGameId, session, config]
  );

  const handleTaskKeyStroke = useCallback(
    (event: KeystrokeEvent) => {
      const currentTaskId = currentTaskIdRef.current;
      if (!currentTaskId || isTaskCompleteRef.current || isSessionComplete)
        return;

      const dtMs = Math.max(0, Date.now() - taskStartedAtRef.current);
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
          const task = tasksRef.current[taskProgressRef.current];
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
                  setAllowedPasteResults.of(task.expectedResults),
                  setPasteMarker.of({
                    offset: task.pasteOffset,
                    linewise: task.linewise === true,
                  }),
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
    [formatKeyLabel, isSessionComplete]
  );

  // Start the run when the user clicks Ready. The Ready screen is public, but
  // runs are not: a visitor with no session is sent to sign in instead.
  const handleReady = useCallback(() => {
    if (!session) {
      navigate('/login');
      return;
    }
    setIsReady(true);
  }, [session, navigate]);

  // Setup a task in the editor (replace doc + configure highlights)
  const setupTaskInEditor = useCallback((task: Task) => {
    const view = editorRef.current?.view;
    if (!view) return;
    setBlockedEditHint(null);
    yankConfirmedRef.current = false;
    lastRegisterValueRef.current = '';
    Vim.getRegisterController().unnamedRegister.clear();

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: task.codeSnippet,
      },
      selection: { anchor: 0 },
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
    setShowHint(false);

    if (task.type === 'navigate') {
      view.dispatch({
        effects: [
          setTargetPosition.of(task.targetOffset),
          setDeleteMode.of(false),
          setYankPasteMode.of(false),
          setAllowedDeleteRange.of(null),
        ],
      });
    } else if (task.type === 'delete') {
      view.dispatch({
        effects: [
          setTargetRange.of(task.targetRange),
          setDeleteMode.of(true),
          setYankPasteMode.of(false),
          setAllowedDeleteRange.of(task.targetRange),
        ],
      });
    } else if (task.type === 'yank_paste') {
      view.dispatch({
        effects: [
          setYankRange.of(task.yankRange),
          setPasteMarker.of(null),
          setDeleteMode.of(false),
          setYankPasteMode.of(true),
          setAllowedDeleteRange.of(null),
        ],
      });
    }
  }, []);

  const resetPracticeRunState = useCallback(() => {
    setTaskProgress(0);
    setIsTaskComplete(false);
    isTaskCompleteRef.current = false;
    setIsSessionComplete(false);
    setSessionStartTime(null);
    setElapsedTime(0);
    setFinalTime(0);
    currentTaskIdRef.current = null;
    taskKeystrokesRef.current = [];
    submittedTaskIdsRef.current.clear();
    leaderboardSessionSubmittedRef.current = false;
    setCompletionInfo(null);
    setRecentKeys([]);
    setTaskSummaries([]);
  }, []);

  // Fetch a new session (state only — task setup handled by effect)
  const fetchSession = useCallback(async () => {
    if (isFetchingPracticeSessionRef.current) return;
    isFetchingPracticeSessionRef.current = true;
    setIsLoadingTasks(true);
    setLoadError(null);
    try {
      const data = await config.fetchSession(session?.access_token);

      skipLeaderboardRef.current = false;
      setStatsGameId(data.gameId);
      setTasks(data.tasks);
      setNumTasks(data.tasks.length);
      resetPracticeRunState();
    } catch (error) {
      console.error('Failed to fetch session:', error);
      setLoadError(
        error instanceof Error ? error.message : 'Failed to load tasks'
      );
    } finally {
      isFetchingPracticeSessionRef.current = false;
      setIsLoadingTasks(false);
    }
  }, [config, resetPracticeRunState, session]);

  const restartSameTasks = useCallback(() => {
    const sameTasks = tasksRef.current;
    if (sameTasks.length === 0) {
      void fetchSession();
      return;
    }

    skipLeaderboardRef.current = true;
    setStatsGameId(null); // Replay runs carry no gameId — prevents writing into the finished game
    setNumTasks(sameTasks.length);
    resetPracticeRunState();
    setupTaskInEditor(sameTasks[0]!);
    setSessionStartTime(Date.now());
    editorRef.current?.view?.focus();
  }, [fetchSession, resetPracticeRunState, setupTaskInEditor]);

  // Load pre-supplied tasks (e.g. from multiplayer review) on mount.
  // Bypasses the Ready screen and starts practice immediately.
  const preloadedRef = useRef(false);
  useEffect(() => {
    if (preloadedRef.current) return;
    const incoming = locationState?.tasks;
    if (!incoming || incoming.length === 0) return;
    preloadedRef.current = true;

    // Clear the navigation state so a page refresh fetches fresh tasks
    window.history.replaceState({}, '');

    skipLeaderboardRef.current = true;
    setTasks(incoming);
    setNumTasks(incoming.length);
    resetPracticeRunState();
    setIsReady(true);
  }, [locationState, resetPracticeRunState]);

  // Load tasks from the initialSession prop (e.g. daily mode).
  // Unlike locationState (which sets skipLeaderboardRef=true for replays),
  // initialSession runs DO submit and carry the session's gameId.
  const initialSessionLoadedRef = useRef(false);
  useEffect(() => {
    if (initialSessionLoadedRef.current) return;
    if (!initialSession || initialSession.tasks.length === 0) return;
    initialSessionLoadedRef.current = true;

    skipLeaderboardRef.current = false;
    setStatsGameId(initialSession.gameId);
    setTasks(initialSession.tasks);
    setNumTasks(initialSession.tasks.length);
    resetPracticeRunState();
    if (autoStart) {
      setIsReady(true);
    }
  }, [initialSession, autoStart, resetPracticeRunState]);

  // Prefetch tasks on page load so Ready can start immediately.
  useEffect(() => {
    if (initialSession) return;
    const incoming = locationState?.tasks;
    if (incoming && incoming.length > 0) return;
    if (tasks.length > 0) return;
    void fetchSession();
  }, [initialSession, locationState, tasks.length, fetchSession]);

  // Trigger initial fetch when user clicks Ready (only if no preloaded tasks)
  useEffect(() => {
    if (isReady && tasks.length === 0) {
      fetchSession();
    }
  }, [isReady, tasks.length, fetchSession]);

  // Set up the first task when tasks are loaded (or reloaded on restart).
  // Also starts the session timer — the editor view only exists after the
  // Ready screen, so this naturally gates the timer on user action.
  useEffect(() => {
    if (tasks.length === 0 || taskProgress !== 0) return;
    if (!editorRef.current?.view) return;
    setupTaskInEditor(tasks[0]);
    editorRef.current.view.focus();
    setSessionStartTime(Date.now());
  }, [tasks, taskProgress, setupTaskInEditor, editorReadyTick]);

  useEffect(() => {
    if (editorReadyTick === 0) return;
    editorRef.current?.setRelativeLineNumbers(relativeLineNumbers);
  }, [editorReadyTick, relativeLineNumbers]);

  // Advance to next task
  const advanceToNextTask = useCallback(() => {
    const nextProgress = taskProgressRef.current + 1;

    if (nextProgress >= tasksRef.current.length) {
      setIsSessionComplete(true);
      setFinalTime(elapsedTime);
      const view = editorRef.current?.view;
      if (view) {
        view.dispatch({
          effects: [setTargetPosition.of(null), setDeleteMode.of(false)],
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
      const keyLabels = eventsSnapshot
        .map((event) => formatKeyLabel(event.key))
        .filter((label): label is string => Boolean(label));
      const visibleKeyCount = 30;
      const keySequence =
        keyLabels.length <= visibleKeyCount
          ? formatKeysForDisplay(keyLabels)
          : `${formatKeysForDisplay(keyLabels.slice(0, visibleKeyCount))} ... (+${keyLabels.length - visibleKeyCount})`;
      const taskRecommendation = {
        sequence: completedTask.recommendedSequence,
        weight: completedTask.recommendedWeight,
      };
      const hasOptimal =
        Array.isArray(taskRecommendation.sequence) &&
        typeof taskRecommendation.weight === 'number';
      let optimalSequence: string | undefined;
      let ourSolutionKeyCount: number | undefined;
      if (hasOptimal) {
        const optimalKeys = taskRecommendation.sequence as string[];
        const expandedOptimalKeys = expandRecommendedSequence(optimalKeys);
        const displayOptimalKeys = expandedOptimalKeys.map((key) =>
          key === ' ' ? 'Space' : key
        );
        optimalSequence = formatKeysForDisplay(displayOptimalKeys);
        ourSolutionKeyCount = expandedOptimalKeys.length;
      }

      setTaskSummaries((prev) => [
        ...prev,
        {
          taskIndex: taskProgressRef.current + 1,
          taskId: completedTask.id,
          taskType: completedTask.type,
          task: completedTask,
          durationMs: Math.max(0, completedAt - startedAt),
          keyCount: eventsSnapshot.length,
          keySequence,
          optimalSequence,
          ourSolutionKeyCount,
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
        effects: [setTargetPosition.of(null), setDeleteMode.of(false)],
      });
      view.contentDOM.blur();
    }
  }, [
    expandRecommendedSequence,
    formatKeysForDisplay,
    formatKeyLabel,
    submitTaskKeystrokes,
  ]);

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
    return () =>
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isTaskComplete, advanceToNextTask]);

  // Toggle relative line numbers
  const toggleRelativeLineNumbers = useCallback(() => {
    const newValue = !relativeLineNumbers;
    setRelativeLineNumbers(newValue);
    editorRef.current?.setRelativeLineNumbers(newValue);
  }, [relativeLineNumbers]);

  const toggleCheatSheet = useCallback(() => {
    setShowCheatSheet((prev) => !prev);
  }, []);

  const resetCurrentTask = useCallback(() => {
    const current = tasksRef.current[taskProgressRef.current];
    if (!current) return;

    isTaskCompleteRef.current = false;
    setIsTaskComplete(false);
    editorRef.current?.resetUndoHistory();
    Vim.getRegisterController().unnamedRegister.clear();
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
    return () =>
      window.removeEventListener('keydown', handleResetHotkey, {
        capture: true,
      });
  }, [isReady, isSessionComplete, currentTask, resetCurrentTask]);

  useEffect(() => {
    const handleRelativeLinesHotkey = (e: KeyboardEvent) => {
      if (e.key !== 'F7') return;
      if (!isReady || isSessionComplete || !currentTask) return;

      e.preventDefault();
      e.stopPropagation();
      toggleRelativeLineNumbers();
    };

    window.addEventListener('keydown', handleRelativeLinesHotkey, {
      capture: true,
    });
    return () =>
      window.removeEventListener('keydown', handleRelativeLinesHotkey, {
        capture: true,
      });
  }, [isReady, isSessionComplete, currentTask, toggleRelativeLineNumbers]);

  useEffect(() => {
    const handleCheatSheetHotkey = (e: KeyboardEvent) => {
      if (e.key !== 'F8') return;
      if (!isReady || isSessionComplete || !currentTask) return;

      e.preventDefault();
      e.stopPropagation();
      toggleCheatSheet();
    };

    window.addEventListener('keydown', handleCheatSheetHotkey, {
      capture: true,
    });
    return () =>
      window.removeEventListener('keydown', handleCheatSheetHotkey, {
        capture: true,
      });
  }, [isReady, isSessionComplete, currentTask, toggleCheatSheet]);

  useEffect(() => {
    const handleHintHotkey = (e: KeyboardEvent) => {
      if (e.key !== 'F9') return;
      if (!isReady || isSessionComplete || !currentTask || !currentTaskHint)
        return;

      e.preventDefault();
      e.stopPropagation();
      setShowHint((prev) => !prev);
    };

    window.addEventListener('keydown', handleHintHotkey, { capture: true });
    return () =>
      window.removeEventListener('keydown', handleHintHotkey, {
        capture: true,
      });
  }, [isReady, isSessionComplete, currentTask, currentTaskHint]);

  // Handle cursor position changes (for navigate tasks)
  const handleCursorChange = useCallback(
    (offset: number) => {
      const currentTasks = tasksRef.current;
      const progress = taskProgressRef.current;
      const completed = isTaskCompleteRef.current;

      const task = currentTasks[progress];
      if (task && task.type === 'navigate' && !completed) {
        if (offset === task.targetOffset) {
          handleTaskComplete();
        }
      }
    },
    [handleTaskComplete]
  );

  // Handle editor text changes (for delete and yank_paste tasks)
  const handleEditorChange = useCallback(
    (newText: string) => {
      const currentTasks = tasksRef.current;
      const progress = taskProgressRef.current;
      const completed = isTaskCompleteRef.current;

      const task = currentTasks[progress];
      if (
        task &&
        (task.type === 'delete' || task.type === 'yank_paste') &&
        !completed
      ) {
        if (
          (task.type === 'yank_paste' &&
            task.expectedResults.includes(newText)) ||
          (task.type === 'delete' && newText === task.expectedResult)
        ) {
          handleTaskComplete();
        }
      }
    },
    [handleTaskComplete]
  );

  const handleEditorReady = useCallback(() => {
    setEditorReadyTick((prev) => prev + 1);
  }, []);

  // Progress percentage
  const progressPercent =
    numTasks > 0
      ? ((taskProgress + (isTaskComplete ? 1 : 0)) / numTasks) * 100
      : 0;
  const recentKeysDisplay = useMemo(() => {
    if (recentKeys.length === 0) return '';
    return recentKeys.slice(-KEY_LOG_VISIBLE_KEYS).join(' ');
  }, [recentKeys]);

  // Task type display
  const getTaskTypeDisplay = (task: Task | null) => {
    if (!task) return { label: 'Loading...' };
    if (task.type === 'navigate') return { label: 'Navigate to target' };
    if (task.type === 'delete') return { label: 'Delete the highlighted text' };
    if (task.type === 'yank_paste') {
      return task.linewise === true
        ? { label: 'Yank highlighted line and paste anywhere on marked line' }
        : { label: 'Yank highlighted text and paste at marker' };
    }
    return { label: 'Complete the task' };
  };

  const taskDisplay = getTaskTypeDisplay(currentTask);
  const useDockedCheatSheet =
    showCheatSheet && !isSessionComplete && canDockCheatSheet;

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
            <h1 style={styles.readyTitle}>{config.title}</h1>
            <p style={styles.readySubtitle}>{config.subtitle}</p>
            {config.description && (
              <p style={styles.readyDescription}>{config.description}</p>
            )}

            <div style={styles.readyCard}>
              <div style={styles.readyCardTitle}>What to expect</div>
              <div style={styles.readyInfo}>
                Navigate to highlighted targets using Vim motions
                <br />
                Delete highlighted text using Vim commands
                <br />
                Complete all tasks as fast as you can
              </div>
              <div style={styles.readyOptionsGroup}>
                <div style={styles.readyOptionRow}>
                  <span style={styles.readyOptionLabel}>
                    Start with Relative Line Numbers
                  </span>
                  <button
                    type="button"
                    aria-label="Toggle relative line numbers"
                    aria-pressed={relativeLineNumbers}
                    onClick={() => setRelativeLineNumbers((prev) => !prev)}
                    style={{
                      ...styles.readyOptionCheck,
                      ...(relativeLineNumbers
                        ? styles.readyOptionCheckActive
                        : {}),
                    }}
                  >
                    ✓
                  </button>
                </div>
                <div style={styles.readyOptionRow}>
                  <span style={styles.readyOptionLabel}>
                    Start with Cheatsheet Open
                  </span>
                  <button
                    type="button"
                    aria-label="Toggle cheatsheet visibility"
                    aria-pressed={showCheatSheet}
                    onClick={() => setShowCheatSheet((prev) => !prev)}
                    style={{
                      ...styles.readyOptionCheck,
                      ...(showCheatSheet ? styles.readyOptionCheckActive : {}),
                    }}
                  >
                    ✓
                  </button>
                </div>
              </div>
            </div>

            {loadError ? (
              <>
                <div
                  style={{
                    color: colors.warning,
                    fontSize: '13px',
                    textAlign: 'center' as const,
                    marginBottom: '8px',
                    fontFamily: '"JetBrains Mono", monospace',
                  }}
                >
                  Failed to load tasks
                </div>
                <button
                  style={styles.readyButton}
                  onClick={() => void fetchSession()}
                  disabled={isLoadingTasks}
                >
                  {isLoadingTasks ? 'Loading...' : 'Retry'}
                </button>
              </>
            ) : (
              <button
                style={{
                  ...styles.readyButton,
                  ...(isLoadingTasks || tasks.length === 0
                    ? { opacity: 0.5, cursor: 'not-allowed' }
                    : {}),
                }}
                onClick={handleReady}
                disabled={isLoadingTasks || tasks.length === 0}
              >
                {isLoadingTasks
                  ? 'Loading...'
                  : session
                    ? 'Ready'
                    : 'Sign in to start'}
              </button>
            )}
            <button style={styles.backButton} onClick={() => navigate('/')}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={isSessionComplete ? styles.summaryContainer : styles.container}>
      {/* The results screen is the only full-page view here, so it gets the
          same ambient glows as the rest of the site instead of flat black. */}
      {isSessionComplete && (
        <>
          <div style={styles.bgGlow1} />
          <div style={styles.bgGlow2} />
        </>
      )}
      <div
        style={
          useDockedCheatSheet
            ? {
                ...styles.raceContainer,
                marginLeft: RACE_CONTAINER_LEFT_WITH_CHEATSHEET,
                marginRight: 'auto',
              }
            : {
                ...styles.raceContainer,
                ...(isSessionComplete
                  ? {
                      maxWidth: '1500px',
                      position: 'relative' as const,
                      zIndex: 1,
                    }
                  : {}),
                marginLeft: 'auto',
                marginRight: 'auto',
              }
        }
      >
        {!isSessionComplete && useDockedCheatSheet && (
          <div style={styles.leftCheatSheetDock}>
            <div style={styles.leftCheatSheetPanel}>
              <div style={styles.leftCheatSheetHeader}>
                <div style={{ ...styles.cheatSheetTitle, marginBottom: 0 }}>
                  Basic Cheat Sheet
                </div>
                <button
                  type="button"
                  style={styles.cheatSheetToggle}
                  onClick={() => setShowCheatSheet(false)}
                >
                  Hide
                </button>
              </div>
              {VIM_CHEATSHEET.map((section) => (
                <div key={section.title}>
                  <div style={styles.cheatSheetSectionTitle}>
                    {section.title}
                  </div>
                  {section.items.map((item) => (
                    <div
                      key={`${section.title}-${item.keys}`}
                      style={styles.cheatSheetRow}
                    >
                      <div style={styles.cheatSheetKeys}>{item.keys}</div>
                      <div style={styles.cheatSheetDescription}>
                        {item.description}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
        {!isSessionComplete && (
          <div style={styles.header}>
            <div style={styles.title}>VIM_GYM - {config.title}</div>
            <div style={styles.timer}>{formatTime(elapsedTime)}</div>
            <button style={styles.exitButton} onClick={() => navigate('/')}>
              Exit
            </button>
          </div>
        )}

        {isSessionComplete ? (
          <SessionCompleteSummary
            config={config}
            completionInfo={completionInfo}
            isAwaitingCompletionInfo={isAwaitingCompletionInfo}
            finalTimeMs={finalTime}
            taskSummaries={taskSummaries}
            onRestartSameTasks={restartSameTasks}
            onRestartNewTasks={fetchSession}
          />
        ) : (
          <>
            {/* Task Banner */}
            <div
              style={
                isTaskComplete ? styles.taskBannerComplete : styles.taskBanner
              }
            >
              <div
                style={{
                  ...styles.taskType,
                  color: isTaskComplete
                    ? colors.successLight
                    : colors.primaryLight,
                }}
              >
                {isTaskComplete ? 'Complete!' : taskDisplay.label}
              </div>
              <div style={styles.taskDescription}>
                {currentTask?.description || 'Loading task...'}
              </div>
              {isTaskComplete && (
                <div style={styles.nextTaskHint}>Press Enter for next task</div>
              )}
              <div style={styles.taskProgressInlineRow}>
                <span>Tasks Completed</span>
                <span style={{ color: colors.primaryLight }}>
                  {taskProgress + (isTaskComplete ? 1 : 0)}/{numTasks}
                </span>
              </div>
              <div style={styles.progressBar}>
                <div
                  style={{
                    ...styles.progressFill,
                    width: `${progressPercent}%`,
                  }}
                />
              </div>
            </div>

            {/* Main Content */}
            <div style={styles.mainContent}>
              {/* Editor */}
              <div style={styles.editorPanel}>
                <div style={styles.editorWrapper}>
                  <VimRaceEditor
                    ref={editorRef}
                    initialDoc="// Loading practice session..."
                    onReady={handleEditorReady}
                    onCursorChange={handleCursorChange}
                    onDocChange={handleEditorChange}
                    onBlockedEdit={handleBlockedEdit}
                    onKeyStroke={handleTaskKeyStroke}
                    shouldAllowBlur={() => isTaskCompleteRef.current}
                  />
                </div>
                {currentTask && (
                  <div style={styles.editorActionRow}>
                    <button
                      style={styles.resetTaskButton}
                      onClick={resetCurrentTask}
                    >
                      Reset (F6)
                    </button>
                    <button
                      type="button"
                      style={styles.relativeLinesTaskButton}
                      onClick={toggleRelativeLineNumbers}
                    >
                      {relativeLineNumbers
                        ? 'Relative Lines (F7) ✓'
                        : 'Relative Lines (F7)'}
                    </button>
                    <button
                      type="button"
                      style={styles.cheatsheetTaskButton}
                      onClick={toggleCheatSheet}
                    >
                      {showCheatSheet ? 'Cheatsheet (F8) ✓' : 'Cheatsheet (F8)'}
                    </button>
                    {currentTaskHint && (
                      <button
                        type="button"
                        style={styles.hintTaskButton}
                        onClick={() => setShowHint((prev) => !prev)}
                      >
                        {showHint ? 'Hint (F9) ✓' : 'Hint (F9)'}
                      </button>
                    )}
                  </div>
                )}
                {showHint && currentTaskHint && (
                  <div style={styles.hintReveal}>
                    Recommended: {currentTaskHint}
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <div style={styles.sidebarColumn}>
                {showCheatSheet && !useDockedCheatSheet && (
                  <div style={styles.cheatSheetPanel}>
                    <div style={styles.cheatSheetHeader}>
                      <div style={styles.cheatSheetTitle}>
                        Basic Cheat Sheet
                      </div>
                      <button
                        type="button"
                        style={styles.cheatSheetToggle}
                        onClick={() => setShowCheatSheet(false)}
                      >
                        Hide
                      </button>
                    </div>
                    {VIM_CHEATSHEET.map((section) => (
                      <div key={section.title}>
                        <div style={styles.cheatSheetSectionTitle}>
                          {section.title}
                        </div>
                        {section.items.map((item) => (
                          <div
                            key={`${section.title}-${item.keys}`}
                            style={styles.cheatSheetRow}
                          >
                            <div style={styles.cheatSheetKeys}>{item.keys}</div>
                            <div style={styles.cheatSheetDescription}>
                              {item.description}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                <div style={styles.keyLogContainer}>
                  <div style={styles.keyLogTitle}>
                    Keys Pressed (Current Task)
                  </div>
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

                <div style={styles.sidebarControls}>
                  <div style={styles.sidebarActionsRow}>
                    {config.allowNewTasks && (
                      <button
                        style={{
                          ...styles.sidebarControlButton,
                          ...styles.sidebarActionBase,
                          ...(isNewTasksHovered
                            ? styles.sidebarActionNewTasks
                            : {}),
                        }}
                        onClick={fetchSession}
                        onMouseEnter={() => setIsNewTasksHovered(true)}
                        onMouseLeave={() => setIsNewTasksHovered(false)}
                      >
                        <span style={styles.sidebarControlButtonLabel}>
                          New Tasks
                        </span>
                      </button>
                    )}

                    {config.allowSameTasksReplay && (
                      <button
                        style={{
                          ...styles.sidebarControlButton,
                          ...styles.sidebarActionBase,
                          ...(isSameTasksHovered
                            ? styles.sidebarActionSameTasks
                            : {}),
                        }}
                        onClick={restartSameTasks}
                        onMouseEnter={() => setIsSameTasksHovered(true)}
                        onMouseLeave={() => setIsSameTasksHovered(false)}
                      >
                        <span style={styles.sidebarControlButtonLabel}>
                          Same Tasks
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Practice mode = the race engine with random tasks and global-leaderboard
 * submission. This wrapper is the /practice and /vim-editor route component.
 */
const practiceConfig: RaceSessionConfig = {
  mode: 'practice',
  title: 'Practice Mode',
  subtitle: 'Learn and Hone your Vim skills solo.',
  description:
    'Real editing tasks, no timer pressure. After each one you see the keystrokes you used next to the sequence an expert would have chosen, so the shorter motion sticks.',
  summaryTitle: 'Practice Summary',
  showTaskBreakdown: true,
  fetchSession: async (accessToken) => {
    const headers: HeadersInit = accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : {};
    const response = await fetch(`${API_BASE}/api/task/practice`, { headers });
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }
    const data = (await response.json()) as PracticeSessionResponse;
    return { tasks: data.tasks, gameId: data.gameId ?? null };
  },
  submitCompletion: async ({ accessToken, durationMs, tasks, gameId }) => {
    if (!accessToken) return null;
    const result = await submitPracticeSession({
      accessToken,
      durationMs,
      tasks,
      gameId,
    });
    return result.status === 'recorded'
      ? { kind: 'practice', ranks: result.ranks }
      : null;
  },
  allowNewTasks: true,
  allowSameTasksReplay: true,
};

const PracticeEditor: React.FC = () => (
  <RaceSessionPage config={practiceConfig} />
);

export default PracticeEditor;
