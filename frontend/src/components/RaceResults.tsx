import React from 'react';
import type { Ranking } from '../types/multiplayer';
import type { PlayerTaskAverages } from '../utils/taskSummaries';
import { formatTenthsDuration } from '../utils/taskSummaries';

interface RaceResultsProps {
  rankings: Ranking[];
  myPlayerId: string | null;
  raceComplete?: boolean;
  playerAveragesById?: Record<string, PlayerTaskAverages>;
  onPlayAgain: () => void;
  onLeave: () => void;
  onReviewTasks?: () => void;
}

const colors = {
  bgDark: '#0a0a0f',
  bgGradientStart: '#0f172a',
  bgGradientEnd: '#1e1b4b',
  
  accent: '#a78bfa',
  accentLight: '#c4b5fd',
  accentGlow: 'rgba(167, 139, 250, 0.25)',
  
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  
  border: '#334155',
  success: '#22c55e',
  successLight: '#86efac',
  
  gold: '#fbbf24',
  silver: '#94a3b8',
  bronze: '#d97706',
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(10, 10, 15, 0.95)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
  },
  container: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '20px',
    padding: '36px',
    maxWidth: '760px',
    width: '100%',
    textAlign: 'center' as const,
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    marginBottom: '8px',
    fontFamily: '"JetBrains Mono", monospace',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: '15px',
    color: colors.textSecondary,
    marginBottom: '18px',
  },
  tableWrap: {
    width: '100%',
    marginBottom: '22px',
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    overflow: 'hidden',
    background: `${colors.accent}08`,
  },
  tableHeader: {
    display: 'grid',
    background: `${colors.accent}12`,
    borderBottom: `1px solid ${colors.border}`,
  },
  headerCell: {
    padding: '10px 12px',
    textAlign: 'left' as const,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '11px',
    letterSpacing: '0.7px',
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
  },
  tableBody: {
    display: 'grid',
    gridTemplateColumns: '1fr',
  },
  row: {
    display: 'grid',
    borderBottom: `1px solid ${colors.border}`,
  },
  rowLast: {
    borderBottom: 'none',
  },
  rowTitle: {
    padding: '12px',
    textAlign: 'left' as const,
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '13px',
    fontWeight: 600,
  },
  statValue: {
    padding: '12px',
    textAlign: 'left' as const,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '14px',
    fontWeight: 700,
    color: colors.textPrimary,
  },
  statValueBetter: {
    color: '#6ee7b7',
  },
  playerHeader: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  positionTag: {
    fontSize: '12px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '999px',
    border: `1px solid ${colors.border}`,
  },
  playerName: {
    color: colors.textPrimary,
  },
  buttons: {
    display: 'flex',
    gap: '12px',
  },
  button: {
    flex: 1,
    padding: '14px 24px',
    fontSize: '14px',
    fontWeight: 600,
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
  primaryButton: {
    background: `${colors.success}24`,
    border: `1px solid ${colors.success}66`,
    color: colors.successLight,
  },
  secondaryButton: {
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    color: colors.textSecondary,
  },
  reviewButton: {
    background: 'transparent',
    border: `1px solid ${colors.accent}60`,
    color: colors.accentLight,
  },
};

const positionLabels = ['1st', '2nd', '3rd'];

