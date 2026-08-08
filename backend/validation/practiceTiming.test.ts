import { describe, it, expect } from 'vitest';
import {
  validatePracticeSubmissionTiming,
  MIN_PRACTICE_MS_PER_TASK,
  TIMING_NETWORK_TOLERANCE_MS,
} from './practiceTiming.js';

// A realistic 5-task run started 20 seconds ago.
const START = 1_000_000;
const NOW = START + 20_000;
const TASKS = 5;

function check(
  overrides: Partial<
    Parameters<typeof validatePracticeSubmissionTiming>[0]
  > = {}
) {
  return validatePracticeSubmissionTiming({
    durationMs: 12_000,
    taskCount: TASKS,
    serverStartedAt: START,
    now: NOW,
    alreadyFinished: false,
    ...overrides,
  });
}

describe('validatePracticeSubmissionTiming', () => {
  it('accepts a plausible run within the server window', () => {
    expect(check()).toEqual({ ok: true });
  });

  it('rejects a forged near-zero duration', () => {
    expect(check({ durationMs: 1 })).toEqual({
      ok: false,
      reason: 'duration_too_short',
    });
  });

  it('rejects any duration below the per-task floor', () => {
    const justUnderFloor = MIN_PRACTICE_MS_PER_TASK * TASKS - 1;
    expect(check({ durationMs: justUnderFloor })).toEqual({
      ok: false,
      reason: 'duration_too_short',
    });
  });

  it('accepts a duration exactly at the per-task floor', () => {
    const atFloor = MIN_PRACTICE_MS_PER_TASK * TASKS;
    expect(check({ durationMs: atFloor })).toEqual({ ok: true });
  });

  it('uses a floor of one task when taskCount is zero', () => {
    expect(
      check({ taskCount: 0, durationMs: MIN_PRACTICE_MS_PER_TASK - 1 })
    ).toEqual({ ok: false, reason: 'duration_too_short' });
    expect(
      check({ taskCount: 0, durationMs: MIN_PRACTICE_MS_PER_TASK })
    ).toEqual({ ok: true });
  });

  it('rejects a duration longer than the server window plus tolerance', () => {
    const serverWindow = NOW - START; // 20s
    const tooLong = serverWindow + TIMING_NETWORK_TOLERANCE_MS + 1;
    expect(check({ durationMs: tooLong })).toEqual({
      ok: false,
      reason: 'duration_exceeds_server_window',
    });
  });

  it('allows a duration within the network tolerance above the window', () => {
    const serverWindow = NOW - START;
    const withinTolerance = serverWindow + TIMING_NETWORK_TOLERANCE_MS;
    expect(check({ durationMs: withinTolerance })).toEqual({ ok: true });
  });

  it('rejects submissions against an already-finished session', () => {
    expect(check({ alreadyFinished: true })).toEqual({
      ok: false,
      reason: 'session_already_finished',
    });
  });

  it('checks the finished guard before timing', () => {
    // Even a perfectly plausible duration is rejected once finished.
    expect(check({ alreadyFinished: true, durationMs: 12_000 })).toEqual({
      ok: false,
      reason: 'session_already_finished',
    });
  });
});
