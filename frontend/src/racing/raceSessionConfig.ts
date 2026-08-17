import type { Task } from '../types/task';
import type { LeaderboardRanks } from '../types/multiplayer';

/** Tasks + stats-session id for one run. */
export interface RaceSessionData {
  tasks: Task[];
  gameId: number | null;
}

/** What the mode-specific completion submission produced, for the results overlay. */
export type RaceCompletionInfo =
  | { kind: 'practice'; ranks: LeaderboardRanks | null }
  | {
      kind: 'daily';
      rank: number;
      totalRacers: number;
      bestMs: number;
      attemptsRemaining: number;
    };

/**
 * Mode adapter for the shared race-session page (pages/practice.tsx).
 * Practice and Race of the Day differ only in where tasks come from, where
 * the finished time goes, and what the ready/results chrome says — this
 * config captures exactly those differences so the 2,000-line engine is
 * written once.
 */
export interface RaceSessionConfig {
  /** Keystroke-source + play_mode tag sent to the backend. */
  mode: 'practice' | 'daily';
  /** Ready-screen heading and subtitle. */
  title: string;
  subtitle: string;
  /** Fetch tasks + gameId for a new run (practice prefetches on mount). */
  fetchSession(accessToken: string | undefined): Promise<RaceSessionData>;
  /** Submit the finished run; result feeds renderCompletionExtras. */
  submitCompletion(params: {
    accessToken: string | undefined;
    durationMs: number;
    tasks: Task[];
    gameId: number | null;
  }): Promise<RaceCompletionInfo | null>;
  /** Show the "New Tasks" restart button (false for daily — attempts are rationed). */
  allowNewTasks: boolean;
  /** Show the "Same Tasks" replay button (false for daily). */
  allowSameTasksReplay: boolean;
  /** Extra results-overlay content (daily: placing + share + try-again). */
  renderCompletionExtras?(info: RaceCompletionInfo | null): React.ReactNode;
}