export const RaceResults: React.FC<RaceResultsProps> = ({
  rankings,
  myPlayerId,
  raceComplete = true,
  playerAveragesById = {},
  onPlayAgain,
  onLeave,
  onReviewTasks,
}) => {
  const winner = rankings[0] ?? null;
  const isWinner = winner?.playerId === myPlayerId;
  
  const formatTime = (ms: number): string => {
    if (ms === 0) return raceComplete ? 'DNF' : 'Racing...';
    const seconds = ms / 1000;
    return `${seconds.toFixed(2)}s`;
  };

  const getMyPosition = () => {
    const idx = rankings.findIndex(r => r.playerId === myPlayerId);
    return idx >= 0 ? idx + 1 : null;
  };

  const renderPlayerHeader = (ranking: Ranking) => {
    return (
      <span style={styles.playerHeader}>
        <span
          style={{
            ...styles.positionTag,
            color: ranking.position === 1 ? colors.gold : ranking.position === 2 ? colors.silver : colors.textMuted,
          }}
        >
          {positionLabels[ranking.position - 1] || `#${ranking.position}`}
        </span>
        <span style={styles.playerName}>
          {ranking.playerName}
          {ranking.playerId === myPlayerId ? ' (You)' : ''}
        </span>
      </span>
    );
  };

  const getBestPlayerIds = (
    getter: (ranking: Ranking) => number | null,
    higherIsBetter: boolean,
  ): Set<string> => {
    let best: number | null = null;
    const bestIds = new Set<string>();

    for (const ranking of rankings) {
      const value = getter(ranking);
      if (value === null || Number.isNaN(value)) continue;

      if (best === null) {
        best = value;
        bestIds.add(ranking.playerId);
        continue;
      }

      const isBetter = higherIsBetter ? value > best : value < best;
      if (isBetter) {
        best = value;
        bestIds.clear();
        bestIds.add(ranking.playerId);
      } else if (value === best) {
        bestIds.add(ranking.playerId);
      }
    }

    return bestIds;
  };

  const bestFinishTimeIds = getBestPlayerIds(
    (ranking) => (ranking.time > 0 ? ranking.time : null),
    false,
  );
  const bestAvgDurationIds = getBestPlayerIds((ranking) => {
    const stats = playerAveragesById[ranking.playerId];
    return typeof stats?.avgDurationMs === 'number' ? stats.avgDurationMs : null;
  }, false);
  const bestKeysPerSecondIds = getBestPlayerIds((ranking) => {
    const stats = playerAveragesById[ranking.playerId];
    return typeof stats?.keysPerSecond === 'number' ? stats.keysPerSecond : null;
  }, true);
  const bestAvgKeysIds = getBestPlayerIds((ranking) => {
    const stats = playerAveragesById[ranking.playerId];
    return typeof stats?.avgKeys === 'number' ? stats.avgKeys : null;
  }, false);
  const columnTemplate = '1.6fr repeat(4, minmax(0, 1fr))';

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        <div style={styles.title}>
          {isWinner ? 'Victory!' : 'Race Complete'}
        </div>
        <p style={styles.subtitle}>
          {isWinner 
            ? 'Congratulations, you won!' 
            : `You finished #${getMyPosition()}`
          }
        </p>

        <div style={styles.tableWrap}>
          <div style={{ ...styles.tableHeader, gridTemplateColumns: columnTemplate }}>
            <div style={styles.headerCell}>Player</div>
            <div style={styles.headerCell}>Finish Time</div>
            <div style={styles.headerCell}>Duration/Task</div>
            <div style={styles.headerCell}>Keys/Second</div>
            <div style={styles.headerCell}>Keys/Task</div>
          </div>
          <div style={styles.tableBody}>
            {rankings.map((ranking, index) => {
              const stats = playerAveragesById[ranking.playerId];
              const isLast = index === rankings.length - 1;
              return (
                <div
                  key={ranking.playerId}
                  style={{
                    ...styles.row, gridTemplateColumns: columnTemplate,
                    ...(isLast ? styles.rowLast : {}),
                  }}
                >
                  <div style={styles.rowTitle}>{renderPlayerHeader(ranking)}</div>
                  <div
                    style={{
                      ...styles.statValue,
                      ...(bestFinishTimeIds.has(ranking.playerId) ? styles.statValueBetter : {}),
                    }}
                  >
                    {formatTime(ranking.time)}
                  </div>
                  <div
                    style={{
                      ...styles.statValue,
                      ...(bestAvgDurationIds.has(ranking.playerId) ? styles.statValueBetter : {}),
                    }}
                  >
                    {stats ? formatTenthsDuration(stats.avgDurationMs) : '--'}
                  </div>
                  <div
                    style={{
                      ...styles.statValue,
                      ...(bestKeysPerSecondIds.has(ranking.playerId) ? styles.statValueBetter : {}),
                    }}
                  >
                    {stats ? stats.keysPerSecond.toFixed(2) : '--'}
                  </div>
                  <div
                    style={{
                      ...styles.statValue,
                      ...(bestAvgKeysIds.has(ranking.playerId) ? styles.statValueBetter : {}),
                    }}
                  >
                    {typeof stats?.avgKeys === 'number' ? stats.avgKeys : '--'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={styles.buttons}>
          <button
            style={{ ...styles.button, ...styles.primaryButton }}
            onClick={onPlayAgain}
          >
            Play Again
          </button>
          {onReviewTasks && (
            <button
              style={{ ...styles.button, ...styles.reviewButton }}
              onClick={onReviewTasks}
            >
              Review Performance
            </button>
          )}
          <button
            style={{ ...styles.button, ...styles.secondaryButton }}
            onClick={onLeave}
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
};

