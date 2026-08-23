/**
 * Race of the Day page (/daily).
 *
 * Owns the daily-specific chrome: pre-race screen (attempt dots, start
 * button, countdown, leaderboard panel) and the completion extras (placing,
 * share link, try-again). The actual racing UI is RaceSessionPage from
 * practice.tsx, mounted only after an attempt slot is claimed -- visiting
 * this page never burns an attempt; clicking Start does.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext';
import { colors } from '../theme';
import {
  fetchDailyRace,
  startDailyAttempt,
  completeDailyAttempt,
  fetchDailyLeaderboard,
  createDailyShareLink,
} from '../api/daily';
import type {
  DailyRaceInfo,
  DailyLeaderboardEntry,
  DailyLeaderboardData,
} from '../api/daily';
import type {
  RaceSessionConfig,
  RaceCompletionInfo,
} from '../racing/raceSessionConfig';
import { RaceSessionPage } from './practice';
import { SiteBanner } from '../components/SiteBanner';
import { clearChallengeSlug } from '../lib/challengeRedirect';

// ---------------------------------------------------------------------------
// Phase state machine
// ---------------------------------------------------------------------------

type Phase =
  | { name: 'loading' }
  | { name: 'error'; message: string }
  | { name: 'preRace'; info: DailyRaceInfo }
  | {
      name: 'racing';
      info: DailyRaceInfo;
      gameId: number | null;
      attemptNumber: number;
    };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format milliseconds as seconds with one decimal, e.g. "4.1s". */
function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Compute milliseconds until the next UTC midnight from the current instant.
 * Used for the "New race in" countdown.
 */
function msUntilNextUtcMidnight(): number {
  const now = new Date();
  const tomorrow = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  );
  return Math.max(0, tomorrow - Date.now());
}

