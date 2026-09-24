import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface LobbyProps {
  isConnected: boolean;
  isConnecting?: boolean;
  initialMode?: 'quick' | 'private' | null;
  error: string | null;
  queuePosition?: number | null;
  relativeLineNumbersEnabled: boolean;
  onRelativeLineNumbersChange: (enabled: boolean) => void;
  playerName: string;
  onCreateRoom: (playerName: string) => void;
  onJoinRoom: (roomId: string, playerName: string) => void;
  onQuickMatch: (playerName: string) => void;
  onCancelQuickMatch?: () => void;
  /** Retry the game-server handshake after it was refused (server full, etc). */
  onRetryConnection?: () => void;
  /**
   * Set when the visitor has no session. Every action that would start a game
   * calls this instead (the route sends them to sign in), the connection
   * status is hidden because no socket exists, and buttons stay enabled even
   * though there is no player name yet.
   */
  onSignInRequired?: () => void;
  /** One-sentence explanation of the mode, shown under the subtitle. */
  description?: string;
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
  description: {
    fontSize: '17px',
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
    lineHeight: 1.7,
    maxWidth: '480px',
    margin: '16px auto 0',
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
  errorRetryButton: {
    marginTop: '12px',
    padding: '8px 18px',
    fontSize: '13px',
    fontWeight: 500,
    background: 'transparent',
    border: `1px solid ${colors.error}`,
    borderRadius: '8px',
    color: colors.error,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
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
  optionToggleRow: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 2px',
    marginBottom: '12px',
  },
  optionToggleLabel: {
    color: colors.textSecondary,
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: '"JetBrains Mono", monospace',
    letterSpacing: '0.3px',
    userSelect: 'none' as const,
    cursor: 'pointer',
  },
  optionToggleCheckbox: {
    width: '16px',
    height: '16px',
    margin: 0,
    cursor: 'pointer',
    borderRadius: '4px',
    border: `1px solid ${colors.borderLight}`,
    background: colors.bgDark,
    boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.45)',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'transparent',
    fontSize: '12px',
    lineHeight: 1,
    fontWeight: 700,
    fontFamily: '"JetBrains Mono", monospace',
    userSelect: 'none' as const,
  },
  optionToggleCheckboxChecked: {
    background: `${colors.success}1f`,
    border: `1px solid ${colors.success}`,
    boxShadow: `0 0 0 1px ${colors.success}33`,
    color: colors.success,
  },
};

