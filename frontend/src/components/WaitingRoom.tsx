import React, { useEffect, useRef, useState } from 'react';
import type { Player } from '../types/multiplayer';

interface WaitingRoomProps {
  roomId: string;
  players: Player[];
  myPlayerId: string | null;
  isQuickPlay?: boolean;
  onReady: () => void;
  onLeave: () => void;
}

const colors = {
  bgDark: '#0a0a0f',
  bgGradientStart: '#0f172a',
  bgGradientEnd: '#1e1b4b',

  accent: '#a78bfa',
  accentLight: '#c4b5fd',
  accentGlow: 'rgba(167, 139, 250, 0.25)',

  success: '#10b981',
  successLight: '#34d399',

  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',

  border: '#334155',
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '480px',
    margin: '0 auto',
    padding: '64px 32px',
    textAlign: 'center' as const,
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: colors.textPrimary,
    marginBottom: '8px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  subtitle: {
    fontSize: '15px',
    color: colors.textSecondary,
    marginBottom: '40px',
  },
  roomCodeCard: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.accent}40`,
    borderRadius: '16px',
    padding: '28px',
    marginBottom: '32px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  roomCodeLabel: {
    fontSize: '12px',
    color: colors.textMuted,
    marginBottom: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '2px',
  },
  roomCode: {
    fontSize: '15px',
    fontWeight: 600,
    color: colors.accentLight,
    fontFamily: '"JetBrains Mono", monospace',
    letterSpacing: '0.5px',
    wordBreak: 'break-all' as const,
    padding: '12px 16px',
    background: colors.bgDark,
    borderRadius: '8px',
    border: `1px solid ${colors.border}`,
  },
  shareText: {
    fontSize: '13px',
    color: colors.textMuted,
    marginTop: '16px',
  },
  playersSection: {
    marginBottom: '32px',
    textAlign: 'left' as const,
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: colors.textMuted,
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1.5px',
  },
  playerCard: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '16px 20px',
    marginBottom: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  playerAvatar: {
    width: '42px',
    height: '42px',
    borderRadius: '10px',
    background: `${colors.accent}30`,
    border: `1px solid ${colors.accent}40`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 600,
    color: colors.accentLight,
    fontFamily: '"JetBrains Mono", monospace',
  },
  playerName: {
    fontSize: '15px',
    fontWeight: 600,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
    flex: 1,
  },
  readyBadge: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#10b981',
    background: 'rgba(16, 185, 129, 0.15)',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid rgba(16, 185, 129, 0.3)',
  },
  waitingCard: {
    background: colors.bgGradientStart,
    border: `1px dashed ${colors.border}`,
    borderRadius: '12px',
    padding: '20px',
    color: colors.textMuted,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    fontSize: '14px',
  },
  spinner: {
    width: '18px',
    height: '18px',
    border: `2px solid ${colors.border}`,
    borderTopColor: colors.accent,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  button: {
    padding: '14px 28px',
    fontSize: '14px',
    fontWeight: 600,
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    color: colors.textMuted,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
  readyButton: {
    padding: '14px 28px',
    fontSize: '14px',
    fontWeight: 600,
    background: colors.accent,
    border: 'none',
    borderRadius: '10px',
    color: colors.bgDark,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
  readyButtonDisabled: {
    padding: '14px 28px',
    fontSize: '14px',
    fontWeight: 600,
    background: colors.accent,
    border: 'none',
    borderRadius: '10px',
    color: colors.bgDark,
    cursor: 'not-allowed',
    fontFamily: '"JetBrains Mono", monospace',
    opacity: 0.6,
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  // Quick Play styles
  quickPlayContainer: {
    maxWidth: '480px',
    margin: '0 auto',
    padding: '80px 32px',
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  searchingText: {
    fontSize: '24px',
    fontWeight: 600,
    color: colors.textPrimary,
    marginBottom: '48px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  dots: {
    display: 'inline-block',
    width: '24px',
    textAlign: 'left' as const,
  },
  matchFoundText: {
    fontSize: '24px',
    fontWeight: 600,
    color: colors.successLight,
    marginBottom: '24px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  opponentName: {
    fontSize: '18px',
    fontWeight: 600,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
    marginBottom: '32px',
    padding: '16px 24px',
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.success}40`,
    borderRadius: '12px',
  },
  startingText: {
    fontSize: '14px',
    color: colors.textMuted,
    marginBottom: '32px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  cancelButton: {
    padding: '14px 28px',
    fontSize: '14px',
    fontWeight: 600,
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    color: colors.textMuted,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
};

