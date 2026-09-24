/**
 * Race of the Day page (/daily).
 *
 * Owns the daily-specific chrome: pre-race screen (attempt dots, start
 * button, countdown, leaderboard panel) and the completion extras (attempt
 * times, try-again, share link). The actual racing UI is RaceSessionPage from
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
  fetchDailyRaceCached,
  getCachedDailyRace,
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
import { RaceSessionPage } from './practice/PracticeEditor';
import { SiteBanner } from '../components/SiteBanner';
import { clearChallengeSlug } from '../lib/challengeRedirect';
import { useUtcMidnightCountdown } from '../lib/dailyCountdown';

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

// ---------------------------------------------------------------------------
// Styles (follows practice.tsx ready-screen vocabulary)
// ---------------------------------------------------------------------------

/**
 * Height held open for the results-screen extras block, in pixels, so the
 * summary card is exactly as tall while the attempt is being scored as it is
 * once the placing arrives. Set a little above the loaded content — one row of
 * attempt tiles (~95px), the action row (~55px), the back link (~26px) and the
 * 28px gaps between them — so neither state ever resizes the card.
 */
const EXTRAS_RESERVED_HEIGHT = 248;

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
    maxWidth: '1200px',
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
    gap: '36px',
    alignItems: 'stretch',
  },
  stage: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '22px',
    padding: '24px 0',
  },
  // Same typographic treatment as the title, one step down in scale.
  dateHeader: {
    fontSize: '24px',
    fontWeight: 800,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    letterSpacing: '-0.5px',
    textShadow: `0 0 20px ${colors.primaryGlow}`,
  },
  title: {
    fontSize: '54px',
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
    fontSize: '17px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
  },
  attemptDots: {
    display: 'inline-flex',
    gap: '10px',
    fontSize: '22px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  dotUsed: {
    color: colors.warning,
  },
  dotFree: {
    color: colors.textMuted,
  },
  bestTime: {
    fontSize: '17px',
    color: colors.successLight,
    fontFamily: '"JetBrains Mono", monospace',
  },
  buttonRow: {
    display: 'flex',
    gap: '14px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  // Matches metaText ("N of 3 attempts used") for a consistent caption tier.
  subLine: {
    fontSize: '17px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
  },
  flexButton: {
    padding: '18px 30px',
    fontSize: '17px',
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
  // Results-screen variant: rounded to match the pill it sits next to.
  flexButtonPill: {
    borderRadius: '999px',
    padding: '16px 30px',
  },
  startButton: {
    padding: '20px 32px',
    fontSize: '19px',
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
  countdown: {
    fontSize: '16px',
    color: colors.textMuted,
    fontFamily: '"JetBrains Mono", monospace',
  },
  countdownTime: {
    color: colors.warning,
    fontWeight: 700,
    fontSize: '22px',
    letterSpacing: '2px',
  },
  // The quiet way out, matching the results screen's "Back to leaderboard":
  // bare muted text below the stage content, never competing with the title.
  homeLink: {
    padding: '4px 0',
    width: 'fit-content',
    fontSize: '15px',
    fontWeight: 500,
    background: 'transparent',
    border: 'none',
    color: colors.textMuted,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
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
  // The og.png slot: locked to the card's 1200x630 ratio so the placeholder
  // and the loaded image occupy identical space.
  previewImage: {
    width: '100%',
    aspectRatio: '1200 / 630',
    display: 'block',
    objectFit: 'cover',
    borderRadius: '6px',
    border: `1px solid ${colors.border}`,
    background: colors.bgDark,
    marginTop: '4px',
  },
  // Leaderboard rail (right column)
  rail: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '24px',
    maxHeight: '600px',
    overflowY: 'auto',
    alignSelf: 'center',
    width: '100%',
  },
  railHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderBottom: `1px solid ${colors.border}`,
    paddingBottom: '14px',
    marginBottom: '12px',
  },
  // Left inset matches the rows' 14px padding so the dots sit under the ranks.
  railDivider: {
    textAlign: 'left',
    color: colors.textMuted,
    fontSize: '15px',
    padding: '4px 14px',
    userSelect: 'none',
    fontFamily: '"JetBrains Mono", monospace',
  },
  leaderboardTitle: {
    fontSize: '17px',
    fontWeight: 700,
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: '1.5px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  leaderboardRow: {
    display: 'grid',
    gridTemplateColumns: '48px 1fr 92px',
    gap: '8px',
    alignItems: 'center',
    padding: '12px 14px',
    borderRadius: '8px',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '16px',
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
    fontSize: '16px',
    textAlign: 'center',
    padding: '16px 0',
  },
  // Completion extras.
  //
  // Three tiers, each a different shape so nothing reads as a row of
  // identical bars: the attempt times are upright tiles side by side, the
  // actions are wide pills below them, and the way out is bare text.
  extrasContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '28px',
    width: '100%',
    marginTop: '8px',
    // Same height whether the placing has arrived or not — see
    // EXTRAS_RESERVED_HEIGHT.
    minHeight: `${EXTRAS_RESERVED_HEIGHT}px`,
  },
  // The spinner shown in that reserved space while the placing is in flight.
  extrasSpinner: {
    width: '36px',
    height: '36px',
    border: `3px solid ${colors.border}`,
    borderTopColor: colors.primary,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  attemptGrid: {
    display: 'grid',
    gap: '14px',
    width: '100%',
  },
  attemptTile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '22px 12px',
    borderRadius: '14px',
    border: `1px solid ${colors.border}`,
    background: `${colors.bgDark}80`,
    fontFamily: '"JetBrains Mono", monospace',
  },
  // The attempt that just finished, so the fresh time is findable at a glance.
  attemptTileCurrent: {
    border: `1px solid ${colors.primary}`,
    background: `${colors.primary}18`,
    boxShadow: `0 0 22px ${colors.primaryGlow}`,
  },
  // A slot still available today: outlined, not filled in.
  attemptTileOpen: {
    border: `1px dashed ${colors.border}`,
    background: 'transparent',
  },
  attemptLabel: {
    color: colors.textMuted,
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '1px',
    textTransform: 'uppercase',
  },
  attemptTime: {
    color: colors.textSecondary,
    fontWeight: 700,
    fontSize: '26px',
    lineHeight: 1,
  },
  attemptTimeCurrent: {
    color: colors.primaryLight,
  },
  attemptTimeOpen: {
    color: colors.textMuted,
    opacity: 0.5,
  },
  actionRow: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '14px',
    flexWrap: 'wrap',
  },
  tryAgainPill: {
    padding: '16px 30px',
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    color: colors.bgDark,
    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
    border: '2px solid transparent',
    borderRadius: '999px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    boxShadow: `0 0 22px ${colors.primaryGlow}`,
    transition: 'all 0.2s ease',
  },
  submitFailedNotice: {
    margin: 0,
    maxWidth: '420px',
    textAlign: 'center',
    fontSize: '14px',
    lineHeight: 1.5,
    color: colors.textMuted,
    fontFamily: '"JetBrains Mono", monospace',
  },
  leaderboardLink: {
    padding: '4px 8px',
    fontSize: '14px',
    fontWeight: 500,
    background: 'transparent',
    border: 'none',
    color: colors.textMuted,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
  loadingWrapper: {
    display: 'flex',
    justifyContent: 'center',
    padding: '64px 0',
  },
  loadingSpinner: {
    width: '36px',
    height: '36px',
    border: `3px solid ${colors.border}`,
    borderTopColor: colors.primary,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
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
  // Seed from the in-memory race cache (warmed by the home page) so arriving
  // here paints the pre-race screen immediately instead of flashing a spinner.
  const [phase, setPhase] = useState<Phase>(() => {
    const cached = getCachedDailyRace();
    return cached ? { name: 'preRace', info: cached } : { name: 'loading' };
  });
  const [leaderboard, setLeaderboard] = useState<DailyLeaderboardData>({
    entries: [],
    neighborhood: null,
    totalRacers: 0,
  });
  // Only counts while the user is out of attempts — that's the one state where
  // "when does the next race start" is the question on their mind.
  const countdown = useUtcMidnightCountdown(
    phase.name === 'preRace' && phase.info.attemptsRemaining === 0
  );

  // This page is the destination of the challenge-share journey; clear the
  // stashed slug so it can't redirect future navigation in this tab.
  useEffect(() => {
    clearChallengeSlug();
  }, []);

  // ------- Fetch daily race info -------

  const loadInfo = useCallback(async () => {
    if (!session?.access_token) return;
    // A cached race (from the home page, or from this page's own last load)
    // lands synchronously — no spinner. Mutations (starting or completing an
    // attempt) invalidate the cache, so a stale hit here can't happen.
    const cached = getCachedDailyRace();
    if (cached) {
      setPhase({ name: 'preRace', info: cached });
      return;
    }
    setPhase({ name: 'loading' });
    const result = await fetchDailyRaceCached(session.access_token);
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
  // anyone ranked below that. Fetched during 'loading' too, in parallel with
  // the race info rather than serialized behind it; the API client's TTL
  // cache absorbs the repeat call when the phase flips to 'preRace'.
  useEffect(() => {
    if (phase.name !== 'preRace' && phase.name !== 'loading') return;
    if (!session?.access_token) return;
    void fetchDailyLeaderboard(session.access_token, undefined, 8).then(
      setLeaderboard
    );
  }, [phase.name, session]);

  // ------- Start attempt handlers -------

  /**
   * Claim an attempt slot from the server and drop into the race, carrying the
   * given race info along for the ride. Falls back to a full reload when the
   * server disagrees with what we loaded (attempts spent elsewhere, or a UTC
   * date rollover mid-session).
   */
  const beginAttempt = useCallback(
    async (info: DailyRaceInfo) => {
      if (!session?.access_token) return;

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
    },
    [session, loadInfo]
  );

  const handleStart = useCallback(() => {
    if (phase.name !== 'preRace') return;
    void beginAttempt(phase.info);
  }, [phase, beginAttempt]);

  /**
   * Retry straight from the results screen. Re-reads the race info first so the
   * next summary's attempt list includes the run that just finished, but starts
   * the attempt regardless if that read fails.
   */
  const handleTryAgain = useCallback(async () => {
    if (phase.name !== 'racing' || !session?.access_token) return;
    const refreshed = await fetchDailyRace(session.access_token);
    await beginAttempt(refreshed.status === 'ok' ? refreshed.info : phase.info);
  }, [phase, session, beginAttempt]);

  // ------- Return to pre-race (after completion extras) -------

  const returnToPreRace = useCallback(() => {
    void loadInfo();
  }, [loadInfo]);

  // ------- Build race session config -------

  const dailyConfig: RaceSessionConfig | null = useMemo(() => {
    if (phase.name !== 'racing') return null;
    const { info, gameId, attemptNumber } = phase;

    return {
      mode: 'daily',
      title: 'Race of the Day',
      subtitle: info.raceDate,
      summaryTitle: 'Race Summary',
      showTaskBreakdown: false,
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
      renderCompletionExtras: (
        completionInfo: RaceCompletionInfo | null,
        finalTimeMs: number,
        isAwaitingCompletionInfo: boolean
      ) => {
        return (
          <DailyCompletionExtras
            completionInfo={completionInfo}
            isAwaitingCompletionInfo={isAwaitingCompletionInfo}
            raceDate={info.raceDate}
            loadedAttempts={info.attempts}
            justFinished={{ attemptNumber, durationMs: finalTimeMs }}
            onTryAgain={handleTryAgain}
            onBackToLeaderboard={returnToPreRace}
          />
        );
      },
    };
  }, [phase, handleTryAgain, returnToPreRace]);

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
            <div style={styles.loadingWrapper}>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <div style={styles.loadingSpinner} />
            </div>
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

  return (
    <div className="daily-split" style={styles.split}>
      {/* Left: the race stage */}
      <div style={styles.stage}>
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
          {info.bestMs != null && (
            <FlexShareButton bestMs={info.bestMs} raceDate={info.raceDate} />
          )}
        </div>

        <div style={styles.subLine}>
          {info.tasks.length} tasks · same set for everyone · resets at midnight
          UTC
        </div>

        <button style={styles.homeLink} onClick={onBack}>
          ← Back to home
        </button>
      </div>

      {/* Right: leaderboard rail */}
      <aside style={styles.rail}>
        <div style={styles.railHead}>
          <span style={styles.leaderboardTitle}>Leaderboard</span>
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
 * The share button, on both the pre-race screen and the results screen.
 * Rendered once the user has a finished time; opens the share modal. Styled as
 * the anti-CTA: dark body, magenta/amber gradient border. `pill` rounds it off
 * for the results screen, where it sits in a row of pills rather than beside
 * the squared-off start button.
 */
function FlexShareButton({
  bestMs,
  raceDate,
  pill = false,
}: {
  bestMs: number | null;
  /** The date of the race being shared, from the loaded DailyRaceInfo. */
  raceDate: string;
  pill?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="daily-flex-btn"
        style={
          pill
            ? { ...styles.flexButton, ...styles.flexButtonPill }
            : styles.flexButton
        }
        onClick={() => setOpen(true)}
      >
        Flex on people
      </button>
      {open && (
        <FlexShareModal
          bestMs={bestMs}
          raceDate={raceDate}
          onClose={() => setOpen(false)}
        />
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
  bestMs,
  raceDate,
  onClose,
}: {
  bestMs: number | null;
  /** Pins the minted link to the raced day, even across a UTC rollover. */
  raceDate: string;
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
    void createDailyShareLink(session.access_token, raceDate).then((result) => {
      if (cancelled) return;
      if (result.status === 'ok') setUrl(result.url);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [session, raceDate]);

  const handleCopy = () => {
    if (!url) return;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2500);
  };

  const name = profile?.display_name ?? 'You';
  // Mirrors the og:title the backend serves for this link (routes/share.ts):
  // seconds with one decimal, e.g. "38.4 seconds".
  const timeLine =
    bestMs != null ? `${(bestMs / 1000).toFixed(1)} seconds` : 'record time';

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
          How it looks in Slack, Discord, or iMessage:
        </div>
        {/* Mirrors a real unfurl: site line, bold title, description, then
            the large card image — the same og.png recipients actually see,
            served from the minted link (see backend/routes/share.ts). */}
        <div style={styles.previewCard}>
          <div style={styles.previewHost}>VIMGYM · vimgym.app</div>
          <div style={styles.previewTitle}>
            {name} finished the VIMGYM daily race in {timeLine}
          </div>
          <div style={styles.previewDesc}>
            They think they&apos;re better than you (at vim). Race today&apos;s
            daily and prove them wrong.
          </div>
          {url ? (
            <img
              style={styles.previewImage}
              src={`${url}/og.png`}
              alt="Share card image preview"
            />
          ) : (
            // Same-sized placeholder while the link mints, so the modal
            // doesn't jump when the real image arrives.
            <div style={styles.previewImage} aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Completion extras sub-component
// ---------------------------------------------------------------------------

/** One finished daily attempt: its slot number and how long it took. */
type FinishedAttempt = { attemptNumber: number; durationMs: number };

/**
 * Merge the attempt that just finished into the attempt list the page loaded
 * before the race, dropping unfinished attempts and sorting by slot so the
 * summary reads top-to-bottom in the order they were raced.
 */
function finishedAttemptsIncluding(
  loadedAttempts: DailyRaceInfo['attempts'],
  justFinished: FinishedAttempt
): FinishedAttempt[] {
  const merged = loadedAttempts
    .filter(
      (a): a is FinishedAttempt =>
        a.durationMs != null && a.attemptNumber !== justFinished.attemptNumber
    )
    .concat(justFinished);
  return merged.sort((a, b) => a.attemptNumber - b.attemptNumber);
}

/**
 * Extra UI rendered inside the race-session completion overlay for daily mode.
 * Deliberately minimal: today's attempt times, then try-again (while slots
 * remain), the flex (share) button shared with the pre-race screen, and a way
 * back to the leaderboard.
 */
export function DailyCompletionExtras({
  completionInfo,
  isAwaitingCompletionInfo = false,
  raceDate,
  loadedAttempts,
  justFinished,
  onTryAgain,
  onBackToLeaderboard,
}: {
  completionInfo: RaceCompletionInfo | null;
  /** True while the finished attempt is still being submitted for placing. */
  isAwaitingCompletionInfo?: boolean;
  /** The date of the race that was just finished, for the share link. */
  raceDate: string;
  loadedAttempts: DailyRaceInfo['attempts'];
  justFinished: FinishedAttempt;
  onTryAgain: () => void;
  onBackToLeaderboard: () => void;
}) {
  // The placing decides how many attempt slots are left, so there is nothing
  // real to draw until it lands. Spin in the reserved space rather than
  // rendering an empty card that resizes when the response arrives.
  if (isAwaitingCompletionInfo) {
    return (
      <div style={styles.extrasContainer}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div
          style={styles.extrasSpinner}
          role="status"
          aria-label="Scoring your run"
        />
      </div>
    );
  }

  // A null completionInfo means completeDailyAttempt failed (network blip,
  // expired token). This overlay is the only UI on screen at that point, so
  // it must still render the local attempt times and an exit — only the
  // actions that need the server's record of the run are withheld.
  const daily = completionInfo?.kind === 'daily' ? completionInfo : null;
  const attemptsRemaining = daily?.attemptsRemaining ?? 0;
  const attempts = finishedAttemptsIncluding(loadedAttempts, justFinished);

  // Unraced slots keep the tile row balanced and show what's still available;
  // they continue numbering from the last attempt actually raced.
  const lastAttemptNumber = attempts[attempts.length - 1].attemptNumber;
  const openSlots = Array.from(
    { length: attemptsRemaining },
    (_, i) => lastAttemptNumber + 1 + i
  );

  return (
    <div style={styles.extrasContainer}>
      <div
        style={{
          ...styles.attemptGrid,
          gridTemplateColumns: `repeat(${attempts.length + openSlots.length}, minmax(0, 1fr))`,
        }}
      >
        {attempts.map((attempt) => {
          const isJustFinished =
            attempt.attemptNumber === justFinished.attemptNumber;
          return (
            <div
              key={attempt.attemptNumber}
              style={
                isJustFinished
                  ? { ...styles.attemptTile, ...styles.attemptTileCurrent }
                  : styles.attemptTile
              }
              aria-current={isJustFinished ? 'true' : undefined}
            >
              <span style={styles.attemptLabel}>
                Attempt {attempt.attemptNumber}
              </span>
              <span
                style={
                  isJustFinished
                    ? { ...styles.attemptTime, ...styles.attemptTimeCurrent }
                    : styles.attemptTime
                }
              >
                {formatTime(attempt.durationMs)}
              </span>
            </div>
          );
        })}
        {openSlots.map((slotNumber) => (
          <div
            key={slotNumber}
            style={{ ...styles.attemptTile, ...styles.attemptTileOpen }}
          >
            <span style={styles.attemptLabel}>Attempt {slotNumber}</span>
            <span style={{ ...styles.attemptTime, ...styles.attemptTimeOpen }}>
              --
            </span>
          </div>
        ))}
      </div>

      {daily ? (
        <div style={styles.actionRow}>
          {attemptsRemaining > 0 && (
            <button style={styles.tryAgainPill} onClick={onTryAgain}>
              Try again ({attemptsRemaining} left)
            </button>
          )}
          <FlexShareButton bestMs={daily.bestMs} raceDate={raceDate} pill />
        </div>
      ) : (
        <p style={styles.submitFailedNotice}>
          Your time couldn&apos;t be submitted &mdash; check your connection and
          head back to the leaderboard to see where things stand.
        </p>
      )}

      <button style={styles.leaderboardLink} onClick={onBackToLeaderboard}>
        Back to leaderboard
      </button>
    </div>
  );
}
