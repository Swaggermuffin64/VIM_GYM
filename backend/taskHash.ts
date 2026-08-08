// backend/taskHash.ts
/**
 * Content-hash identity for generated tasks.
 *
 * Identical task content must always produce the identical hash — the stats
 * schema (tasks/task_attempts) uses it to recognize "the same task" across
 * players and time. Volatile fields (id) and solver-derived recommendations
 * are excluded so regenerated ids and solver improvements don't split identity.
 */
import { createHash } from 'node:crypto';
import type { Task } from './types.js';

/** Bump when the Task content shape changes; deliberately splits hash identity. */
export const STATS_TASK_SCHEMA_VERSION = 1;

/** Deterministic JSON: object keys sorted recursively, arrays kept in order. */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** sha256 hex over the task's content fields (id + recommendations excluded). */
export function taskContentHash(task: Task): string {
  const { id, recommendedSequence, recommendedWeight, ...content } =
    task as Task & {
      recommendedSequence?: string[];
      recommendedWeight?: number;
    };
  void id;
  void recommendedSequence;
  void recommendedWeight;
  const canonical = canonicalJsonStringify({
    v: STATS_TASK_SCHEMA_VERSION,
    content,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** Total keystrokes in the solver's recommended sequence, e.g. ["2j","w"] -> 3. */
export function optimalKeystrokeCountForTask(task: Task): number | null {
  const seq = (task as { recommendedSequence?: string[] }).recommendedSequence;
  if (!seq || seq.length === 0) return null;
  return seq.join('').length;
}
