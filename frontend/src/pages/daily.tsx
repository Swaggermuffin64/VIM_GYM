/**
 * Race of the Day page (/daily).
 *
 * Owns the daily-specific chrome: pre-race screen (attempt dots, start
 * button, countdown, leaderboard panel) and the completion extras (attempt
 * times, try-again, share link). The actual racing UI is RaceSessionPage from
 * practice.tsx, mounted only after an attempt slot is claimed -- visiting
 * this page never burns an attempt; clicking Start does.
 *
 * The page is public: share links (`/daily?challenge=<slug>`) land here, so a
 * visitor sees today's race, the board and the challenger's taunt before
 * signing in. Start is the gate -- for a visitor it goes to /login, carrying
 * the challenge along so the taunt shows there too and the stashed slug
 * brings them back here after OAuth.
 */
import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

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
  fetchChallenge,
} from '../api/daily';
import type {
  ChallengeInfo,
  DailyBoard,
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
import { ChallengeTaunt } from '../components/ChallengeTaunt';
import { LeaderboardModalFrame } from '../components/LeaderboardModalFrame';
import {
  clearChallengeSlug,
  isValidChallengeSlug,
  stashChallengeSlug,
} from '../lib/challengeRedirect';
import { useUtcMidnightCountdown } from '../lib/dailyCountdown';
import { DAILY_RAIL_RACER_COUNT } from '../lib/dailyRail';
import {
  badgeInfo,
  badgeTitle,
  chipsFor,
  formatEfficiency,
} from '../lib/dailyBadges';
import type { BadgeInfo } from '../lib/dailyBadges';
import { StatusSegment } from '../components/StatusSegment';
import { BadgeValue } from '../components/BadgeValue';
import { BrandedSpinner } from '../components/BrandedLoading';

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

/** Rows the leaderboard rail lists; the full-leaderboard dialog has the rest. */
const TOP_RACERS_ROW_COUNT = DAILY_RAIL_RACER_COUNT;

/**
 * Rows requested for the full-leaderboard dialog. Matches the most the leaderboard
 * endpoint will return (MAX_LEADERBOARD_LIMIT in backend/routes/daily.ts).
 */
const ALL_RACERS_ROW_LIMIT = 1000;

/**
 * Leaderboard column widths, shared by the column labels and every row so
 * they line up: rank, racer (takes the rest), Keys, Efficiency, Time.
 */
const LEADERBOARD_GRID = {
  gridTemplateColumns: '48px minmax(0, 1fr) 76px 86px 72px',
  columnGap: '14px',
};

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
    maxWidth: '1360px',
    width: '100%',
    margin: '0 auto',
    padding: '48px 32px',
    position: 'relative',
    zIndex: 1,
  },
  // Split-stage layout: race card left, leaderboard rail right, split down
  // the middle so the gap between them sits at the page's centre.
  split: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
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
    alignSelf: 'center',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  // Only the rows scroll, so the racer count and the full-leaderboard button
  // stay in view on a short window.
  railRows: {
    overflowY: 'auto',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  fullLeaderboardButton: {
    marginTop: '12px',
    padding: '10px 14px',
    fontSize: '14px',
    fontWeight: 600,
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    color: colors.textSecondary,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
  },
  // Title, sort switch, racer count and efficiency tip on one line.
  railHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    borderBottom: `1px solid ${colors.border}`,
    paddingBottom: '14px',
    marginBottom: '12px',
  },
  leaderboardTitle: {
    fontSize: '17px',
    fontWeight: 700,
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: '1.5px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  railCount: {
    marginLeft: 'auto',
    color: colors.textMuted,
    fontSize: '14px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  // Left inset matches the rows' padding + border so the dots sit under the ranks.
  railDivider: {
    textAlign: 'left',
    color: colors.textMuted,
    fontSize: '15px',
    padding: '0 15px',
    userSelect: 'none',
    fontFamily: '"JetBrains Mono", monospace',
  },
  // One grid for the column labels and every row: rank, racer (name over
  // badge chips), then Keys, Efficiency and Time, whichever order the board is in.
  // Baseline alignment keeps the rank and metrics on the name's line, with
  // the chips hanging below it.
  leaderboardRow: {
    display: 'grid',
    ...LEADERBOARD_GRID,
    alignItems: 'baseline',
    padding: '12px 14px',
    minHeight: '60px',
    boxSizing: 'border-box',
    borderRadius: '8px',
    border: '1px solid transparent',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '17px',
    lineHeight: 1.3,
  },
  // Today's podium (top 3) under the current sort.
  leaderboardRowPodium: {
    background: `${colors.warning}0f`,
  },
  leaderboardRowOwn: {
    background: `${colors.primary}15`,
    border: `1px solid ${colors.primary}40`,
  },
  leaderboardRank: {
    color: colors.textMuted,
    fontWeight: 700,
  },
  leaderboardRankPodium: {
    color: colors.warning,
    fontWeight: 700,
  },
  // Name on top, badge chips beneath; the name truncates on its own line.
  leaderboardNameCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
    minWidth: 0,
  },
  leaderboardName: {
    color: colors.textPrimary,
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  leaderboardChips: { display: 'flex', gap: '5px' },
  // Slightly dimmed so the chips sit behind the racer's name.
  badgeChip: { display: 'inline-flex', flexShrink: 0, opacity: 0.9 },
  // The column the board is sorted by stands out in cyan; the others stay
  // readable in light grey.
  leaderboardMetric: {
    fontSize: '16px',
    fontWeight: 500,
    color: '#cbd5e1',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  leaderboardMetricSorted: {
    fontSize: '17px',
    fontWeight: 600,
    color: colors.primaryLight,
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  // Column labels above the rows; same grid and side padding as a row.
  // Padding is the rows' padding plus their 1px border.
  leaderboardColumns: {
    display: 'grid',
    ...LEADERBOARD_GRID,
    alignItems: 'center',
    padding: '0 15px 8px',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '12px',
    fontWeight: 600,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
  },
  leaderboardColumnRight: {
    textAlign: 'right',
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: '4px',
  },
  leaderboardColumnSorted: { color: colors.primaryLight },
  // The "/47" after a racer's key count: the day's optimal, quieter.
  leaderboardKeysOptimal: {
    fontSize: '14px',
    fontWeight: 400,
    color: colors.textSecondary,
  },
  // The rail's top 5: one large row each; the podium tinted gold / silver / bronze.
  topRacerList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  topRacerRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: '20px',
    rowGap: '12px',
    padding: '18px 20px',
    borderRadius: '10px',
    border: '1px solid transparent',
    fontFamily: '"JetBrains Mono", monospace',
  },
  topRacerRank: {
    width: '40px',
    fontSize: '34px',
    fontWeight: 800,
    lineHeight: 1,
  },
  topRacerNameCell: {
    flex: '1 1 160px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '9px',
  },
  // Inherits the name's look; App.css underlines it on hover.
  racerNameLink: { color: 'inherit', textDecoration: 'none' },
  // Name plus the viewer's "you" tag; the name truncates, the tag never does.
  topRacerNameLine: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minWidth: 0,
  },
  topRacerYouTag: {
    flexShrink: 0,
    padding: '2px 7px',
    borderRadius: '4px',
    background: `${colors.primary}26`,
    color: colors.primaryLight,
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
  },
  topRacerName: {
    fontSize: '20px',
    fontWeight: 600,
    color: colors.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  topRacerStats: {
    display: 'grid',
    gridTemplateColumns: '78px 82px 76px',
    gap: '14px',
    textAlign: 'right',
    marginLeft: 'auto',
  },
  topRacerStat: { display: 'flex', flexDirection: 'column', gap: '4px' },
  topRacerStatLabel: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  topRacerStatValue: { fontSize: '17px', color: '#cbd5e1' },
  // The stat the board is sorted by: bigger, bold, cyan.
  topRacerStatValueSorted: {
    fontSize: '22px',
    fontWeight: 700,
    color: colors.primaryLight,
  },
  // "Your position": the viewer's own row when they're outside the top 5.
  ownPosition: {
    marginTop: '22px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  ownPositionLabel: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '12px',
    fontWeight: 600,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
  },
  ownPositionRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: '16px',
    rowGap: '6px',
    padding: '14px 20px',
    borderRadius: '8px',
    background: `${colors.primary}15`,
    border: `1px solid ${colors.primary}40`,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '17px',
  },
  ownPositionRank: { fontWeight: 700, color: '#cbd5e1' },
  ownPositionName: { fontWeight: 500, color: colors.textPrimary },
  ownPositionKeys: {
    marginLeft: 'auto',
    fontSize: '14px',
    color: colors.textSecondary,
  },
  ownPositionTime: { fontWeight: 600, color: colors.primaryLight },
  infoTipWrap: { position: 'relative', display: 'inline-flex' },
  infoTipButton: {
    background: 'transparent',
    border: `1px solid ${colors.textMuted}`,
    borderRadius: '50%',
    width: '14px',
    height: '14px',
    padding: 0,
    fontSize: '9px',
    lineHeight: '12px',
    fontWeight: 700,
    color: colors.textMuted,
    cursor: 'help',
    fontFamily: 'inherit',
  },
  infoTip: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    zIndex: 10,
    width: '270px',
    padding: '10px 12px',
    borderRadius: '8px',
    border: `1px solid ${colors.border}`,
    background: colors.bgCard,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
    color: colors.textSecondary,
    fontSize: '13px',
    fontWeight: 400,
    lineHeight: 1.5,
    textAlign: 'left',
    textTransform: 'none',
    letterSpacing: 0,
  },
  // Sort switch, inline in the rail's header.
  sortControl: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '12px',
    color: colors.textMuted,
  },
  sortButtons: {
    display: 'flex',
    gap: '4px',
    padding: '3px',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
  },
  sortButton: {
    padding: '5px 12px',
    fontSize: '13px',
    fontWeight: 600,
    background: 'transparent',
    border: 'none',
    borderRadius: '6px',
    color: colors.textMuted,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
  },
  sortButtonActive: {
    background: `${colors.primary}20`,
    color: colors.primaryLight,
  },
  // Board-switch loading (BoardLoadingCover / BoardLoadingPlaceholder).
  boardLoadingCover: { position: 'relative' },
  // The dim's resting state; `board-loading-dim` animates into it.
  boardLoadingStaleRows: { opacity: 0.35, pointerEvents: 'none' },
  boardLoadingSpinnerSlot: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Roughly three rail rows, so the first load doesn't start as a sliver.
  boardLoadingPlaceholder: {
    minHeight: '240px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
  const [searchParams] = useSearchParams();
  // Set when the visitor arrived via a share link. See the module comment.
  const rawSlug = searchParams.get('challenge');
  const challengeSlug = isValidChallengeSlug(rawSlug) ? rawSlug : null;
  const [challenge, setChallenge] = useState<ChallengeInfo | null>(null);
  // Seed from the in-memory race cache (warmed by the home page) so arriving
  // here paints the pre-race screen immediately instead of flashing a spinner.
  // The cache only ever holds a member's view, so a visitor never reads it.
  const [phase, setPhase] = useState<Phase>(() => {
    const cached = session ? getCachedDailyRace() : null;
    return cached ? { name: 'preRace', info: cached } : { name: 'loading' };
  });
  const [board, setBoard] = useState<DailyBoard>('speed');
  // The last rows fetched, tagged with their board. Null until the first
  // fetch lands. While a switch is in flight it still holds the old board,
  // which the rail shows dimmed under a spinner (see BoardLoadingCover).
  const [leaderboard, setLeaderboard] = useState<BoardSnapshot | null>(null);
  // Only counts while the user is out of attempts — that's the one state where
  // "when does the next race start" is the question on their mind.
  const countdown = useUtcMidnightCountdown(
    phase.name === 'preRace' && phase.info.attemptsRemaining === 0
  );

  // This page is the destination of the challenge-share journey. A member
  // has arrived, so the stashed slug is cleared before it can redirect any
  // later navigation in this tab. A visitor is only halfway: stash the slug
  // (before anything async, since OAuth can redirect at any time) so login
  // and onboarding bring them back here.
  useEffect(() => {
    if (session) {
      clearChallengeSlug();
    } else if (challengeSlug) {
      stashChallengeSlug(challengeSlug);
    }
  }, [session, challengeSlug]);

  useEffect(() => {
    if (!challengeSlug) return;
    let cancelled = false;
    void fetchChallenge(challengeSlug).then((info) => {
      if (!cancelled) setChallenge(info);
    });
    return () => {
      cancelled = true;
    };
  }, [challengeSlug]);

  // ------- Fetch daily race info -------

  const loadInfo = useCallback(async () => {
    // A cached race (from the home page, or from this page's own last load)
    // lands synchronously — no spinner. Mutations (starting or completing an
    // attempt) invalidate the cache, so a stale hit here can't happen.
    const cached = session ? getCachedDailyRace() : null;
    if (cached) {
      setPhase({ name: 'preRace', info: cached });
      return;
    }
    setPhase({ name: 'loading' });
    const result = await fetchDailyRaceCached(session?.access_token ?? null);
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

  // The rail shows the top slice and last place; the full-leaderboard dialog
  // fetches the rest itself. Fetched during 'loading' too, in parallel with the race info
  // rather than serialized behind it; the API client's TTL cache absorbs the
  // repeat call when the phase flips to 'preRace'.
  useEffect(() => {
    if (phase.name !== 'preRace' && phase.name !== 'loading') return;
    let cancelled = false;
    void fetchDailyLeaderboard(
      session?.access_token ?? null,
      undefined,
      TOP_RACERS_ROW_COUNT,
      board
    ).then((data) => {
      if (!cancelled) setLeaderboard({ board, data });
    });
    return () => {
      cancelled = true;
    };
  }, [phase.name, session, board]);

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

  // Start is the sign-in gate for visitors. The challenge rides along so the
  // login page can show the same taunt.
  const handleStart = useCallback(() => {
    if (phase.name !== 'preRace') return;
    if (!session) {
      navigate(challengeSlug ? `/login?challenge=${challengeSlug}` : '/login');
      return;
    }
    void beginAttempt(phase.info);
  }, [phase, session, challengeSlug, navigate, beginAttempt]);

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

          {challenge && phase.name !== 'loading' && (
            <ChallengeTaunt
              challenge={challenge}
              callToAction={
                session
                  ? 'Put them in their place.'
                  : 'Start an attempt and put them in their place.'
              }
            />
          )}

          {phase.name === 'preRace' && (
            <PreRaceScreen
              info={phase.info}
              board={board}
              onBoardChange={setBoard}
              leaderboard={leaderboard}
              accessToken={session?.access_token ?? null}
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
 * best time, and leaderboard panel. The panel lists the top slice and opens
 * DailyFullLeaderboardModal for the whole field.
 */
function PreRaceScreen({
  info,
  board,
  onBoardChange,
  leaderboard,
  accessToken,
  countdown,
  userId,
  onStart,
  onBack,
}: {
  info: DailyRaceInfo;
  board: DailyBoard;
  onBoardChange: (board: DailyBoard) => void;
  /**
   * The last rows fetched; null before the first fetch. Its board differs
   * from `board` while a switch is loading.
   */
  leaderboard: BoardSnapshot | null;
  /** Passed on to the full-leaderboard dialog's fetch; null for a visitor. */
  accessToken: string | null;
  countdown: string;
  userId: string | null;
  onStart: () => void;
  onBack: () => void;
}) {
  const usedCount = info.attempts.length;
  const totalSlots = usedCount + info.attemptsRemaining;
  const outOfAttempts = info.attemptsRemaining === 0;
  const [fullLeaderboardOpen, setFullLeaderboardOpen] = useState(false);
  const shown = leaderboard?.data ?? null;
  // The board the visible rows belong to, so a stale slice keeps its own
  // emphasised column until the new one lands.
  const shownBoard = leaderboard?.board ?? board;
  const hasUnlistedRacers =
    shown !== null && shown.totalRacers > shown.entries.length;
  const ownRowOutsideTop = shown ? findOwnRowOutsideTop(shown, userId) : null;

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
          <SortControl board={board} onChange={onBoardChange} />
          {shown && shown.totalRacers > 0 && (
            <span style={styles.railCount}>
              {formatRacerCount(shown.totalRacers)}
            </span>
          )}
          <KeyColumnsTip />
        </div>
        {shown === null ? (
          <BoardLoadingPlaceholder />
        ) : (
          <BoardLoadingCover loading={leaderboard?.board !== board}>
            {shown.entries.length === 0 ? (
              <div style={styles.leaderboardEmpty}>
                {emptyBoardText(shownBoard)}
              </div>
            ) : (
              <div style={styles.railRows}>
                <div style={styles.topRacerList}>
                  {shown.entries.map((entry) => (
                    <TopRacerRow
                      key={entry.userId}
                      board={shownBoard}
                      entry={entry}
                      userId={userId}
                    />
                  ))}
                </div>
                {ownRowOutsideTop && (
                  <OwnPositionRow board={shownBoard} entry={ownRowOutsideTop} />
                )}
              </div>
            )}
          </BoardLoadingCover>
        )}
        {hasUnlistedRacers && (
          <button
            style={styles.fullLeaderboardButton}
            onClick={() => setFullLeaderboardOpen(true)}
          >
            Show all {shown.totalRacers} racers
          </button>
        )}
      </aside>

      {fullLeaderboardOpen && (
        <DailyFullLeaderboardModal
          board={board}
          onBoardChange={onBoardChange}
          accessToken={accessToken}
          userId={userId}
          onClose={() => setFullLeaderboardOpen(false)}
        />
      )}
    </div>
  );
}

/** One board's fetched rows, tagged with the board they were fetched for. */
interface BoardSnapshot {
  board: DailyBoard;
  data: DailyLeaderboardData;
}

/**
 * Keeps the last board's rows in place while a Speed / Key Efficiency switch
 * loads, dimmed under the amber spinner, so the panel holds its height
 * instead of collapsing to a line of text and springing back. The dimming
 * and spinner fade in after a short delay (`board-loading-dim` and
 * `board-loading-fade-in` in App.css), so a switch the cache answers at once never flickers.
 */
function BoardLoadingCover({
  loading,
  children,
}: {
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.boardLoadingCover} aria-busy={loading}>
      <div
        style={loading ? styles.boardLoadingStaleRows : undefined}
        className={loading ? 'board-loading-dim' : undefined}
        inert={loading || undefined}
      >
        {children}
      </div>
      {loading && (
        <div
          style={styles.boardLoadingSpinnerSlot}
          className="board-loading-fade-in"
          role="status"
          aria-label="Loading leaderboard"
        >
          <BrandedSpinner />
        </div>
      )}
    </div>
  );
}

/** The amber spinner in a fixed-height slot, before any rows have loaded. */
function BoardLoadingPlaceholder() {
  return (
    <div
      style={styles.boardLoadingPlaceholder}
      role="status"
      aria-label="Loading leaderboard"
    >
      <BrandedSpinner />
    </div>
  );
}

/**
 * The dialog behind the rail's "Show full leaderboard": every racer who has
 * finished today, in the same frame the home page's full leaderboard uses.
 * Fetches the whole field itself when opened, so the page only ever pays for
 * the top slice until someone asks for more. Its Speed / Key Efficiency
 * switch is the rail's own board selection, so a switch made here is still in
 * effect on the rail after the dialog closes.
 */
function DailyFullLeaderboardModal({
  board,
  onBoardChange,
  accessToken,
  userId,
  onClose,
}: {
  /** Which board to list, shared with the rail's switch. */
  board: DailyBoard;
  onBoardChange: (board: DailyBoard) => void;
  accessToken: string | null;
  userId: string | null;
  onClose: () => void;
}) {
  // The last field fetched, tagged with its board: kept on screen, dimmed,
  // while a switch loads (see BoardLoadingCover).
  const [fetched, setFetched] = useState<BoardSnapshot | null>(null);
  const field = fetched?.data ?? null;
  const fieldBoard = fetched?.board ?? board;

  useEffect(() => {
    let closed = false;
    void fetchDailyLeaderboard(
      accessToken,
      undefined,
      ALL_RACERS_ROW_LIMIT,
      board
    ).then((data) => {
      if (!closed) setFetched({ board, data });
    });
    return () => {
      closed = true;
    };
  }, [accessToken, board]);

  return (
    <LeaderboardModalFrame
      title={
        board === 'speed' ? 'Leaderboard' : 'Leaderboard by key efficiency'
      }
      titleDetail={field ? formatRacerCount(field.totalRacers) : undefined}
      controls={<SortControl board={board} onChange={onBoardChange} />}
      width="wide"
      onClose={onClose}
    >
      {field === null ? (
        <BoardLoadingPlaceholder />
      ) : (
        <BoardLoadingCover loading={fieldBoard !== board}>
          {field.entries.length === 0 ? (
            <div style={styles.leaderboardEmpty}>
              {emptyBoardText(fieldBoard)}
            </div>
          ) : (
            <LeaderboardRows
              board={fieldBoard}
              entries={field.entries}
              entriesBelowDivider={field.neighborhood}
              userId={userId}
            />
          )}
        </BoardLoadingCover>
      )}
    </LeaderboardModalFrame>
  );
}

/**
 * A run of board rows, optionally followed by a "···" divider and more rows
 * from further down the field. The rail puts last place below the divider;
 * the full-leaderboard dialog puts the signed-in user's rank±1 rows there in
 * the rare case the field is too large to list whole.
 */
function LeaderboardRows({
  board,
  entries,
  entriesBelowDivider,
  userId,
}: {
  board: DailyBoard;
  entries: DailyLeaderboardEntry[];
  entriesBelowDivider: DailyLeaderboardEntry[] | null;
  userId: string | null;
}) {
  return (
    <>
      <LeaderboardColumns board={board} />
      {entries.map((entry) => (
        <LeaderboardRow
          key={entry.userId}
          board={board}
          entry={entry}
          userId={userId}
        />
      ))}
      {entriesBelowDivider && (
        <>
          <div style={styles.railDivider} aria-hidden="true">
            ···
          </div>
          {entriesBelowDivider.map((entry) => (
            <LeaderboardRow
              key={entry.userId}
              board={board}
              entry={entry}
              userId={userId}
            />
          ))}
        </>
      )}
    </>
  );
}

/**
 * Speed / Key Efficiency switch, in the rail's header and the
 * full-leaderboard dialog. Both orders show the same columns: Speed ranks
 * each racer's best time; Key Efficiency ranks their most keystroke-efficient
 * attempt (optimal ÷ actual keys).
 */
function SortControl({
  board,
  onChange,
}: {
  board: DailyBoard;
  onChange: (board: DailyBoard) => void;
}) {
  const option = (value: DailyBoard, label: string, title: string) => (
    <button
      type="button"
      aria-pressed={board === value}
      title={title}
      style={
        board === value
          ? { ...styles.sortButton, ...styles.sortButtonActive }
          : styles.sortButton
      }
      onClick={() => onChange(value)}
    >
      {label}
    </button>
  );
  return (
    <div style={styles.sortControl}>
      <div
        role="group"
        aria-label="Sort leaderboard by"
        style={styles.sortButtons}
      >
        {option('speed', 'Speed', 'Fastest best time first')}
        {option(
          'efficiency',
          'Key Efficiency',
          'Fewest keystrokes versus the optimal solution first'
        )}
      </div>
    </div>
  );
}

/** What an empty board says, per board. */
function emptyBoardText(board: DailyBoard): string {
  return board === 'speed' ? 'No entries yet' : 'No scored runs yet';
}

/** The size of today's field in words: "1 racer", "312 racers". */
function formatRacerCount(totalRacers: number): string {
  return `${totalRacers} ${totalRacers === 1 ? 'racer' : 'racers'}`;
}

/**
 * A single board row: rank, name with badge chips beneath, then Keys, Efficiency
 * and Time, with the column the board is sorted by highlighted. Today's top
 * 3 are tinted; the signed-in user's row is highlighted and marked
 * aria-current.
 */
function LeaderboardRow({
  board,
  entry,
  userId,
}: {
  board: DailyBoard;
  entry: DailyLeaderboardEntry;
  userId: string | null;
}) {
  const isOwn = entry.userId === userId;
  const isPodium = entry.rank <= 3;
  const { efficiency, optimalKeys, actualKeys } = entry;
  const pct = efficiency === null ? '—' : formatEfficiency(efficiency);
  const hasKeys = optimalKeys !== null && actualKeys !== null;
  const metric = (sortedOn: DailyBoard) =>
    board === sortedOn
      ? styles.leaderboardMetricSorted
      : styles.leaderboardMetric;
  return (
    <div
      style={{
        ...styles.leaderboardRow,
        ...(isPodium ? styles.leaderboardRowPodium : {}),
        ...(isOwn ? styles.leaderboardRowOwn : {}),
      }}
      aria-current={isOwn ? 'true' : undefined}
    >
      <span
        style={isPodium ? styles.leaderboardRankPodium : styles.leaderboardRank}
      >
        #{entry.rank}
      </span>
      <span style={styles.leaderboardNameCell}>
        <span style={styles.leaderboardName}>{entry.displayName}</span>
        <BadgeChipList entry={entry} />
      </span>
      <span
        style={metric('efficiency')}
        title={
          hasKeys
            ? `${actualKeys} keys used, ${optimalKeys} optimal · ${pct}`
            : undefined
        }
      >
        {hasKeys ? (
          <>
            {actualKeys}
            <span style={styles.leaderboardKeysOptimal}>/{optimalKeys}</span>
          </>
        ) : (
          '—'
        )}
      </span>
      <span style={styles.leaderboardMetric}>{pct}</span>
      <span style={metric('speed')}>{formatTime(entry.bestMs)}</span>
    </div>
  );
}

/**
 * The badges beside a racer's name: the same ones their profile card shows
 * (their showcase picks, else their latest earned, chosen by the server), or
 * the automatic wins / podium / streak chips (chipsFor) for a racer who has
 * earned no badges yet. Showcase picks keep the player's chosen order.
 */
function BadgeChipList({ entry }: { entry: DailyLeaderboardEntry }) {
  const wins = entry.badges
    ? {
        speed: entry.badges.speedWins,
        efficiency: entry.badges.efficiencyWins,
      }
    : null;
  const showcased = entry.showcasedBadges
    .map((id) => badgeInfo(id))
    .filter((info): info is BadgeInfo => info !== undefined);
  const chips =
    showcased.length > 0
      ? showcased.map((info) => ({
          key: info.id,
          kind: info.kind,
          label: info.label,
          value: <BadgeValue info={info} wins={wins} />,
          title: badgeTitle(info, wins),
        }))
      : chipsFor(entry.badges);
  if (chips.length === 0) return null;
  return (
    <span style={styles.leaderboardChips}>
      {chips.map((chip) => (
        <span
          key={chip.key}
          style={styles.badgeChip}
          title={chip.title}
          aria-label={chip.title}
        >
          <StatusSegment
            kind={chip.kind}
            label={chip.label}
            value={chip.value}
            size="sm"
          />
        </span>
      ))}
    </span>
  );
}

/** The "i" tip explaining how to read the Keys and Efficiency columns. */
function KeyColumnsTip() {
  return (
    <InfoTip label="How efficiency is scored">
      <strong>Keys</strong> is keystrokes used / optimal. For example,{' '}
      <strong>50/40</strong> means the racer used 50 keystrokes where the
      day&apos;s tasks can be done in 40, so <strong>Efficiency</strong> is 80%.
    </InfoTip>
  );
}

/** Keys / Efficiency / Time for one row, with the board's sorted stat emphasised. */
function rowStats(board: DailyBoard, entry: DailyLeaderboardEntry) {
  const { efficiency, optimalKeys, actualKeys } = entry;
  const pct = efficiency === null ? '—' : formatEfficiency(efficiency);
  const hasKeys = optimalKeys !== null && actualKeys !== null;
  return {
    pct,
    hasKeys,
    keysTitle: hasKeys
      ? `${actualKeys} keys used, ${optimalKeys} optimal · ${pct}`
      : undefined,
    time: formatTime(entry.bestMs),
    keysSorted: board === 'efficiency',
    timeSorted: board === 'speed',
  };
}

/**
 * Rank colour, row tint and outline for the rail's top 3: gold, silver,
 * bronze.
 */
const TOP_RACER_MEDALS: Record<
  number,
  { rank: string; background: string; border: string }
> = {
  1: {
    rank: colors.warning,
    background: `${colors.warning}14`,
    border: `${colors.warning}73`,
  },
  2: {
    rank: '#cbd5e1',
    background: 'rgba(203, 213, 225, 0.05)',
    border: colors.borderLight,
  },
  3: {
    rank: '#f59e0b',
    background: 'rgba(217, 119, 6, 0.06)',
    border: 'rgba(217, 119, 6, 0.45)',
  },
};

/** Rank colour, row tint and outline for rail rows below the podium (4th, 5th). */
const TOP_RACER_UNMEDALLED = {
  rank: colors.textMuted,
  background: 'rgba(255, 255, 255, 0.02)',
  border: colors.border,
};

/**
 * One of the rail's top 5: a large rank in its medal colour, name with badge
 * chips beneath, then labelled Keys / Efficiency / Time, the board's sorted stat
 * emphasised. The stats wrap below the name on a narrow screen.
 */
function TopRacerRow({
  board,
  entry,
  userId,
}: {
  board: DailyBoard;
  entry: DailyLeaderboardEntry;
  userId: string | null;
}) {
  const isOwn = entry.userId === userId;
  const medal = TOP_RACER_MEDALS[entry.rank] ?? TOP_RACER_UNMEDALLED;
  const stats = rowStats(board, entry);
  const value = (sorted: boolean) =>
    sorted ? styles.topRacerStatValueSorted : styles.topRacerStatValue;
  const label = (sorted: boolean) =>
    sorted
      ? { ...styles.topRacerStatLabel, color: colors.primaryLight }
      : styles.topRacerStatLabel;
  return (
    <div
      data-testid="top-racer"
      style={{
        ...styles.topRacerRow,
        background: medal.background,
        borderColor: medal.border,
      }}
      aria-current={isOwn ? 'true' : undefined}
    >
      <span style={{ ...styles.topRacerRank, color: medal.rank }}>
        {entry.rank}
      </span>
      <span style={styles.topRacerNameCell}>
        <span style={styles.topRacerNameLine}>
          <span style={styles.topRacerName}>
            <RacerNameLink entry={entry} userId={userId} />
          </span>
          {/* A tag, not a second outline: a ring around the medal border
              read as two stacked borders (gold + cyan). */}
          {isOwn && <span style={styles.topRacerYouTag}>you</span>}
        </span>
        <BadgeChipList entry={entry} />
      </span>
      <span style={styles.topRacerStats}>
        <span style={styles.topRacerStat} title={stats.keysTitle}>
          <span style={label(stats.keysSorted)}>Keys</span>
          <span style={value(stats.keysSorted)}>
            {stats.hasKeys ? (
              <>
                {entry.actualKeys}
                <span style={styles.leaderboardKeysOptimal}>
                  /{entry.optimalKeys}
                </span>
              </>
            ) : (
              '—'
            )}
          </span>
        </span>
        <span style={styles.topRacerStat}>
          <span style={label(false)}>Efficiency</span>
          <span style={value(false)}>{stats.pct}</span>
        </span>
        <span style={styles.topRacerStat}>
          <span style={label(stats.timeSorted)}>Time</span>
          <span style={value(stats.timeSorted)}>{stats.time}</span>
        </span>
      </span>
    </div>
  );
}

/**
 * A racer's name on the rail, linking to their profile: /profile for the
 * viewer's own row, /players/:id for anyone else. Plain text for a visitor
 * (null `userId`), since profiles are for signed-in users only.
 */
function RacerNameLink({
  entry,
  userId,
}: {
  entry: DailyLeaderboardEntry;
  userId: string | null;
}) {
  if (!userId) return <>{entry.displayName}</>;
  const to = entry.userId === userId ? '/profile' : `/players/${entry.userId}`;
  return (
    <Link to={to} className="racer-name-link" style={styles.racerNameLink}>
      {entry.displayName}
    </Link>
  );
}

/**
 * The viewer's own row under the rail's top 5, so a mid-pack racer still sees
 * where they stand: rank, name, badges, keys and efficiency, time.
 */
function OwnPositionRow({
  board,
  entry,
}: {
  board: DailyBoard;
  entry: DailyLeaderboardEntry;
}) {
  const stats = rowStats(board, entry);
  return (
    <div style={styles.ownPosition}>
      <span style={styles.ownPositionLabel}>Your position</span>
      <div style={styles.ownPositionRow} aria-current="true">
        <span style={styles.ownPositionRank}>#{entry.rank}</span>
        <span style={styles.ownPositionName}>
          <RacerNameLink entry={entry} userId={entry.userId} />
        </span>
        <BadgeChipList entry={entry} />
        <span style={styles.ownPositionKeys} title={stats.keysTitle}>
          {stats.hasKeys
            ? `${entry.actualKeys}/${entry.optimalKeys} · ${stats.pct}`
            : stats.pct}
        </span>
        <span style={styles.ownPositionTime}>{stats.time}</span>
      </div>
    </div>
  );
}

/**
 * The viewer's own row when it isn't among the top entries: from their rank
 * neighbourhood, or last place when they're last. Null for a visitor or a
 * viewer already in the top entries.
 */
function findOwnRowOutsideTop(
  leaderboard: DailyLeaderboardData,
  userId: string | null
): DailyLeaderboardEntry | null {
  if (!userId) return null;
  if (leaderboard.entries.some((e) => e.userId === userId)) return null;
  const candidates = [
    ...(leaderboard.neighborhood ?? []),
    ...(leaderboard.lastPlace ? [leaderboard.lastPlace] : []),
  ];
  return candidates.find((e) => e.userId === userId) ?? null;
}

/** Column labels above the full-leaderboard dialog's rows. */
function LeaderboardColumns({ board }: { board: DailyBoard }) {
  const sorted = (on: DailyBoard) =>
    board === on
      ? { ...styles.leaderboardColumnRight, ...styles.leaderboardColumnSorted }
      : styles.leaderboardColumnRight;
  return (
    <div style={styles.leaderboardColumns}>
      <span>#</span>
      <span>Racer</span>
      <span style={sorted('efficiency')}>
        Keys
        <KeyColumnsTip />
      </span>
      <span style={styles.leaderboardColumnRight}>Efficiency</span>
      <span style={sorted('speed')}>Time</span>
    </div>
  );
}

/**
 * A small "i" button that shows an explanation on hover, focus, or tap.
 * Escape, moving away, or tapping elsewhere closes it.
 */
function InfoTip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  return (
    <span
      style={styles.infoTipWrap}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        style={styles.infoTipButton}
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        // Focus already opened it on click; tapping elsewhere (blur) closes it.
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        i
      </button>
      {open && (
        <span role="tooltip" id={tipId} style={styles.infoTip}>
          {children}
        </span>
      )}
    </span>
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
          <div style={styles.previewHost}>VIM GYM · vimgym.app</div>
          <div style={styles.previewTitle}>
            {name} finished the VIM GYM daily race in {timeLine}
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