export const Lobby: React.FC<LobbyProps> = ({
  isConnected,
  isConnecting = false,
  initialMode = null,
  error,
  queuePosition = null,
  relativeLineNumbersEnabled,
  onRelativeLineNumbersChange,
  playerName,
  onCreateRoom,
  onJoinRoom,
  onQuickMatch,
  onCancelQuickMatch,
  onRetryConnection,
  onSignInRequired,
  description,
}) => {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');
  const [roomCodeError, setRoomCodeError] = useState<string | null>(null);

  // For private mode, track if we're joining (create is immediate)
  const [privateSubMode, setPrivateSubMode] = useState<'select' | 'join'>(
    'select'
  );

  // Show a friendly nudge after waiting 10+ seconds in quick match
  const [showLongWaitMessage, setShowLongWaitMessage] = useState(false);
  const isQuickMatchWaiting =
    initialMode === 'quick' && (isConnecting || queuePosition !== null);

  useEffect(() => {
    if (!isQuickMatchWaiting) {
      setShowLongWaitMessage(false);
      return;
    }

    const timeout = setTimeout(() => setShowLongWaitMessage(true), 10_000);
    return () => clearTimeout(timeout);
  }, [isQuickMatchWaiting]);

  const handleCreate = () => {
    if (onSignInRequired) return onSignInRequired();
    if (playerName.trim()) {
      onCreateRoom(playerName.trim());
    }
  };

  const isValidRoomCode = (code: string): boolean =>
    /^[A-Za-z0-9]{6}$/.test(code) || /^[A-Za-z0-9]{10,20}$/.test(code);

  const handleRoomCodeChange = (raw: string) => {
    const sanitized = raw.replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
    setRoomCode(sanitized);
    setRoomCodeError(null);
  };

  const handleJoin = () => {
    if (onSignInRequired) return onSignInRequired();
    const trimmed = roomCode.trim();
    if (!hasPlayerName || !trimmed) return;
    if (!isValidRoomCode(trimmed)) {
      setRoomCodeError('Room code must be 6 or 10–20 alphanumeric characters');
      return;
    }
    setRoomCodeError(null);
    onJoinRoom(trimmed, playerName.trim());
  };

  const handleQuickMatch = () => {
    if (onSignInRequired) return onSignInRequired();
    if (playerName.trim()) {
      onQuickMatch(playerName.trim());
    }
  };

  const isLoading = isConnecting;
  const canInteract = isConnected || onSignInRequired !== undefined;
  const hasPlayerName =
    playerName.trim() !== '' || onSignInRequired !== undefined;

  // The server refused the handshake and Socket.IO will not retry it, so the
  // status must not keep claiming we are connecting.
  const isConnectionRefused = !isConnected && !isConnecting && error !== null;

  const getStatusColor = () => {
    if (isConnected) return colors.success;
    if (isConnectionRefused) return colors.error;
    if (isConnecting) return colors.warning;
    return colors.textMuted;
  };

  const getStatusText = () => {
    if (isConnected) return 'Connected';
    if (isConnectionRefused) return 'Not connected';
    return 'Connecting...';
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

  // Client-side navigation: a full page reload here would restart the auth
  // pipeline (session load + profile fetch) and flash a black screen.
  const handleBack = () => {
    navigate('/');
  };

  const longWaitMessage = showLongWaitMessage ? (
    <div
      style={{
        marginTop: '20px',
        padding: '14px 18px',
        background: `${colors.accent}10`,
        border: `1px solid ${colors.accent}30`,
        borderRadius: '10px',
        fontSize: '13px',
        lineHeight: 1.6,
        color: colors.textSecondary,
        textAlign: 'left' as const,
      }}
    >
      We&apos;re just getting started — it&apos;s possible no other players are
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

  // A refused handshake needs a way back: Socket.IO will not retry on its own.
  const errorBanner = error ? (
    <div style={styles.error}>
      <div>{error}</div>
      {isConnectionRefused && onRetryConnection && (
        <button
          type="button"
          onClick={onRetryConnection}
          style={styles.errorRetryButton}
        >
          Try again
        </button>
      )}
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
              {description && <p style={styles.description}>{description}</p>}

              {!onSignInRequired && (
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
              )}
            </div>

            {errorBanner}

            {/* Show queue status when in queue */}
            {isInQueue ? (
              <div style={styles.quickPlayStatusPanel}>
                <div
                  style={{
                    textAlign: 'center' as const,
                    padding: '20px 0',
                  }}
                >
                  <div
                    style={{
                      fontSize: '48px',
                      fontWeight: 700,
                      color: colors.accent,
                      marginBottom: '8px',
                      fontFamily: '"JetBrains Mono", monospace',
                    }}
                  >
                    #{queuePosition}
                  </div>
                  <div
                    style={{
                      fontSize: '14px',
                      color: colors.textSecondary,
                    }}
                  >
                    in queue
                  </div>
                  <div
                    style={{
                      marginTop: '16px',
                      fontSize: '13px',
                      color: colors.textMuted,
                    }}
                  >
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
                <div
                  style={{
                    textAlign: 'center' as const,
                    padding: '20px 0',
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      border: `3px solid ${colors.border}`,
                      borderTopColor: colors.accent,
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      margin: '0 auto 16px',
                    }}
                  />
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
                <label style={styles.optionToggleRow}>
                  <span style={styles.optionToggleLabel}>
                    Start with Relative Line Numbers
                  </span>
                  <button
                    type="button"
                    aria-label="Toggle relative line numbers"
                    aria-pressed={relativeLineNumbersEnabled}
                    onClick={() =>
                      onRelativeLineNumbersChange(!relativeLineNumbersEnabled)
                    }
                    style={{
                      ...styles.optionToggleCheckbox,
                      ...(relativeLineNumbersEnabled
                        ? styles.optionToggleCheckboxChecked
                        : {}),
                    }}
                  >
                    ✓
                  </button>
                </label>

                <button
                  style={{
                    ...styles.button,
                    background: `linear-gradient(135deg, ${colors.success} 0%, #059669 100%)`,
                    ...(!canInteract || !hasPlayerName
                      ? styles.buttonDisabled
                      : {}),
                  }}
                  onClick={handleQuickMatch}
                  disabled={!canInteract || !hasPlayerName}
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
              {description && <p style={styles.description}>{description}</p>}

              {!onSignInRequired && (
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
              )}
            </div>

            {errorBanner}

            <label style={styles.optionToggleRow}>
              <span style={styles.optionToggleLabel}>
                Start with Relative Line Numbers
              </span>
              <button
                type="button"
                aria-label="Toggle relative line numbers"
                aria-pressed={relativeLineNumbersEnabled}
                onClick={() =>
                  onRelativeLineNumbersChange(!relativeLineNumbersEnabled)
                }
                style={{
                  ...styles.optionToggleCheckbox,
                  ...(relativeLineNumbersEnabled
                    ? styles.optionToggleCheckboxChecked
                    : {}),
                }}
              >
                ✓
              </button>
            </label>

            {/* Create or Join buttons */}
            {privateSubMode === 'select' && (
              <>
                <button
                  style={{
                    ...styles.button,
                    marginBottom: '12px',
                    ...(!canInteract || !hasPlayerName || isLoading
                      ? styles.buttonDisabled
                      : {}),
                  }}
                  onClick={handleCreate}
                  disabled={!canInteract || !hasPlayerName || isLoading}
                >
                  {isLoading ? 'Creating...' : 'Create Room'}
                </button>
                <button
                  style={{
                    ...styles.button,
                    ...styles.buttonOutline,
                    ...(!canInteract || !hasPlayerName || isLoading
                      ? styles.buttonDisabled
                      : {}),
                  }}
                  onClick={() => playerName.trim() && setPrivateSubMode('join')}
                  disabled={!canInteract || !hasPlayerName || isLoading}
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
                    onChange={(e) => handleRoomCodeChange(e.target.value)}
                    style={styles.input}
                    maxLength={20}
                  />
                  {roomCodeError && (
                    <div
                      style={{
                        color: colors.error,
                        fontSize: '12px',
                        marginTop: '6px',
                      }}
                    >
                      {roomCodeError}
                    </div>
                  )}
                </div>
                <button
                  style={{
                    ...styles.button,
                    ...(!roomCode.trim() || isLoading
                      ? styles.buttonDisabled
                      : {}),
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
              onClick={
                privateSubMode === 'select'
                  ? handleBack
                  : () => setPrivateSubMode('select')
              }
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
            {description && <p style={styles.description}>{description}</p>}
          </div>
          <button style={styles.backButton} onClick={handleBack}>
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  );
};
