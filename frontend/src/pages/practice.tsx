import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Vim, getCM } from '@replit/codemirror-vim';
import type { CodeMirrorV } from '@replit/codemirror-vim';
import { Transaction } from '@codemirror/state';

import type { PracticeSummary, Task, TaskSummary } from '../types/task';
import type { KeystrokeEvent, TaskKeystrokeSubmission } from '../types/keystroke';
import {
  formatKeyLabel as sharedFormatKeyLabel,
  formatTaskTypeLabel as sharedFormatTaskTypeLabel,
  expandRecommendedSequence as sharedExpandRecommendedSequence,
  formatKeysForDisplay as sharedFormatKeysForDisplay,
} from '../utils/keyFormatting';
import { setTargetPosition, setTargetRange } from '../extensions/targetHighlight';
import {
  allowReset,
  EditBlockReason,
  setAllowedDeleteRange,
  setDeleteMode,
  setUndoBarrier,
} from '../extensions/readOnlyNavigation';
import { VimRaceEditor, VimRaceEditorHandle, editorColors as colors } from '../components/VimRaceEditor';
import { SummaryTaskSandbox } from '../components/SummaryTaskSandbox';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const KEY_LOG_VISIBLE_KEYS = 5;
const CHEATSHEET_DOCK_WIDTH = 'clamp(18rem, 22vw, 24rem)';
const CHEATSHEET_CONTAINER_SHIFT = 'clamp(2.375rem, 3.25vw, 3.5rem)';
const RACE_CONTAINER_LEFT_WITH_CHEATSHEET = `max(1.5rem, calc((100vw - 1200px) / 2 + ${CHEATSHEET_CONTAINER_SHIFT}))`;
const CHEATSHEET_DOCK_LEFT = `max(0.75rem, calc((${RACE_CONTAINER_LEFT_WITH_CHEATSHEET} - ${CHEATSHEET_DOCK_WIDTH}) / 2))`;

// TaskSummary imported from '../types/task'

interface PracticeSessionResponse {
  tasks: Task[];
  numTasks: number;
  startTime: number;
  practiceSummary?: PracticeSummary;
}

