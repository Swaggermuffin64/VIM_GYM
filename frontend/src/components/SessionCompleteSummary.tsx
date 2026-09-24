import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Task, TaskSummary } from '../types/task';
import type {
  RaceCompletionInfo,
  RaceSessionConfig,
} from '../racing/raceSessionConfig';
import { formatTaskTypeLabel } from '../utils/keyFormatting';
import { editorColors as colors } from './VimRaceEditor';
import { SummaryTaskSandbox } from './SummaryTaskSandbox';

/**
 * Post-race results view shared by practice and daily modes, rendered by
 * RaceSessionPage once every task is done. Always shows the mode's completion
 * extras (via config.renderCompletionExtras). Everything else — the aggregate
 * stats row, the restart/home buttons, and the per-task breakdown of
 * solutions, discrepancies, and replay sandboxes — only appears when
 * config.showTaskBreakdown is true (practice); daily's end screen is
 * deliberately just its extras: attempt times, share, back to leaderboard.
 */
export function SessionCompleteSummary({
  config,
  completionInfo,
  isAwaitingCompletionInfo = false,
  finalTimeMs,
  taskSummaries,
  onRestartSameTasks,
  onRestartNewTasks,
}: {
  config: RaceSessionConfig;
  completionInfo: RaceCompletionInfo | null;
  /** True while submitCompletion is still running, so completionInfo is not final. */
  isAwaitingCompletionInfo?: boolean;
  finalTimeMs: number;
  taskSummaries: TaskSummary[];
  onRestartSameTasks: () => void;
  onRestartNewTasks: () => void;
}) {
  const navigate = useNavigate();

  // Per-task replay-sandbox state: whether the user re-solved each task, and
  // a bump token that resets a sandbox. Missing keys mean "not complete" / 0.
  const [taskCompletion, setTaskCompletion] = useState<Record<string, boolean>>(
    {}
  );
  const [taskResetTokens, setTaskResetTokens] = useState<
    Record<string, number>
  >({});

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
      totalKeysPerSecond +=
        summary.durationMs > 0
          ? summary.keyCount / (summary.durationMs / 1000)
          : 0;
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

  // Daily mode has no task breakdown or stats row to fill the page, so it
  // renders as a small centered results card instead of the wide top-aligned
  // layout practice mode uses to make room for its task list.
  const compact = !config.showTaskBreakdown;

  const leaderboardRanks =
    completionInfo?.kind === 'practice' ? completionInfo.ranks : null;
  const rankBadges: Array<{ label: string; rank: number }> = [];
  if (leaderboardRanks?.weekly != null)
    rankBadges.push({ label: 'This Week', rank: leaderboardRanks.weekly });
  if (leaderboardRanks?.monthly != null)
    rankBadges.push({ label: 'This Month', rank: leaderboardRanks.monthly });
  if (leaderboardRanks?.allTime != null)
    rankBadges.push({ label: 'All Time', rank: leaderboardRanks.allTime });

  return (
    <div style={compact ? styles.sessionCompleteCompactOuter : undefined}>
      <div
        style={
          compact ? styles.sessionCompleteCompactCard : styles.sessionComplete
        }
      >
        <div
          style={
            compact
              ? { ...styles.completeTitle, ...styles.compactCenteredText }
              : styles.completeTitle
          }
        >
          {config.summaryTitle}
        </div>
        {config.showTaskBreakdown && (
          <div style={styles.summaryOverview}>
            <div style={styles.summaryOverviewLabelRow}>
              <span style={styles.summaryOverviewLabel}>Total Time</span>
              <span style={styles.summaryOverviewLabel}>Avg Keys/s</span>
              <span style={styles.summaryOverviewLabel}>Avg Duration</span>
              <span style={styles.summaryOverviewLabel}>Avg Keys</span>
              <span style={styles.summaryOverviewLabel}>Avg Discrepancy</span>
            </div>
            <div style={styles.summaryOverviewValueRow}>
              <span
                style={{ ...styles.summaryOverviewValue, color: '#ffffff' }}
              >
                {formatTime(finalTimeMs)}
              </span>
              <span
                style={{ ...styles.summaryOverviewValue, color: '#ffffff' }}
              >
                {summaryAverages
                  ? summaryAverages.keysPerSecond.toFixed(2)
                  : '--'}
              </span>
              <span
                style={{ ...styles.summaryOverviewValue, color: '#ffffff' }}
              >
                {summaryAverages
                  ? formatTime(summaryAverages.durationMs)
                  : '--'}
              </span>
              <span
                style={{ ...styles.summaryOverviewValue, color: '#ffffff' }}
              >
                {summaryAverages?.keys ?? '--'}
              </span>
              <span
                style={{ ...styles.summaryOverviewValue, color: '#ffffff' }}
              >
                {summaryAverages && summaryAverages.discrepancy !== null
                  ? `${summaryAverages.discrepancy >= 0 ? '+' : ''}${summaryAverages.discrepancy.toFixed(1)}`
                  : '--'}
              </span>
            </div>
          </div>
        )}
        {rankBadges.length > 0 && (
          <div style={styles.rankBadgeRow}>
            {rankBadges.map((badge) => (
              <span key={badge.label} style={styles.rankBadge}>
                #{badge.rank} {badge.label}
              </span>
            ))}
          </div>
        )}
        {config.renderCompletionExtras?.(
          completionInfo,
          finalTimeMs,
          isAwaitingCompletionInfo
        )}
        {config.showTaskBreakdown && (
          <div style={styles.completeButtons}>
            {config.allowSameTasksReplay && (
              <button
                style={styles.completeButton}
                onClick={onRestartSameTasks}
              >
                Restart Same Tasks
              </button>
            )}
            {config.allowNewTasks && (
              <button style={styles.homeButton} onClick={onRestartNewTasks}>
                Restart
              </button>
            )}
            <button style={styles.homeButton} onClick={() => navigate('/')}>
              Home
            </button>
          </div>
        )}
        {config.showTaskBreakdown && (
          <div style={styles.summaryList}>
            {taskSummaries.length === 0 && (
              <div style={{ ...styles.summaryEmpty, gridColumn: '1 / -1' }}>
                No task details recorded for this run.
              </div>
            )}
            {taskSummaries.map((summary, index) => (
              <TaskBreakdownItem
                key={summary.taskId}
                summary={summary}
                isFirst={index === 0}
                isReplayComplete={taskCompletion[summary.taskId] === true}
                resetToken={taskResetTokens[summary.taskId] ?? 0}
                onReplayCompletionChange={(isComplete) => {
                  setTaskCompletion((prev) => ({
                    ...prev,
                    [summary.taskId]: isComplete,
                  }));
                }}
                onReset={() => {
                  setTaskCompletion((prev) => ({
                    ...prev,
                    [summary.taskId]: false,
                  }));
                  setTaskResetTokens((prev) => ({
                    ...prev,
                    [summary.taskId]: (prev[summary.taskId] ?? 0) + 1,
                  }));
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One task's card in the breakdown list: per-task stats, the user's key
 * sequence vs. our recommended solution, the key-count discrepancy, and a
 * live sandbox to replay the task.
 */
function TaskBreakdownItem({
  summary,
  isFirst,
  isReplayComplete,
  resetToken,
  onReplayCompletionChange,
  onReset,
}: {
  summary: TaskSummary;
  isFirst: boolean;
  isReplayComplete: boolean;
  resetToken: number;
  onReplayCompletionChange: (isComplete: boolean) => void;
  onReset: () => void;
}) {
  const keysPerSecond =
    summary.durationMs > 0
      ? (summary.keyCount / (summary.durationMs / 1000)).toFixed(2)
      : '0.00';
  const isDeleteTask = summary.taskType === 'delete';
  const hasComparison = typeof summary.ourSolutionKeyCount === 'number';
  const userKeyCount = summary.keyCount;
  const ourKeyCount = summary.ourSolutionKeyCount ?? 0;
  const discrepancy = hasComparison ? ourKeyCount - userKeyCount : 0;
  const positiveDiscrepancy = hasComparison && discrepancy > 0;
  const negativeDiscrepancy = hasComparison && discrepancy < 0;
  const comparisonStyle: React.CSSProperties = positiveDiscrepancy
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
        };
  const badgeStyle: React.CSSProperties = {
    ...styles.summaryTaskBadge,
    border: `1px solid ${isDeleteTask ? colors.secondary : colors.primary}40`,
    background: `${isDeleteTask ? colors.secondary : colors.primary}20`,
    color: isDeleteTask ? colors.secondaryLight : colors.primaryLight,
  };

  return (
    <div
      style={
        isReplayComplete
          ? { ...styles.summaryItem, ...styles.summaryItemComplete }
          : styles.summaryItem
      }
    >
      {isReplayComplete && <div style={styles.summaryCompleteCheck}>✓</div>}
      <div style={styles.summaryItemHeader}>
        <span style={styles.summaryItemTitle}>Task {summary.taskIndex}</span>
        <span style={badgeStyle}>
          {formatTaskTypeLabel(summary.taskType as Task['type'])}
        </span>
      </div>
      <div style={styles.summaryItemBody}>
        <div style={styles.summaryAnalyticsColumn}>
          <div style={styles.summaryMetaRow}>
            <div
              style={{
                ...styles.summaryMetaCard,
                ...styles.summaryMetaCardApm,
              }}
            >
              <span style={styles.summaryMetaLabel}>Keys/s</span>
              <span style={styles.summaryMetaValue}>{keysPerSecond}</span>
            </div>
            <div
              style={{
                ...styles.summaryMetaCard,
                ...styles.summaryMetaCardDuration,
              }}
            >
              <span style={styles.summaryMetaLabel}>Duration</span>
              <span style={styles.summaryMetaValue}>
                {formatTime(summary.durationMs)}
              </span>
            </div>
            <div
              style={{
                ...styles.summaryMetaCard,
                ...styles.summaryMetaCardKeys,
              }}
            >
              <span style={styles.summaryMetaLabel}>Keys</span>
              <span style={styles.summaryMetaValue}>{summary.keyCount}</span>
            </div>
          </div>
          <div style={styles.summaryKeys}>
            <div style={styles.summaryKeysLabel}>Your Solution</div>
            <div style={styles.summaryKeysValue}>
              {summary.keySequence || 'No key events recorded'}
            </div>
          </div>
          {hasComparison && (
            <div style={styles.summaryKeys}>
              <div style={styles.summaryKeysLabel}>Our Solution</div>
              <div style={styles.summaryKeysValue}>
                {summary.optimalSequence
                  ? summary.optimalSequence
                  : 'No recommendation'}
              </div>
            </div>
          )}
          {hasComparison && (
            <div style={comparisonStyle}>
              <div style={styles.summaryComparisonLabel}>Discrepancy</div>
              <div style={styles.summaryComparisonValue}>
                {`${discrepancy >= 0 ? '+' : ''}${discrepancy}`}
              </div>
            </div>
          )}
        </div>
        <div style={styles.summaryVerticalDivider} />
        <div style={styles.summarySnippetColumn}>
          <div style={styles.summaryCodeBox}>
            <SummaryTaskSandbox
              task={summary.task}
              resetToken={resetToken}
              autoFocusOnMount={isFirst}
              onCompletionChange={onReplayCompletionChange}
            />
          </div>
          <button
            type="button"
            style={styles.summaryResetButton}
            onClick={onReset}
          >
            Reset Task
          </button>
        </div>
      </div>
    </div>
  );
}

/** Format milliseconds as "12.3s" to match the in-race timer. */
function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${seconds}.${tenths}s`;
}

const styles: Record<string, React.CSSProperties> = {
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
  // Compact layout (daily mode): one big results card centered in the
  // viewport, rather than the top-aligned box practice uses to make room for
  // its task list. "Compact" is about content, not size — the card is large
  // and vertically centered so the short daily summary is the whole screen
  // instead of a small tile stranded in a sea of empty space.
  sessionCompleteCompactOuter: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'calc(100vh - 180px)',
  },
  sessionCompleteCompactCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: '720px',
    minHeight: 'min(470px, calc(100vh - 200px))',
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: '16px',
    padding: '48px 56px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
  },
  compactCenteredText: {
    textAlign: 'center' as const,
    marginBottom: '20px',
  },
  completeTitle: {
    fontSize: '38px',
    fontWeight: 700,
    color: colors.textPrimary,
    marginBottom: '16px',
    fontFamily: '"JetBrains Mono", monospace',
    textShadow: `0 0 20px ${colors.primaryGlow}`,
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
  // One column per stat: total time, keys/s, duration, keys, discrepancy.
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
  rankBadgeRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap' as const,
    marginTop: '14px',
  },
  rankBadge: {
    fontSize: '14px',
    fontWeight: 700,
    padding: '6px 14px',
    borderRadius: '999px',
    background: `${colors.success}20`,
    border: `1px solid ${colors.success}60`,
    color: colors.successLight,
    fontFamily: '"JetBrains Mono", monospace',
    letterSpacing: '0.3px',
  },
  completeButton: {
    padding: '16px 36px',
    fontSize: '19px',
    fontWeight: 600,
    color: colors.bgDark,
    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    boxShadow: `0 0 20px ${colors.primaryGlow}`,
  },
  homeButton: {
    padding: '16px 36px',
    fontSize: '19px',
    fontWeight: 600,
    color: colors.textSecondary,
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
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
    marginTop: '8px',
  },
};
