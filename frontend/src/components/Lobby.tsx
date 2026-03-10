import React, { useState, useEffect } from 'react';

interface LobbyProps {
  isConnected: boolean;
  isConnecting?: boolean;
  initialMode?: 'quick' | 'private' | null;
  error: string | null;
  queuePosition?: number | null;
  onCreateRoom: (playerName: string) => void;
  onJoinRoom: (roomId: string, playerName: string) => void;
  onQuickMatch: (playerName: string) => void;
  onCancelQuickMatch?: () => void;
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
  borderLight: '#475569',
  
  success: '#4ade80',
  warning: '#fbbf24',
  error: '#f87171',
};

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: {
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
  mainContent: {
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
    background: `radial-gradient(circle, rgba(6, 182, 212, 0.3) 0%, transparent 70%)`,
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
  container: {
    maxWidth: '480px',
    margin: '0 auto',
    padding: '64px 32px',
    position: 'relative' as const,
    zIndex: 1,
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '48px',
  },
  title: {
    fontSize: '42px',
    fontWeight: 800,
    color: colors.textPrimary,
    marginBottom: '12px',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    letterSpacing: '-1px',
  },
  subtitle: {
    fontSize: '16px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
  },
  connectionStatus: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    background: colors.bgGradientStart,
    borderRadius: '20px',
    fontSize: '13px',
    marginTop: '20px',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  card: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '16px',
    padding: '28px',
    marginBottom: '20px',
  },
  cardTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: colors.textMuted,
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1.5px',
  },
  input: {
    width: '100%',
    padding: '14px 18px',
    fontSize: '16px',
    fontFamily: '"JetBrains Mono", monospace',
    background: colors.bgDark,
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    color: colors.textPrimary,
    marginBottom: '0',
    boxSizing: 'border-box' as const,
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },
  button: {
    width: '100%',
    padding: '16px 24px',
    fontSize: '15px',
    fontWeight: 600,
    color: colors.bgDark,
    background: colors.accent,
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
    letterSpacing: '0.5px',
  },
  buttonOutline: {
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    color: colors.textSecondary,
  },
  buttonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '20px 0',
    color: colors.textMuted,
    fontSize: '13px',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: colors.border,
  },
  dividerText: {
    padding: '0 16px',
  },
  error: {
    background: 'rgba(248, 113, 113, 0.1)',
    border: `1px solid ${colors.error}`,
    borderRadius: '10px',
    padding: '14px 18px',
    color: colors.error,
    marginBottom: '24px',
    textAlign: 'center' as const,
    fontSize: '14px',
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
    marginTop: '12px',
  },
  playerBadge: {
    display: 'inline-block',
    padding: '4px 10px',
    background: `${colors.accent}20`,
    border: `1px solid ${colors.accent}40`,
    borderRadius: '6px',
    color: colors.accentLight,
    fontWeight: 600,
    fontSize: '14px',
  },
  quickPlayStatusPanel: {
    background: 'transparent',
    border: 'none',
    borderRadius: 0,
    padding: '8px 0 12px',
    marginBottom: '12px',
  },
  quickPlayStatusText: {
    fontSize: '14px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
  },
};