/** Format ms as HH:MM:SS for the countdown display. */
function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ---------------------------------------------------------------------------
// Styles (follows practice.tsx ready-screen vocabulary)
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${colors.bgDark} 0%, #0f0f1a 100%)`,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
  },
  bgGlow1: {
    position: 'absolute',
    top: '10%',
    left: '10%',
    width: '500px',
    height: '500px',
    background: `radial-gradient(circle, ${colors.primaryGlow} 0%, transparent 70%)`,
    filter: 'blur(80px)',
    pointerEvents: 'none',
  },
  bgGlow2: {
    position: 'absolute',
    bottom: '10%',
    right: '10%',
    width: '500px',
    height: '500px',
    background:
      'radial-gradient(circle, rgba(236, 72, 153, 0.3) 0%, transparent 70%)',
    filter: 'blur(80px)',
    pointerEvents: 'none',
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  container: {
    maxWidth: '1040px',
    width: '100%',
    margin: '0 auto',
    padding: '48px 32px',
    position: 'relative',
    zIndex: 1,
  },
  // Split-stage layout: race card left, leaderboard rail right.
  split: {
    display: 'grid',
    gridTemplateColumns: '1.4fr 1fr',
    gap: '28px',
    alignItems: 'stretch',
  },
  stage: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '18px',
    padding: '24px 0',
  },
  // Same typographic treatment as the title, one step down in scale.
  dateHeader: {
    fontSize: '20px',
    fontWeight: 800,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    letterSpacing: '-0.5px',
    textShadow: `0 0 20px ${colors.primaryGlow}`,
  },
  title: {
    fontSize: '42px',
    fontWeight: 800,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    letterSpacing: '-1.5px',
    lineHeight: 1.1,
    textShadow: `0 0 20px ${colors.primaryGlow}`,
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: '13px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
  },
  attemptDots: {
    display: 'inline-flex',
    gap: '8px',
    fontSize: '18px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  dotUsed: {
    color: colors.warning,
  },
  dotFree: {
    color: colors.textMuted,
  },
  bestTime: {
    fontSize: '13px',
    color: colors.successLight,
    fontFamily: '"JetBrains Mono", monospace',
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  // Matches metaText ("N of 3 attempts used") for a consistent caption tier.
  subLine: {
    fontSize: '13px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
  },
  flexButton: {
    padding: '16px 26px',
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    color: colors.secondaryLight,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    borderRadius: '10px',
    // Gradient border: dark body painted over a magenta→amber border layer.
    background: `linear-gradient(${colors.bgCard}, ${colors.bgCard}) padding-box, linear-gradient(135deg, ${colors.secondary}, ${colors.warning}) border-box`,
    border: '2px solid transparent',
    boxShadow: `0 0 22px ${colors.secondaryGlow}`,
    position: 'relative',
    overflow: 'hidden',
    transition: 'all 0.2s ease',
  },
  startButton: {
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
  },
  disabledMessage: {
    fontSize: '18px',
    fontWeight: 600,
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
  },
  countdown: {
    fontSize: '14px',
    color: colors.textMuted,
    fontFamily: '"JetBrains Mono", monospace',
  },
  countdownTime: {
    color: colors.warning,
    fontWeight: 700,
    fontSize: '18px',
    letterSpacing: '2px',
  },
  backArrow: {
    padding: 0,
    width: 'fit-content',
    display: 'flex',
    background: 'transparent',
    border: 'none',
    color: colors.textPrimary,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  // Share modal
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modalCard: {
    width: 'min(480px, 100%)',
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: '14px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    boxShadow: `0 24px 60px rgba(0, 0, 0, 0.6), 0 0 30px ${colors.secondaryGlow}`,
  },
  modalHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: '17px',
    fontWeight: 800,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
    letterSpacing: '-0.5px',
  },
  modalClose: {
    padding: '4px',
    fontSize: '15px',
    background: 'transparent',
    border: 'none',
    color: colors.textMuted,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
  },
  linkRow: {
    display: 'flex',
    gap: '8px',
  },
  linkInput: {
    flex: 1,
    minWidth: 0,
    padding: '10px 12px',
    fontSize: '13px',
    fontFamily: '"JetBrains Mono", monospace',
    color: colors.textPrimary,
    background: colors.bgDark,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
  },
  copyButton: {
    padding: '10px 18px',
    fontSize: '13px',
    fontWeight: 700,
    color: colors.bgDark,
    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
  },
  previewLabel: {
    fontSize: '12px',
    color: colors.textMuted,
    fontFamily: '"JetBrains Mono", monospace',
  },
  previewCard: {
    border: `1px solid ${colors.border}`,
    borderLeft: `3px solid ${colors.secondary}`,
    borderRadius: '8px',
    padding: '14px',
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  previewTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
  },
  previewDesc: {
    fontSize: '12.5px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
  },
  previewHost: {
    fontSize: '11px',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  modalCaption: {
    margin: 0,
    fontSize: '12px',
    color: colors.textMuted,
    fontFamily: '"JetBrains Mono", monospace',
  },
  // Leaderboard rail (right column)
  rail: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '20px',
    maxHeight: '520px',
    overflowY: 'auto',
    alignSelf: 'center',
    width: '100%',
  },
  railHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderBottom: `1px solid ${colors.border}`,
    paddingBottom: '12px',
    marginBottom: '10px',
  },
  railCount: {
    fontSize: '12px',
    color: colors.textMuted,
    fontFamily: '"JetBrains Mono", monospace',
  },
  // Left inset matches the rows' 12px padding so the dots sit under the ranks.
  railDivider: {
    textAlign: 'left',
    color: colors.textMuted,
    fontSize: '13px',
    padding: '4px 12px',
    userSelect: 'none',
    fontFamily: '"JetBrains Mono", monospace',
  },
  leaderboardTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: '1.5px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  leaderboardRow: {
    display: 'grid',
    gridTemplateColumns: '40px 1fr 80px',
    gap: '8px',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: '8px',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '14px',
  },
  leaderboardRowOwn: {
    background: `${colors.primary}15`,
    border: `1px solid ${colors.primary}40`,
  },
  leaderboardRank: {
    color: colors.textMuted,
    fontWeight: 700,
  },
  leaderboardName: {
    color: colors.textPrimary,
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  leaderboardTime: {
    color: colors.primaryLight,
    fontWeight: 600,
    textAlign: 'right',
  },
  leaderboardEmpty: {
    color: colors.textMuted,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '14px',
    textAlign: 'center',
    padding: '16px 0',
  },
  // Completion extras
  extrasContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    width: '100%',
    marginTop: '16px',
  },
  placingLine: {
    fontSize: '18px',
    fontWeight: 600,
    color: colors.primaryLight,
    fontFamily: '"JetBrains Mono", monospace',
    textAlign: 'center',
  },
  shareBlock: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '20px',
    textAlign: 'center',
  },
  shareTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
    marginBottom: '12px',
  },
  shareButton: {
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 600,
    color: colors.bgDark,
    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
  tryAgainButton: {
    width: '100%',
    padding: '14px 24px',
    fontSize: '15px',
    fontWeight: 600,
    color: colors.primaryLight,
    background: `${colors.primary}20`,
    border: `1px solid ${colors.primary}55`,
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
  leaderboardButton: {
    width: '100%',
    padding: '14px 24px',
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
  loadingText: {
    fontSize: '16px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
    textAlign: 'center',
    padding: '64px 0',
  },
  errorText: {
    fontSize: '16px',
    color: colors.secondary,
    fontFamily: '"JetBrains Mono", monospace',
    textAlign: 'center',
    padding: '64px 0',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DailyRacePage() {
  const navigate = useNavigate();
  const { session, user } = useAuth();
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const [leaderboard, setLeaderboard] = useState<DailyLeaderboardData>({
    entries: [],
    neighborhood: null,
    totalRacers: 0,
  });
  const [countdown, setCountdown] = useState('');
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // This page is the destination of the challenge-share journey; clear the
  // stashed slug so it can't redirect future navigation in this tab.
  useEffect(() => {
    clearChallengeSlug();
  }, []);

  // ------- Fetch daily race info -------

  const loadInfo = useCallback(async () => {
    if (!session?.access_token) return;
    setPhase({ name: 'loading' });
    const result = await fetchDailyRace(session.access_token);
    if (result.status === 'ok') {
      setPhase({ name: 'preRace', info: result.info });
    } else {
      setPhase({ name: 'error', message: "Failed to load today's race." });
    }
  }, [session]);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  // ------- Fetch leaderboard when on preRace -------

  // Top 8 keeps the rail height fixed; the pinned neighborhood covers
  // anyone ranked below that.
  useEffect(() => {
    if (phase.name !== 'preRace' || !session?.access_token) return;
    void fetchDailyLeaderboard(session.access_token, undefined, 8).then(
      setLeaderboard
    );
  }, [phase.name, session]);

  // ------- Countdown timer for "out of attempts" -------

  useEffect(() => {
    if (phase.name !== 'preRace' || phase.info.attemptsRemaining > 0) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return;
    }

    const tick = () => setCountdown(formatCountdown(msUntilNextUtcMidnight()));
    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [phase]);

  // ------- Start attempt handler -------

  const handleStart = useCallback(async () => {
    if (phase.name !== 'preRace' || !session?.access_token) return;
    const info = phase.info;

    const result = await startDailyAttempt(session.access_token);

    if (result.status === 'out_of_attempts') {
      // Race condition: used all attempts in another tab/device.
      void loadInfo();
      return;
    }
    if (result.status === 'error') {
      setPhase({ name: 'error', message: 'Failed to start attempt.' });
      return;
    }

    // UTC rollover: server returned a different date than what we loaded.
    if (result.raceDate !== info.raceDate) {
      void loadInfo();
      return;
    }

    setPhase({
      name: 'racing',
      info,
      gameId: result.gameId,
      attemptNumber: result.attemptNumber,
    });
  }, [phase, session, loadInfo]);

  // ------- Return to pre-race (after completion extras) -------

  const returnToPreRace = useCallback(() => {
    void loadInfo();
  }, [loadInfo]);

  // ------- Build race session config -------

  const dailyConfig: RaceSessionConfig | null = useMemo(() => {
    if (phase.name !== 'racing') return null;
    const { info, gameId } = phase;

    return {
      mode: 'daily',
      title: 'Race of the Day',
      subtitle: info.raceDate,
      fetchSession: async () => ({ tasks: info.tasks, gameId }),
      submitCompletion: async ({ accessToken, durationMs }) => {
        if (gameId == null || !accessToken) return null;
        const result = await completeDailyAttempt({
          accessToken,
          gameId,
          durationMs,
        });
        if (result.status !== 'ok') return null;
        return {
          kind: 'daily' as const,
          rank: result.placing.rank,
          totalRacers: result.placing.totalRacers,
          bestMs: result.placing.bestMs,
          attemptsRemaining: result.placing.attemptsRemaining,
        };
      },
      allowNewTasks: false,
      allowSameTasksReplay: false,
      renderCompletionExtras: (completionInfo: RaceCompletionInfo | null) => {
        return (
          <DailyCompletionExtras
            completionInfo={completionInfo}
            accessToken={session?.access_token}
            onTryAgain={returnToPreRace}
            onBackToLeaderboard={returnToPreRace}
          />
        );
      },
    };
  }, [phase, session, returnToPreRace]);

  // ------- Render -------

  // Racing phase: mount the shared race engine.
  if (phase.name === 'racing' && dailyConfig) {
    return (
      <RaceSessionPage
        key={phase.gameId ?? phase.attemptNumber}
        config={dailyConfig}
        initialSession={{ tasks: phase.info.tasks, gameId: phase.gameId }}
        autoStart
      />
    );
  }

  return (
    <div style={styles.wrapper}>
      <SiteBanner />
      <div style={styles.mainContent}>
        <div style={styles.bgGlow1} />
        <div style={styles.bgGlow2} />
        <div style={styles.container}>
          {phase.name === 'loading' && (
            <div style={styles.loadingText}>Loading today&apos;s race...</div>
          )}

          {phase.name === 'error' && (
            <div style={styles.errorText}>{phase.message}</div>
          )}

          {phase.name === 'preRace' && (
            <PreRaceScreen
              info={phase.info}
              leaderboard={leaderboard}
              countdown={countdown}
              userId={user?.id ?? null}
              onStart={handleStart}
              onBack={() => navigate('/')}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pre-race sub-component
// ---------------------------------------------------------------------------

/**
 * Pre-race screen showing date, attempt dots, start button or countdown,
 * best time, and leaderboard panel.
 */
function PreRaceScreen({
  info,
  leaderboard,
  countdown,
  userId,
  onStart,
  onBack,
}: {
  info: DailyRaceInfo;
  leaderboard: DailyLeaderboardData;
  countdown: string;
  userId: string | null;
  onStart: () => void;
  onBack: () => void;
}) {
  const usedCount = info.attempts.length;
  const totalSlots = usedCount + info.attemptsRemaining;
  const outOfAttempts = info.attemptsRemaining === 0;

  // The user's own placing (from either board section) for the share modal.
  const ownEntry = [
    ...leaderboard.entries,
    ...(leaderboard.neighborhood ?? []),
  ].find((e) => e.userId === userId);
  const ownPlacing = ownEntry
    ? { rank: ownEntry.rank, totalRacers: leaderboard.totalRacers }
    : null;

  return (
    <div className="daily-split" style={styles.split}>
      {/* Left: the race stage */}
      <div style={styles.stage}>
        <button style={styles.backArrow} onClick={onBack} aria-label="Back">
          <svg
            width="34"
            height="26"
            viewBox="0 0 34 26"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M14 3 L4 13 L14 23 M4 13 H31"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div style={styles.title}>Race of the Day</div>
        <div style={styles.dateHeader}>{info.raceDate}</div>

        {/* Attempts + best time meta row */}
        <div style={styles.metaRow}>
          <span
            style={styles.attemptDots}
            aria-label={`${usedCount} of ${totalSlots} attempts used`}
          >
            {Array.from({ length: totalSlots }, (_, i) => (
              <span
                key={i}
                style={i < usedCount ? styles.dotUsed : styles.dotFree}
              >
                {i < usedCount ? '●' : '○'}
              </span>
            ))}
          </span>
          <span style={styles.metaText}>
            {usedCount} of {totalSlots} attempts used
          </span>
          {info.bestMs != null && (
            <span style={styles.bestTime}>best {formatTime(info.bestMs)}</span>
          )}
        </div>

        {/* Out-of-attempts message and countdown */}
        {outOfAttempts && (
          <>
            <div style={styles.disabledMessage}>Come back tomorrow</div>
            <div style={styles.countdown}>
              <span>New race in </span>
              <span style={styles.countdownTime}>{countdown}</span>
            </div>
          </>
        )}

        {/* Actions: start (while attempts remain) + flex (once a time exists) */}
        <div style={styles.buttonRow}>
          {!outOfAttempts && (
            <button style={styles.startButton} onClick={onStart}>
              Start attempt {usedCount + 1} of {totalSlots}
            </button>
          )}
          {info.bestMs != null && <FlexShareButton placing={ownPlacing} />}
        </div>

        <div style={styles.subLine}>
          {info.tasks.length} tasks · same set for everyone · resets at midnight
          UTC
        </div>
      </div>

      {/* Right: leaderboard rail */}
      <aside style={styles.rail}>
        <div style={styles.railHead}>
          <span style={styles.leaderboardTitle}>Leaderboard</span>
          <span style={styles.railCount}>
            {leaderboard.totalRacers} racer
            {leaderboard.totalRacers === 1 ? '' : 's'}
          </span>
        </div>
        {leaderboard.entries.length === 0 ? (
          <div style={styles.leaderboardEmpty}>No entries yet</div>
        ) : (
          <>
            {leaderboard.entries.map((entry) => (
              <LeaderboardRow
                key={entry.userId}
                entry={entry}
                userId={userId}
              />
            ))}
            {leaderboard.neighborhood && (
              <>
                <div style={styles.railDivider} aria-hidden="true">
                  ···
                </div>
                {leaderboard.neighborhood.map((entry) => (
                  <LeaderboardRow
                    key={entry.userId}
                    entry={entry}
                    userId={userId}
                  />
                ))}
              </>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

/**
 * A single board row: rank, name, time. The signed-in user's row is
 * highlighted and marked aria-current. Shared by the top list and the
 * pinned neighborhood.
 */
function LeaderboardRow({
  entry,
  userId,
}: {
  entry: DailyLeaderboardEntry;
  userId: string | null;
}) {
  const isOwn = entry.userId === userId;
  return (
    <div
      style={{
        ...styles.leaderboardRow,
        ...(isOwn ? styles.leaderboardRowOwn : {}),
      }}
      aria-current={isOwn ? 'true' : undefined}
    >
      <span style={styles.leaderboardRank}>#{entry.rank}</span>
      <span style={styles.leaderboardName}>{entry.displayName}</span>
      <span style={styles.leaderboardTime}>{formatTime(entry.bestMs)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flex (share) button
// ---------------------------------------------------------------------------

/**
 * The pre-race share button. Rendered once the user has a finished time;
 * opens the share modal. Styled as the anti-CTA: dark body, magenta/amber
 * gradient border.
 */
function FlexShareButton({
  placing,
}: {
  placing: { rank: number; totalRacers: number } | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="daily-flex-btn"
        style={styles.flexButton}
        onClick={() => setOpen(true)}
      >
        Flex on people
      </button>
      {open && (
        <FlexShareModal placing={placing} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/**
 * Share modal: mints (or fetches) today's share link on open, offers a
 * copy row, and previews the rich unfurl card that Slack/Discord/iMessage
 * render from the link's OG tags (see backend/routes/share.ts).
 */
function FlexShareModal({
  placing,
  onClose,
}: {
  placing: { rank: number; totalRacers: number } | null;
  onClose: () => void;
}) {
  const { session, profile } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!session?.access_token) return;
    void createDailyShareLink(session.access_token).then((result) => {
      if (cancelled) return;
      if (result.status === 'ok') setUrl(result.url);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [session]);

  const handleCopy = () => {
    if (!url) return;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2500);
  };

  const name = profile?.display_name ?? 'You';
  const rankLine = placing
    ? `#${placing.rank} of ${placing.totalRacers}`
    : 'their rank';

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share your result"
        style={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.modalHead}>
          <span style={styles.modalTitle}>Flex on people</span>
          <button
            style={styles.modalClose}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div style={styles.linkRow}>
          <input
            style={styles.linkInput}
            readOnly
            value={
              failed
                ? 'Could not create link — try again'
                : (url ?? 'Minting your link…')
            }
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Share link"
          />
          <button
            style={styles.copyButton}
            onClick={handleCopy}
            disabled={!url}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div style={styles.previewLabel}>
          How it unfurls in Slack, Discord, or iMessage:
        </div>
        <div style={styles.previewCard}>
          <div style={styles.previewTitle}>
            {name} placed {rankLine} in today&apos;s VIMGYM daily
          </div>
          <div style={styles.previewDesc}>
            {name} thinks they&apos;re better than you. (at vim.) Race
            today&apos;s daily and prove them wrong.
          </div>
          <div style={styles.previewHost}>vimgym.app</div>
        </div>

        <p style={styles.modalCaption}>
          Anyone who opens it sees your taunt on the sign-in page and gets
          dropped straight into today&apos;s race.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Completion extras sub-component
// ---------------------------------------------------------------------------

/**
 * Extra UI rendered inside the race-session completion overlay for daily mode:
 * placing, share button, try-again, and back-to-leaderboard.
 */
function DailyCompletionExtras({
  completionInfo,
  accessToken,
  onTryAgain,
  onBackToLeaderboard,
}: {
  completionInfo: RaceCompletionInfo | null;
  accessToken: string | undefined;
  onTryAgain: () => void;
  onBackToLeaderboard: () => void;
}) {
  const [shareLabel, setShareLabel] = useState('Share your time');
  const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
    };
  }, []);

  if (!completionInfo || completionInfo.kind !== 'daily') return null;

  const { rank, totalRacers, attemptsRemaining } = completionInfo;

  const handleShare = async () => {
    if (!accessToken) return;
    const result = await createDailyShareLink(accessToken);
    if (result.status === 'ok') {
      void navigator.clipboard.writeText(result.url);
      setShareLabel('Link copied. Time to ruin a friendship.');
      if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
      shareTimerRef.current = setTimeout(
        () => setShareLabel('Share your time'),
        3000
      );
    }
  };

  return (
    <div style={styles.extrasContainer}>
      <div style={styles.placingLine}>
        #{rank} of {totalRacers} today
      </div>

      <div style={styles.shareBlock}>
        <div style={styles.shareTitle}>Challenge your friends</div>
        <button style={styles.shareButton} onClick={handleShare}>
          {shareLabel}
        </button>
      </div>

      {attemptsRemaining > 0 && (
        <button style={styles.tryAgainButton} onClick={onTryAgain}>
          Try again ({attemptsRemaining} left)
        </button>
      )}

      <button style={styles.leaderboardButton} onClick={onBackToLeaderboard}>
        Back to leaderboard
      </button>
    </div>
  );
}