const VIM_CHEATSHEET: Array<{ title: string; items: Array<{ keys: string; description: string }> }> = [
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
      { keys: 'dw / d<count>e', description: 'Delete word / multiple word-ends' },
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
    gap: '10px',
  },
  cheatSheetPanel: {
    marginTop: '16px',
    marginBottom: '28px',
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
    height: '40px',
    padding: '0 10px',
    fontSize: '13px',
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
    height: '40px',
    padding: '0 10px',
    fontSize: '13px',
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
    height: '42px',
    padding: '0 12px',
    fontSize: '13px',
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
    gap: '10px',
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
    marginTop: '10px',
  },
  sessionComplete: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    minHeight: 'calc(100vh - 180px)',
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '48px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
  },
  completeTitle: {
    fontSize: '38px',
    fontWeight: 700,
    color: colors.textPrimary,
    marginBottom: '16px',
    fontFamily: '"JetBrains Mono", monospace',
    textShadow: `0 0 20px ${colors.primaryGlow}`,
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
  completeButtons: {
    display: 'flex',
    gap: '16px',
    marginTop: '32px',
  },
  summaryOverview: {
    width: '100%',
    marginTop: '22px',
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    background: colors.bgCard,
    padding: '16px 18px',
  },
  summaryOverviewLabelRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
    gap: '8px',
    marginBottom: '8px',
  },
  summaryOverviewValueRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
    gap: '8px',
  },
  summaryOverviewLabel: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
  },
  summaryOverviewValue: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '24px',
    fontWeight: 700,
    color: colors.textPrimary,
  },
  completeButton: {
    padding: '14px 32px',
    fontSize: '18px',
    fontWeight: 600,
    color: colors.bgDark,
    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    boxShadow: `0 0 20px ${colors.primaryGlow}`,
  },
  summaryList: {
    width: '100%',
    marginTop: '24px',
    borderTop: `1px solid ${colors.border}90`,
    paddingTop: '16px',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '16px',
  },
  summaryItem: {
    position: 'relative',
    border: `1px solid ${colors.border}`,
    background: colors.bgCard,
    borderRadius: '10px',
    padding: '18px',
    boxShadow: `0 6px 20px rgba(0, 0, 0, 0.25)`,
  },
  summaryItemComplete: {
    border: `1px solid ${colors.success}60`,
    boxShadow: `0 0 16px ${colors.success}25, inset 0 1px 0 rgba(255,255,255,0.05)`,
  },
  summaryCompleteCheck: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    width: '24px',
    height: '24px',
    borderRadius: '999px',
    border: `1px solid ${colors.success}90`,
    background: `${colors.success}30`,
    color: colors.successLight,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '15px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryItemBody: {
    display: 'flex',
    alignItems: 'stretch',
    gap: '14px',
    flexWrap: 'wrap' as const,
  },
  summaryAnalyticsColumn: {
    flex: '1 1 360px',
    minWidth: '320px',
  },
  summaryVerticalDivider: {
    width: '1px',
    alignSelf: 'stretch',
    background: colors.border,
  },
  summarySnippetColumn: {
    flex: '1 1 420px',
    minWidth: '360px',
    paddingLeft: '14px',
  },
  summaryItemHeader: {
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: '70px',
    marginBottom: '8px',
  },
  summaryItemTitle: {
    fontFamily: '"JetBrains Mono", monospace',
    color: colors.textPrimary,
    fontSize: '24px',
    fontWeight: 600,
  },
  summaryTaskBadge: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
    padding: '7px 13px',
    borderRadius: '999px',
    border: `1px solid ${colors.primary}40`,
    background: `${colors.primary}20`,
    color: colors.primaryLight,
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
  summaryMetaRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '10px',
    marginBottom: '8px',
  },
  summaryMetaCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    border: `1px solid ${colors.border}`,
    background: colors.bgCard,
    borderRadius: '8px',
    padding: '8px 10px',
  },
  summaryMetaCardApm: {
    borderColor: `${colors.primary}60`,
    background: `${colors.primary}16`,
  },
  summaryMetaCardDuration: {
    borderColor: `${colors.secondary}60`,
    background: `${colors.secondary}16`,
  },
  summaryMetaCardKeys: {
    borderColor: `${colors.warning}60`,
    background: `${colors.warning}16`,
  },
  summaryMetaLabel: {
    color: '#cbd5e1',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '12px',
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
  },
  summaryMetaValue: {
    color: '#ffffff',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '20px',
    fontWeight: 700,
  },
  summaryKeys: {
    border: '1px solid rgba(255, 255, 255, 0.35)',
    background: '#000000',
    borderRadius: '8px',
    padding: '10px 12px',
    marginBottom: '10px',
  },
  summaryKeysLabel: {
    color: '#cbd5e1',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
    marginBottom: '4px',
  },
  summaryKeysValue: {
    color: '#ffffff',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '22px',
    lineHeight: 1.55,
    fontWeight: 700,
  },
  summaryComparisonBox: {
    width: '50%',
    borderRadius: '8px',
    padding: '10px 12px',
    marginBottom: '10px',
    border: '1px solid transparent',
  },
  summaryComparisonLabel: {
    color: '#cbd5e1',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
    marginBottom: '4px',
  },
  summaryComparisonValue: {
    color: '#ffffff',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '20px',
    lineHeight: 1.4,
    fontWeight: 700,
  },
  summaryEmpty: {
    color: colors.textMuted,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '16px',
  },
  summaryCodeBox: {
    background: '#282c34',
    border: '1px solid #3e4451',
    borderRadius: '8px',
    overflowX: 'auto' as const,
    overflowY: 'hidden' as const,
  },
  summaryResetButton: {
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
    marginTop: '8px',
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
  homeButton: {
    padding: '14px 32px',
    fontSize: '18px',
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

interface PracticeLocationState {
  tasks?: Task[];
}

const PracticeEditor: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as PracticeLocationState | null;
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
  const [summaryTaskCompletion, setSummaryTaskCompletion] = useState<Record<string, boolean>>({});
  const [summaryTaskResetTokens, setSummaryTaskResetTokens] = useState<Record<string, number>>({});
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const [blockedEditHint, setBlockedEditHint] = useState<string | null>(null);

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
  const isFetchingPracticeSessionRef = useRef(false);
  const blockedHintTimerRef = useRef<number | null>(null);

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

  useEffect(() => () => {
    if (blockedHintTimerRef.current !== null) {
      window.clearTimeout(blockedHintTimerRef.current);
    }
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

  const formatTaskTypeLabel = useCallback((taskType: Task['type']): string => {
    return sharedFormatTaskTypeLabel(taskType);
  }, []);

  const normalizeUserKeysForComparison = useCallback((events: KeystrokeEvent[]): string[] => {
    const modifierKeys = new Set(['Shift', 'Control', 'Alt', 'Meta']);
    return events
      .map((event) => event.key)
      .filter((key) => !modifierKeys.has(key));
  }, []);

  const expandRecommendedSequence = useCallback((recommendedSequence: string[]): string[] => {
    return sharedExpandRecommendedSequence(recommendedSequence);
  }, []);

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
      default:
        return 'Edit blocked by task constraints.';
    }
  }, []);

  const handleBlockedEdit = useCallback((reason: EditBlockReason) => {
    setBlockedEditHint(getBlockedEditHint(reason));
    if (blockedHintTimerRef.current !== null) {
      window.clearTimeout(blockedHintTimerRef.current);
    }
    blockedHintTimerRef.current = window.setTimeout(() => {
      setBlockedEditHint(null);
      blockedHintTimerRef.current = null;
    }, 2400);
  }, [getBlockedEditHint]);

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
    if (keyLabel) {
      setRecentKeys((prev) => [...prev, keyLabel].slice(-40));
    }
  }, [formatKeyLabel, isSessionComplete]);

  // Start practice session when user clicks Ready
  const handleReady = useCallback(() => {
    setIsReady(true);
  }, []);

  // Setup a task in the editor (replace doc + configure highlights)
  const setupTaskInEditor = useCallback((task: Task) => {
    const view = editorRef.current?.view;
    if (!view) return;
    setBlockedEditHint(null);

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

  const resetPracticeRunState = useCallback(() => {
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
    setSummaryTaskCompletion({});
    setSummaryTaskResetTokens({});
  }, []);

  // Fetch a new practice session (state only — task setup handled by effect)
  const fetchPracticeSession = useCallback(async () => {
    if (isFetchingPracticeSessionRef.current) return;
    isFetchingPracticeSessionRef.current = true;
    try {
      const response = await fetch(`${API_BASE}/api/task/practice`);
      const data = (await response.json()) as PracticeSessionResponse;

      setTasks(data.tasks);
      setNumTasks(data.numTasks);
      resetPracticeRunState();
    } catch (error) {
      console.error('Failed to fetch practice session:', error);
    } finally {
      isFetchingPracticeSessionRef.current = false;
    }
  }, [resetPracticeRunState]);

  const restartSameTasks = useCallback(() => {
    const sameTasks = tasksRef.current;
    if (sameTasks.length === 0) {
      void fetchPracticeSession();
      return;
    }

    setNumTasks(sameTasks.length);
    resetPracticeRunState();
    setupTaskInEditor(sameTasks[0]!);
    editorRef.current?.view?.focus();
  }, [fetchPracticeSession, resetPracticeRunState, setupTaskInEditor]);

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

    setTasks(incoming);
    setNumTasks(incoming.length);
    resetPracticeRunState();
    setIsReady(true);
  }, [locationState, resetPracticeRunState]);

  // Prefetch practice tasks on page load so Ready can start immediately.
  useEffect(() => {
    const incoming = locationState?.tasks;
    if (incoming && incoming.length > 0) return;
    if (tasks.length > 0) return;
    void fetchPracticeSession();
  }, [locationState, tasks.length, fetchPracticeSession]);

  // Trigger initial fetch when user clicks Ready (only if no preloaded tasks)
  useEffect(() => {
    if (isReady && tasks.length === 0) {
      fetchPracticeSession();
    }
  }, [isReady, tasks.length, fetchPracticeSession]);

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
      const keyLabels = eventsSnapshot
        .map((event) => formatKeyLabel(event.key))
        .filter((label): label is string => Boolean(label));
      const visibleKeyCount = 30;
      const keySequence = keyLabels.length <= visibleKeyCount
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
        const displayOptimalKeys = expandedOptimalKeys.map((key) => (key === ' ' ? 'Space' : key));
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
      setSummaryTaskCompletion((prev) => ({
        ...prev,
        [completedTask.id]: false,
      }));
      setSummaryTaskResetTokens((prev) => ({
        ...prev,
        [completedTask.id]: 0,
      }));

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
  }, [
    expandRecommendedSequence,
    formatKeysForDisplay,
    formatKeyLabel,
    normalizeUserKeysForComparison,
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
  const summaryAverages = useMemo(() => {
    const count = taskSummaries.length;
    if (count === 0) return null;

    let totalDurationMs = 0;
    let totalKeys = 0;
    let totalKeysPerSecond = 0;
    let totalDiscrepancy = 0;
    let discrepancyCount = 0;

    for (const summary of taskSummaries) {
      totalDurationMs += summary.durationMs;
      totalKeys += summary.keyCount;
      totalKeysPerSecond += summary.durationMs > 0 ? summary.keyCount / (summary.durationMs / 1000) : 0;
      if (typeof summary.ourSolutionKeyCount === 'number') {
        // +x means user's solution is x keys shorter than ours.
        totalDiscrepancy += summary.ourSolutionKeyCount - summary.keyCount;
        discrepancyCount += 1;
      }
    }

    return {
      keysPerSecond: totalKeysPerSecond / count,
      durationMs: Math.round(totalDurationMs / count),
      keys: Math.round(totalKeys / count),
      discrepancy:
        discrepancyCount > 0 ? totalDiscrepancy / discrepancyCount : null,
    };
  }, [taskSummaries]);

  const recentKeysDisplay = useMemo(() => {
    if (recentKeys.length === 0) return '';
    return recentKeys.slice(-KEY_LOG_VISIBLE_KEYS).join(' ');
  }, [recentKeys]);

  // Task type display
  const getTaskTypeDisplay = (task: Task | null) => {
    if (!task) return { label: 'Loading...' };
    if (task.type === 'navigate') return { label: 'Navigate to target' };
    return { label: 'Delete the highlighted text' };
  };

  const taskDisplay = getTaskTypeDisplay(currentTask);

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
      <div
        style={
          showCheatSheet && !isSessionComplete
            ? {
                ...styles.raceContainer,
                marginLeft: RACE_CONTAINER_LEFT_WITH_CHEATSHEET,
                marginRight: 'auto',
              }
            : {
                ...styles.raceContainer,
                ...(isSessionComplete ? { maxWidth: '1500px' } : {}),
                marginLeft: 'auto',
                marginRight: 'auto',
              }
        }
      >
        {!isSessionComplete && showCheatSheet && (
          <div style={styles.leftCheatSheetDock}>
            <div style={styles.leftCheatSheetPanel}>
              <div style={styles.leftCheatSheetHeader}>
                <div style={{ ...styles.cheatSheetTitle, marginBottom: 0 }}>Cheat Sheet</div>
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
                  <div style={styles.cheatSheetSectionTitle}>{section.title}</div>
                  {section.items.map((item) => (
                    <div key={`${section.title}-${item.keys}`} style={styles.cheatSheetRow}>
                      <div style={styles.cheatSheetKeys}>{item.keys}</div>
                      <div style={styles.cheatSheetDescription}>{item.description}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
        {!isSessionComplete && (
          <div style={styles.header}>
            <div style={styles.title}>VIM_GYM - Practice</div>
            <div style={styles.timer}>{formatTime(elapsedTime)}</div>
            <button style={styles.exitButton} onClick={() => navigate('/')}>
              Exit
            </button>
          </div>
        )}

        {isSessionComplete ? (
          <div style={styles.sessionComplete}>
            <div style={styles.completeTitle}>Practice Summary</div>
            <div style={styles.summaryOverview}>
              <div style={styles.summaryOverviewLabelRow}>
                <span style={styles.summaryOverviewLabel}>Total Time</span>
                <span style={styles.summaryOverviewLabel}>Avg Keys/s</span>
                <span style={styles.summaryOverviewLabel}>Avg Duration</span>
                <span style={styles.summaryOverviewLabel}>Avg Keys</span>
                <span style={styles.summaryOverviewLabel}>Avg Discrepancy</span>
              </div>
              <div style={styles.summaryOverviewValueRow}>
                <span style={{ ...styles.summaryOverviewValue, color: '#ffffff' }}>{formatTime(finalTime)}</span>
                <span style={{ ...styles.summaryOverviewValue, color: '#ffffff' }}>
                  {summaryAverages ? summaryAverages.keysPerSecond.toFixed(2) : '--'}
                </span>
                <span style={{ ...styles.summaryOverviewValue, color: '#ffffff' }}>
                  {summaryAverages ? formatTime(summaryAverages.durationMs) : '--'}
                </span>
                <span style={{ ...styles.summaryOverviewValue, color: '#ffffff' }}>
                  {summaryAverages?.keys ?? '--'}
                </span>
                <span style={{ ...styles.summaryOverviewValue, color: '#ffffff' }}>
                  {summaryAverages && summaryAverages.discrepancy !== null
                    ? `${summaryAverages.discrepancy >= 0 ? '+' : ''}${summaryAverages.discrepancy.toFixed(1)}`
                    : '--'}
                </span>
              </div>
            </div>
            <div style={styles.completeButtons}>
              <button style={styles.completeButton} onClick={restartSameTasks}>
                Restart Same Tasks
              </button>
              <button style={styles.homeButton} onClick={fetchPracticeSession}>
                Restart
              </button>
              <button style={styles.homeButton} onClick={() => navigate('/')}>
                Home
              </button>
            </div>
            <div style={styles.summaryList}>
              {taskSummaries.length === 0 && (
                <div style={{ ...styles.summaryEmpty, gridColumn: '1 / -1' }}>No task details recorded for this run.</div>
              )}
              {taskSummaries.map((summary, index) => {
                const keysPerSecond = summary.durationMs > 0
                  ? (summary.keyCount / (summary.durationMs / 1000)).toFixed(2)
                  : '0.00';
                const isDeleteTask = summary.taskType === 'delete';
                const hasComparison = typeof summary.ourSolutionKeyCount === 'number';
                const userKeyCount = summary.keyCount;
                const ourKeyCount = summary.ourSolutionKeyCount ?? 0;
                const discrepancy = hasComparison ? ourKeyCount - userKeyCount : 0;
                const positiveDiscrepancy = hasComparison && discrepancy > 0;
                const negativeDiscrepancy = hasComparison && discrepancy < 0;
                const comparisonStyle: React.CSSProperties = hasComparison
                  ? positiveDiscrepancy
                    ? {
                        ...styles.summaryComparisonBox,
                        border: '1px solid #22c55e60',
                        background: '#22c55e20',
                      }
                    : negativeDiscrepancy
                      ? {
                          ...styles.summaryComparisonBox,
                          border: '1px solid #ef444460',
                          background: '#ef444420',
                        }
                      : {
                          ...styles.summaryComparisonBox,
                          border: `1px solid ${colors.textMuted}60`,
                          background: `${colors.textMuted}20`,
                        }
                  : {
                      ...styles.summaryComparisonBox,
                      border: `1px solid ${colors.textMuted}60`,
                      background: `${colors.textMuted}20`,
                    };
                const badgeStyle: React.CSSProperties = {
                  ...styles.summaryTaskBadge,
                  border: `1px solid ${isDeleteTask ? colors.secondary : colors.primary}40`,
                  background: `${isDeleteTask ? colors.secondary : colors.primary}20`,
                  color: isDeleteTask ? colors.secondaryLight : colors.primaryLight,
                };
                const isSummaryTaskComplete = summaryTaskCompletion[summary.taskId] === true;
                return (
                  <div
                    key={summary.taskId}
                    style={isSummaryTaskComplete ? { ...styles.summaryItem, ...styles.summaryItemComplete } : styles.summaryItem}
                  >
                    {isSummaryTaskComplete && <div style={styles.summaryCompleteCheck}>✓</div>}
                    <div style={styles.summaryItemHeader}>
                      <span style={styles.summaryItemTitle}>Task {summary.taskIndex}</span>
                      <span style={badgeStyle}>{formatTaskTypeLabel(summary.taskType)}</span>
                    </div>
                    <div style={styles.summaryItemBody}>
                      <div style={styles.summaryAnalyticsColumn}>
                        <div style={styles.summaryMetaRow}>
                          <div style={{ ...styles.summaryMetaCard, ...styles.summaryMetaCardApm }}>
                            <span style={styles.summaryMetaLabel}>Keys/s</span>
                            <span style={styles.summaryMetaValue}>{keysPerSecond}</span>
                          </div>
                          <div style={{ ...styles.summaryMetaCard, ...styles.summaryMetaCardDuration }}>
                            <span style={styles.summaryMetaLabel}>Duration</span>
                            <span style={styles.summaryMetaValue}>{formatTime(summary.durationMs)}</span>
                          </div>
                          <div style={{ ...styles.summaryMetaCard, ...styles.summaryMetaCardKeys }}>
                            <span style={styles.summaryMetaLabel}>Keys</span>
                            <span style={styles.summaryMetaValue}>{summary.keyCount}</span>
                          </div>
                        </div>
                        <div style={styles.summaryKeys}>
                          <div style={styles.summaryKeysLabel}>Your Solution</div>
                          <div style={styles.summaryKeysValue}>{summary.keySequence || 'No key events recorded'}</div>
                        </div>
                        {typeof summary.ourSolutionKeyCount === 'number' && (
                          <div style={styles.summaryKeys}>
                            <div style={styles.summaryKeysLabel}>Our Solution</div>
                            <div style={styles.summaryKeysValue}>
                              {summary.optimalSequence
                                ? summary.optimalSequence
                                : 'No recommendation'}
                            </div>
                          </div>
                        )}
                        {typeof summary.ourSolutionKeyCount === 'number' && (
                          <div style={comparisonStyle}>
                            <div style={styles.summaryComparisonLabel}>Discrepancy</div>
                            <div style={styles.summaryComparisonValue}>
                              {hasComparison
                                ? `${discrepancy >= 0 ? '+' : ''}${discrepancy}`
                                : 'Comparison unavailable'}
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={styles.summaryVerticalDivider} />
                      <div style={styles.summarySnippetColumn}>
                        <div style={styles.summaryCodeBox}>
                          <SummaryTaskSandbox
                            task={summary.task}
                            resetToken={summaryTaskResetTokens[summary.taskId] ?? 0}
                            autoFocusOnMount={index === 0}
                            onCompletionChange={(isComplete) => {
                              setSummaryTaskCompletion((prev) => ({
                                ...prev,
                                [summary.taskId]: isComplete,
                              }));
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          style={styles.summaryResetButton}
                          onClick={() => {
                            setSummaryTaskCompletion((prev) => ({
                              ...prev,
                              [summary.taskId]: false,
                            }));
                            setSummaryTaskResetTokens((prev) => ({
                              ...prev,
                              [summary.taskId]: (prev[summary.taskId] ?? 0) + 1,
                            }));
                          }}
                        >
                          Reset Task
                        </button>
                      </div>
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
              </div>
              <div style={styles.taskDescription}>
                {currentTask?.description || 'Loading task...'}
              </div>
              {isTaskComplete && (
                <div style={styles.nextTaskHint}>
                  Press Enter for next task
                </div>
              )}
              <div style={styles.taskProgressInlineRow}>
                <span>Tasks Completed</span>
                <span style={{ color: colors.primaryLight }}>
                  {taskProgress + (isTaskComplete ? 1 : 0)}/{numTasks}
                </span>
              </div>
              <div style={styles.progressBar}>
                <div style={{ ...styles.progressFill, width: `${progressPercent}%` }} />
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
                  <button
                    style={styles.resetTaskButton}
                    onClick={resetCurrentTask}
                  >
                    Reset (F6)
                  </button>
                )}
              </div>

              {/* Sidebar */}
              <div style={styles.sidebarColumn}>
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
                  <div style={styles.blockedEditHint}>
                    {blockedEditHint ?? '\u00A0'}
                  </div>
                </div>

                <div style={styles.sidebarControls}>
                  <button
                    type="button"
                    style={{
                      ...styles.sidebarControlButton,
                      ...styles.sidebarControlButtonCheckable,
                    }}
                    onClick={() => setShowCheatSheet((prev) => !prev)}
                  >
                    <span style={styles.sidebarControlButtonLabel}>Cheatsheet</span>
                    {showCheatSheet && <span style={styles.sidebarToggleCheck}>✓</span>}
                  </button>

                  <button
                    style={{
                      ...styles.sidebarControlButton,
                      ...styles.sidebarControlButtonCheckable,
                    }}
                    onClick={toggleRelativeLineNumbers}
                  >
                    <span style={styles.sidebarControlButtonLabel}>Relative Lines</span>
                    {relativeLineNumbers && <span style={styles.sidebarToggleCheck}>✓</span>}
                  </button>

                  <div style={styles.sidebarActionsRow}>
                    <button
                      style={{ ...styles.sidebarControlButton, ...styles.sidebarActionNewTasks }}
                      onClick={fetchPracticeSession}
                    >
                      <span style={styles.sidebarControlButtonLabel}>New Tasks</span>
                    </button>

                    <button
                      style={{ ...styles.sidebarControlButton, ...styles.sidebarActionSameTasks }}
                      onClick={restartSameTasks}
                    >
                      <span style={styles.sidebarControlButtonLabel}>Same Tasks</span>
                    </button>
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

export default PracticeEditor;
