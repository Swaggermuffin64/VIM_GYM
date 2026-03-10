import React, { useMemo, useState } from 'react';

import type { TaskSummary } from '../types/task';
import { formatTaskTypeLabel } from '../utils/keyFormatting';
import { computeTaskSummaryAverages } from '../utils/taskSummaries';
import { SummaryTaskSandbox } from './SummaryTaskSandbox';
import { editorColors as colors } from './VimRaceEditor';

interface TaskReviewOverlayProps {
  taskSummaries: TaskSummary[];
  totalTime: number;
  onBack: () => void;
  onPracticeTasks?: () => void;
  onPlayAgain?: () => void;
}

const formatTime = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${seconds}.${tenths}s`;
};

export const TaskReviewOverlay: React.FC<TaskReviewOverlayProps> = ({
  taskSummaries,
  totalTime,
  onBack,
  onPracticeTasks,
  onPlayAgain,
}) => {
  const [taskCompletion, setTaskCompletion] = useState<Record<string, boolean>>({});
  const [taskResetTokens, setTaskResetTokens] = useState<Record<string, number>>({});

  const averages = useMemo(() => computeTaskSummaryAverages(taskSummaries), [taskSummaries]);

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.title}>Task Review</div>
          <div style={styles.headerButtons}>
            {onPracticeTasks && (
              <button style={styles.practiceButton} onClick={onPracticeTasks}>
                Practice These Tasks
              </button>
            )}
            {onPlayAgain && (
              <button style={styles.backButton} onClick={onPlayAgain}>
                Play Again
              </button>
            )}
            <button style={styles.backButton} onClick={onBack}>
              Back to Results
            </button>
          </div>
        </div>

        <div style={styles.overviewPanel}>
          <div style={styles.overviewLabelRow}>
            <span style={styles.overviewLabel}>Total Time</span>
            <span style={styles.overviewLabel}>Duration/Task</span>
            <span style={styles.overviewLabel}>Keys/s</span>
            <span style={styles.overviewLabel}>Keys/Task</span>
            <span style={styles.overviewLabel}>Avg Discrepancy</span>
          </div>
          <div style={styles.overviewValueRow}>
            <span style={styles.overviewValue}>{formatTime(totalTime)}</span>
            <span style={styles.overviewValue}>
              {averages ? formatTime(averages.durationMs) : '--'}
            </span>
            <span style={styles.overviewValue}>
              {averages ? averages.keysPerSecond.toFixed(2) : '--'}
            </span>
            <span style={styles.overviewValue}>
              {averages?.keys ?? '--'}
            </span>
            <span style={styles.overviewValue}>
              {averages && averages.discrepancy !== null
                ? `${averages.discrepancy >= 0 ? '+' : ''}${averages.discrepancy.toFixed(1)}`
                : '--'}
            </span>
          </div>
        </div>

        <div style={styles.taskList}>
          {taskSummaries.length === 0 && (
            <div style={styles.empty}>No task details recorded for this race.</div>
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
                ? { ...styles.comparisonBox, border: '1px solid #22c55e60', background: '#22c55e20' }
                : negativeDiscrepancy
                  ? { ...styles.comparisonBox, border: '1px solid #ef444460', background: '#ef444420' }
                  : { ...styles.comparisonBox, border: `1px solid ${colors.textMuted}60`, background: `${colors.textMuted}20` }
              : { ...styles.comparisonBox, border: `1px solid ${colors.textMuted}60`, background: `${colors.textMuted}20` };
            const badgeStyle: React.CSSProperties = {
              ...styles.taskBadge,
              border: `1px solid ${isDeleteTask ? colors.secondary : colors.primary}40`,
              background: `${isDeleteTask ? colors.secondary : colors.primary}20`,
              color: isDeleteTask ? colors.secondaryLight : colors.primaryLight,
            };
            const isComplete = taskCompletion[summary.taskId] === true;

            return (
              <div
                key={summary.taskId}
                style={isComplete ? { ...styles.taskItem, ...styles.taskItemComplete } : styles.taskItem}
              >
                {isComplete && <div style={styles.completeCheck}>✓</div>}
                <div style={styles.taskHeader}>
                  <span style={styles.taskTitle}>Task {summary.taskIndex}</span>
                  <span style={badgeStyle}>{formatTaskTypeLabel(summary.taskType)}</span>
                </div>
                <div style={styles.taskBody}>
                  <div style={styles.analyticsColumn}>
                    <div style={styles.metaRow}>
                      <div style={{ ...styles.metaCard, borderColor: `${colors.primary}60`, background: `${colors.primary}16` }}>
                        <span style={styles.metaLabel}>Keys/s</span>
                        <span style={styles.metaValue}>{keysPerSecond}</span>
                      </div>
                      <div style={{ ...styles.metaCard, borderColor: `${colors.secondary}60`, background: `${colors.secondary}16` }}>
                        <span style={styles.metaLabel}>Duration</span>
                        <span style={styles.metaValue}>{formatTime(summary.durationMs)}</span>
                      </div>
                      <div style={{ ...styles.metaCard, borderColor: `${colors.warning}60`, background: `${colors.warning}16` }}>
                        <span style={styles.metaLabel}>Keys</span>
                        <span style={styles.metaValue}>{summary.keyCount}</span>
                      </div>
                    </div>
                    <div style={styles.keysBox}>
                      <div style={styles.keysLabel}>Your Solution</div>
                      <div style={styles.keysValue}>{summary.keySequence || 'No key events recorded'}</div>
                    </div>
                    {typeof summary.ourSolutionKeyCount === 'number' && (
                      <div style={styles.keysBox}>
                        <div style={styles.keysLabel}>Our Solution</div>
                        <div style={styles.keysValue}>
                          {summary.optimalSequence || 'No recommendation'}
                        </div>
                      </div>
                    )}
                    {typeof summary.ourSolutionKeyCount === 'number' && (
                      <div style={comparisonStyle}>
                        <div style={styles.comparisonLabel}>Discrepancy</div>
                        <div style={styles.comparisonValue}>
                          {hasComparison
                            ? `${discrepancy >= 0 ? '+' : ''}${discrepancy}`
                            : 'Comparison unavailable'}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={styles.verticalDivider} />
                  <div style={styles.snippetColumn}>
                    <div style={styles.codeBox}>
                      <SummaryTaskSandbox
                        task={summary.task}
                        resetToken={taskResetTokens[summary.taskId] ?? 0}
                        autoFocusOnMount={index === 0}
                        onCompletionChange={(complete) => {
                          setTaskCompletion((prev) => ({ ...prev, [summary.taskId]: complete }));
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      style={styles.resetButton}
                      onClick={() => {
                        setTaskCompletion((prev) => ({ ...prev, [summary.taskId]: false }));
                        setTaskResetTokens((prev) => ({
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
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(10, 10, 15, 0.97)',
    display: 'flex',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
    overflowY: 'auto',
  },
  container: {
    width: '100%',
    maxWidth: '1200px',
    padding: '40px 24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    fontFamily: '"JetBrains Mono", monospace',
    color: colors.textPrimary,
    textShadow: `0 0 20px ${colors.primaryGlow}`,
  },
  headerButtons: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
  },
  practiceButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 600,
    background: `${colors.primary}20`,
    border: `1px solid ${colors.primary}60`,
    borderRadius: '8px',
    color: colors.primaryLight,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
  playAgainButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 600,
    background: `${colors.success}20`,
    border: `1px solid ${colors.success}60`,
    borderRadius: '8px',
    color: colors.successLight,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
  backButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 600,
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    color: colors.textSecondary,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
  overviewPanel: {
    width: '100%',
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    background: colors.bgCard,
    padding: '16px 18px',
    marginBottom: '24px',
  },
  overviewLabelRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
    gap: '8px',
    marginBottom: '8px',
  },
  overviewValueRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
    gap: '8px',
  },
  overviewLabel: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
  },
  overviewValue: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '24px',
    fontWeight: 700,
    color: '#ffffff',
  },
  taskList: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '16px',
  },
  taskItem: {
    position: 'relative' as const,
    border: `1px solid ${colors.border}`,
    background: colors.bgCard,
    borderRadius: '10px',
    padding: '18px',
    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.25)',
  },
  taskItemComplete: {
    border: `1px solid ${colors.success}60`,
    boxShadow: `0 0 16px ${colors.success}25, inset 0 1px 0 rgba(255,255,255,0.05)`,
  },
  completeCheck: {
    position: 'absolute' as const,
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
  taskHeader: {
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: '70px',
    marginBottom: '8px',
  },
  taskTitle: {
    fontFamily: '"JetBrains Mono", monospace',
    color: colors.textPrimary,
    fontSize: '24px',
    fontWeight: 600,
  },
  taskBadge: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.8px',
    padding: '7px 13px',
    borderRadius: '999px',
  },
  taskBody: {
    display: 'flex',
    alignItems: 'stretch',
    gap: '14px',
    flexWrap: 'wrap' as const,
  },
  analyticsColumn: {
    flex: '1 1 360px',
    minWidth: '320px',
  },
  verticalDivider: {
    width: '1px',
    alignSelf: 'stretch',
    background: colors.border,
  },
  snippetColumn: {
    flex: '1 1 420px',
    minWidth: '360px',
    paddingLeft: '14px',
  },
  metaRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '10px',
    marginBottom: '8px',
  },
  metaCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    border: `1px solid ${colors.border}`,
    background: colors.bgCard,
    borderRadius: '8px',
    padding: '8px 10px',
  },
  metaLabel: {
    color: '#cbd5e1',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '12px',
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
  },
  metaValue: {
    color: '#ffffff',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '20px',
    fontWeight: 700,
  },
  keysBox: {
    border: '1px solid rgba(255, 255, 255, 0.35)',
    background: '#000000',
    borderRadius: '8px',
    padding: '10px 12px',
    marginBottom: '10px',
  },
  keysLabel: {
    color: '#cbd5e1',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
    marginBottom: '4px',
  },
  keysValue: {
    color: '#ffffff',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '22px',
    lineHeight: 1.55,
    fontWeight: 700,
  },
  comparisonBox: {
    width: '50%',
    borderRadius: '8px',
    padding: '10px 12px',
    marginBottom: '10px',
    border: '1px solid transparent',
  },
  comparisonLabel: {
    color: '#cbd5e1',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
    marginBottom: '4px',
  },
  comparisonValue: {
    color: '#ffffff',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '20px',
    lineHeight: 1.4,
    fontWeight: 700,
  },
  empty: {
    color: colors.textMuted,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '16px',
  },
  codeBox: {
    background: '#282c34',
    border: '1px solid #3e4451',
    borderRadius: '8px',
    overflowX: 'auto' as const,
    overflowY: 'hidden' as const,
  },
  resetButton: {
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
};