export const WaitingRoom: React.FC<WaitingRoomProps> = ({
  roomId,
  players,
  myPlayerId,
  isQuickPlay = false,
  onReady,
  onLeave,
}) => {
  const [copied, setCopied] = React.useState(false);
  const me = players.find((p) => p.id === myPlayerId);
  const opponent = players.find((p) => p.id !== myPlayerId);
  const isReady = me?.readyToPlay ?? false;
  const hasOpponent = players.length === 2;

  // Track whether we ever had an opponent so we can distinguish
  // "waiting for someone to join" from "opponent disconnected".
  const hadOpponentRef = useRef(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);

  useEffect(() => {
    if (hasOpponent) {
      hadOpponentRef.current = true;
    } else if (hadOpponentRef.current) {
      // Had an opponent who is now gone
      setOpponentDisconnected(true);
    }
  }, [hasOpponent]);

  // Quick play: when the opponent disconnects the room is a dead end
  // (no one else will be matched into it). Auto-leave so the player
  // can re-queue from the lobby.
  useEffect(() => {
    if (isQuickPlay && opponentDisconnected) {
      const timer = setTimeout(() => {
        onLeave();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isQuickPlay, opponentDisconnected, onLeave]);

  // Auto-ready for quick play when opponent joins
  useEffect(() => {
    if (isQuickPlay && hasOpponent && !isReady) {
      // Small delay so the UI can show "Match Found" briefly
      const timer = setTimeout(() => {
        onReady();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isQuickPlay, hasOpponent, isReady, onReady]);

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Quick Play UI
  if (isQuickPlay) {
    return (
      <div style={styles.quickPlayContainer}>
        <style>
          {`
            @keyframes dots {
              0%, 20% { content: ''; }
              40% { content: '.'; }
              60% { content: '..'; }
              80%, 100% { content: '...'; }
            }
            .animated-dots::after {
              content: '';
              animation: dots 1.5s steps(1, end) infinite;
            }
          `}
        </style>

        {!hasOpponent ? (
          opponentDisconnected ? (
            // Opponent disconnected — room is a dead end
            <>
              <div
                style={{
                  ...styles.searchingText,
                  color: colors.textSecondary,
                }}
              >
                Opponent disconnected
              </div>
              <div
                style={{
                  fontSize: '14px',
                  color: colors.textMuted,
                  fontFamily: '"JetBrains Mono", monospace',
                  marginBottom: '24px',
                }}
              >
                Returning to lobby...
              </div>
              <button style={styles.cancelButton} onClick={onLeave}>
                Back to Lobby
              </button>
            </>
          ) : (
            // Searching state
            <>
              <div style={styles.searchingText}>
                Searching for players
                <span className="animated-dots" style={styles.dots}></span>
              </div>

              <button style={styles.cancelButton} onClick={onLeave}>
                Cancel
              </button>
            </>
          )
        ) : (
          // Match found state
          <>
            <div style={styles.matchFoundText}>Match found</div>

            <div style={styles.opponentName}>
              vs {opponent?.name || 'Opponent'}
            </div>

            <div style={styles.startingText}>
              Starting
              <span className="animated-dots" style={styles.dots}></span>
            </div>

            <button style={styles.cancelButton} onClick={onLeave}>
              Cancel
            </button>
          </>
        )}
      </div>
    );
  }

  // Private Match UI (original)
  return (
    <div style={styles.container}>
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>

      <h1 style={styles.title}>Waiting Room</h1>
      <p style={styles.subtitle}>Share the room ID to invite a friend</p>

      <div
        style={{
          ...styles.roomCodeCard,
          borderColor: copied ? colors.accent : `${colors.accent}40`,
        }}
        onClick={copyRoomCode}
      >
        <div style={styles.roomCodeLabel}>Room ID</div>
        <div style={styles.roomCode}>{roomId}</div>
        <div style={styles.shareText}>
          {copied ? 'Copied to clipboard' : 'Click to copy'}
        </div>
      </div>

      <div style={styles.playersSection}>
        <div style={styles.sectionTitle}>Players ({players.length}/2)</div>

        {players.map((player) => (
          <div key={player.id} style={styles.playerCard}>
            <div style={styles.playerAvatar}>
              {player.id === myPlayerId ? 'You' : 'P2'}
            </div>
            <div style={styles.playerName}>
              {player.name}
              {player.id === myPlayerId && ' (You)'}
            </div>
            {player.readyToPlay && <div style={styles.readyBadge}>Ready</div>}
          </div>
        ))}

        {players.length < 2 && (
          <div style={styles.waitingCard}>
            <div style={styles.spinner} />
            Waiting for opponent to join...
          </div>
        )}
      </div>

      <div style={styles.buttonGroup}>
        <button style={styles.button} onClick={onLeave}>
          Leave Room
        </button>
        {players.length === 2 && (
          <button
            style={isReady ? styles.readyButtonDisabled : styles.readyButton}
            onClick={onReady}
            disabled={isReady}
          >
            {isReady ? 'Ready' : 'Ready'}
          </button>
        )}
      </div>
    </div>
  );
};