export const Lobby: React.FC<LobbyProps> = ({
  isConnected,
  isConnecting = false,
  initialMode = null,
  error,
  queuePosition = null,
  onCreateRoom,
  onJoinRoom,
  onQuickMatch,
  onCancelQuickMatch,
}) => {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  
  // For private mode, track if we're joining (create is immediate)
  const [privateSubMode, setPrivateSubMode] = useState<'select' | 'join'>('select');

  // Show a friendly nudge after waiting 10+ seconds in quick match
  const [showLongWaitMessage, setShowLongWaitMessage] = useState(false);
  const isQuickMatchWaiting = initialMode === 'quick' && (isConnecting || queuePosition !== null);

  useEffect(() => {
    if (!isQuickMatchWaiting) {
      setShowLongWaitMessage(false);
      return;
    }

    const timeout = setTimeout(() => setShowLongWaitMessage(true), 10_000);
    return () => clearTimeout(timeout);
  }, [isQuickMatchWaiting]);

  const handleCreate = () => {
    if (playerName.trim()) {
      onCreateRoom(playerName.trim());
    }
  };

    const handleJoin = () => {
    if (playerName.trim() && roomCode.trim()) {
      onJoinRoom(roomCode.trim(), playerName.trim());
    }
  };

  const handleQuickMatch = () => {
    if (playerName.trim()) {
      onQuickMatch(playerName.trim());
    }
  };

  const isLoading = isConnecting;
  const canInteract = isConnected;

  const getStatusColor = () => {
    if (isConnecting) return colors.warning;
    if (isConnected) return colors.success;
    return colors.textMuted;
  };

  const getStatusText = () => {
    return isConnected ? 'Connected' : 'Connecting...';
  };

  const getTitle = () => {
    if (initialMode === 'quick') return 'Quick Play';
    if (initialMode === 'private') return 'Private Match';
    return 'Multiplayer';
  };

  const getSubtitle = () => {
    if (initialMode === 'quick') return 'Find an opponent instantly';
    if (initialMode === 'private') return 'Play with friends using a room code';
    return 'Race your friends with Vim motions';
  };

  const handleBack = () => {
    window.location.href = '/';
  };

  const longWaitMessage = showLongWaitMessage ? (
    <div style={{
      marginTop: '20px',
      padding: '14px 18px',
      background: `${colors.accent}10`,
      border: `1px solid ${colors.accent}30`,
      borderRadius: '10px',
      fontSize: '13px',
      lineHeight: 1.6,
      color: colors.textSecondary,
      textAlign: 'left' as const,
    }}>
      We're just getting started — it's possible no other players are
      matching right now. Feel free to try{' '}
      <a
        href="/practice"
        style={{ color: colors.accent, textDecoration: 'underline' }}
      >
        practice mode
      </a>{' '}
      or keep waiting!
    </div>
  ) : null;

  // Quick Play flow
  if (initialMode === 'quick') {
    const isInQueue = queuePosition !== null;
    
    return (
      <div style={styles.pageWrapper}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={styles.topBanner}>
          <div style={styles.topBannerTitle}>VIM_GYM</div>
        </div>
        <div style={styles.mainContent}>
          <div style={styles.bgGlow1} />
          <div style={styles.bgGlow2} />
          <div style={styles.container}>
            <div style={styles.header}>
          <h1 style={styles.title}>{getTitle()}</h1>
          <p style={styles.subtitle}>{getSubtitle()}</p>
          
          <div style={styles.connectionStatus}>
            <div
              style={{
                ...styles.dot,
                background: getStatusColor(),
                boxShadow: `0 0 8px ${getStatusColor()}`,
              }}
            />
            <span style={{ color: getStatusColor() }}>
              {getStatusText()}
            </span>
          </div>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {/* Show queue status when in queue */}
        {isInQueue ? (
          <div style={styles.quickPlayStatusPanel}>
            <div style={{
              textAlign: 'center' as const,
              padding: '20px 0',
            }}>
              <div style={{
                fontSize: '48px',
                fontWeight: 700,
                color: colors.accent,
                marginBottom: '8px',
                fontFamily: '"JetBrains Mono", monospace',
              }}>
                #{queuePosition}
              </div>
              <div style={{
                fontSize: '14px',
                color: colors.textSecondary,
              }}>
                in queue
              </div>
              <div style={{
                marginTop: '16px',
                fontSize: '13px',
                color: colors.textMuted,
              }}>
                Waiting for opponent...
              </div>
              {longWaitMessage}
            </div>
            {onCancelQuickMatch && (
              <button
                style={{
                  ...styles.button,
                  ...styles.buttonOutline,
                  marginTop: '16px',
                }}
                onClick={onCancelQuickMatch}
              >
                Cancel
              </button>
            )}
          </div>
        ) : isLoading ? (
          /* Connecting phase — between clicking Find Match and entering
             the queue, or between match:found and joining the game room.
             Show a clear status with a cancel option. */
          <div style={styles.quickPlayStatusPanel}>
            <div style={{
              textAlign: 'center' as const,
              padding: '20px 0',
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                border: `3px solid ${colors.border}`,
                borderTopColor: colors.accent,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px',
              }} />
              <div style={styles.quickPlayStatusText}>
                Searching for players...
              </div>
              {longWaitMessage}
            </div>
            {onCancelQuickMatch && (
              <button
                style={{
                  ...styles.button,
                  ...styles.buttonOutline,
                  marginTop: '16px',
                }}
                onClick={onCancelQuickMatch}
              >
                Cancel
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Your Name</div>
              <input
                type="text"
                placeholder="Enter your name..."
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                style={styles.input}
                maxLength={20}
              />
            </div>

            <button
              style={{
                ...styles.button,
                background: `linear-gradient(135deg, ${colors.success} 0%, #059669 100%)`,
                ...((!canInteract || !playerName.trim()) ? styles.buttonDisabled : {}),
              }}
              onClick={handleQuickMatch}
              disabled={!canInteract || !playerName.trim()}
            >
              Find Match
            </button>
          </>
        )}

        {!((isInQueue || isLoading) && onCancelQuickMatch) && (
          <button
            style={styles.backButton}
            onClick={handleBack}
            disabled={false}
          >
            ← Back
          </button>
        )}
          </div>
        </div>
      </div>
    );
  }

  // Private Match flow
  if (initialMode === 'private') {
    return (
      <div style={styles.pageWrapper}>
        <div style={styles.topBanner}>
          <div style={styles.topBannerTitle}>VIM_GYM</div>
        </div>
        <div style={styles.mainContent}>
          <div style={styles.bgGlow1} />
          <div style={styles.bgGlow2} />
          <div style={styles.container}>
            <div style={styles.header}>
          <h1 style={styles.title}>{getTitle()}</h1>
          <p style={styles.subtitle}>{getSubtitle()}</p>
          
          <div style={styles.connectionStatus}>
            <div
              style={{
                ...styles.dot,
                background: getStatusColor(),
                boxShadow: `0 0 8px ${getStatusColor()}`,
              }}
            />
            <span style={{ color: getStatusColor() }}>
              {getStatusText()}
            </span>
          </div>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {/* Name input - always shown */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Your Name</div>
          <input
            type="text"
            placeholder="Enter your name..."
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            style={styles.input}
            maxLength={20}
          />
        </div>

        {/* Create or Join buttons */}
        {privateSubMode === 'select' && (
          <>
            <button
              style={{
                ...styles.button,
                marginBottom: '12px',
                ...((!canInteract || !playerName.trim() || isLoading) ? styles.buttonDisabled : {}),
              }}
              onClick={handleCreate}
              disabled={!canInteract || !playerName.trim() || isLoading}
            >
              {isLoading ? 'Creating...' : 'Create Room'}
            </button>
            <button
              style={{
                ...styles.button,
                ...styles.buttonOutline,
                ...((!canInteract || !playerName.trim() || isLoading) ? styles.buttonDisabled : {}),
              }}
              onClick={() => playerName.trim() && setPrivateSubMode('join')}
              disabled={!canInteract || !playerName.trim() || isLoading}
            >
              Join Room
            </button>
          </>
        )}

        {/* Join Room */}
        {privateSubMode === 'join' && (
          <>
            <div style={{ ...styles.card, marginBottom: '16px' }}>
              <div style={styles.cardTitle}>Room Code</div>
              <input
                type="text"
                placeholder="Paste room ID here..."
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                style={styles.input}
                maxLength={50}
              />
            </div>
            <button
              style={{
                ...styles.button,
                ...((!roomCode.trim() || isLoading) ? styles.buttonDisabled : {}),
              }}
              onClick={handleJoin}
              disabled={!canInteract || !roomCode.trim() || isLoading}
            >
              {isLoading ? 'Joining...' : 'Join Room'}
            </button>
          </>
        )}

        <button
          style={styles.backButton}
          onClick={privateSubMode === 'select' ? handleBack : () => setPrivateSubMode('select')}
          disabled={isLoading}
        >
          ← Back
        </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback (shouldn't happen if routed correctly, but just in case)
  return (
    <div style={styles.pageWrapper}>
      <div style={styles.topBanner}>
        <div style={styles.topBannerTitle}>VIM_GYM</div>
      </div>
      <div style={styles.mainContent}>
        <div style={styles.bgGlow1} />
        <div style={styles.bgGlow2} />
        <div style={styles.container}>
          <div style={styles.header}>
        <h1 style={styles.title}>{getTitle()}</h1>
        <p style={styles.subtitle}>{getSubtitle()}</p>
      </div>
      <button style={styles.backButton} onClick={handleBack}>
        ← Back to Home
      </button>
        </div>
      </div>
    </div>
  );
};

