import type { TaskSummary } from '../types/task';

export interface TaskSummaryAverages {
  durationMs: number;
  keys: number;
  keysPerSecond: number;
  discrepancy: number | null;
}

export interface PlayerTaskAverages {
  taskCount: number;
  keysPerSecond: number;
  avgDurationMs: number;
  avgKeys: number;
}

export function computeTaskSummaryAverages(taskSummaries: TaskSummary[]): TaskSummaryAverages | null {
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
    totalKeysPerSecond += summary.durationMs > 0 ? summary.keyCount / (summary.durationMs / 1000) : 0;
    if (typeof summary.ourSolutionKeyCount === 'number') {
      totalDiscrepancy += summary.ourSolutionKeyCount - summary.keyCount;
      discrepancyCount += 1;
    }
  }

  return {
    durationMs: totalDurationMs / count,
    keys: Math.round(totalKeys / count),
    keysPerSecond: totalKeysPerSecond / count,
    discrepancy: discrepancyCount > 0 ? totalDiscrepancy / discrepancyCount : null,
  };
}

export function formatTenthsDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${seconds}.${tenths}s`;
}
