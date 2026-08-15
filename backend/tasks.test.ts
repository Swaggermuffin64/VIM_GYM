/**
 * Invariant tests for tasks.ts — randomized race-task generation.
 * Each generator is drawn repeatedly; the assertions are properties that
 * must hold for ANY random draw, so failures indicate real generator bugs
 * rather than unlucky randomness.
 */
import { describe, expect, it } from 'vitest';
import {
  generatePositionTask,
  generateDeleteTask,
  generateYankPasteTask,
  generateRaceTaskBatches,
  checkPositionTask,
} from './tasks.js';

const DRAWS = 10;

/** Recompute character offset from a 1-indexed line / 0-indexed col position. */
function positionToOffset(
  code: string,
  pos: { line: number; col: number }
): number {
  const lines = code.split('\n');
  let offset = 0;
  for (let i = 0; i < pos.line - 1 && i < lines.length; i++) {
    offset += (lines[i]?.length ?? 0) + 1;
  }
  return offset + Math.min(pos.col, lines[pos.line - 1]?.length ?? 0);
}

describe('generatePositionTask', () => {
  it('produces internally consistent navigate tasks', () => {
    for (let i = 0; i < DRAWS; i++) {
      const task = generatePositionTask();
      expect(task.type).toBe('navigate');
      expect(task.id).toBeTruthy();
      expect(task.codeSnippet.length).toBeGreaterThan(0);
      // Snippet has empty lines stripped
      expect(
        task.codeSnippet.split('\n').every((line) => line.trim().length > 0)
      ).toBe(true);
      // Target is never the starting position
      expect(task.targetOffset).toBeGreaterThan(0);
      // targetPosition and targetOffset agree
      expect(positionToOffset(task.codeSnippet, task.targetPosition)).toBe(
        task.targetOffset
      );
      // Target is a real, non-whitespace character
      const targetChar = task.codeSnippet[task.targetOffset];
      expect(targetChar).toBeDefined();
      expect(targetChar).not.toBe(' ');
      expect(targetChar).not.toBe('\t');
      if (task.recommendedSequence) {
        expect(task.recommendedSequence.length).toBeGreaterThan(0);
        expect(task.recommendedWeight).toBeGreaterThan(0);
      }
    }
  });
});

describe('generateDeleteTask', () => {
  it('produces delete tasks whose precomputed fields agree with the range', () => {
    for (let i = 0; i < DRAWS; i++) {
      const task = generateDeleteTask();
      expect(task.type).toBe('delete');
      const { from, to } = task.targetRange;
      expect(from).toBeGreaterThanOrEqual(0);
      expect(to).toBeGreaterThan(from);
      expect(to).toBeLessThanOrEqual(task.codeSnippet.length);
      expect(task.prefix).toBe(task.codeSnippet.slice(0, from));
      expect(task.suffix).toBe(task.codeSnippet.slice(to));
      expect(task.originalMiddle).toBe(task.codeSnippet.slice(from, to));
      expect(task.expectedResult).toBe(task.prefix + task.suffix);
      expect(task.strategy).toBeTruthy();
    }
  });
});

describe('generateYankPasteTask', () => {
  it('produces yank tasks whose yankedText matches the yank range', () => {
    for (let i = 0; i < DRAWS; i++) {
      const task = generateYankPasteTask();
      expect(task.type).toBe('yank_paste');
      const { from, to } = task.yankRange;
      expect(to).toBeGreaterThan(from);
      expect(task.yankedText).toBe(task.codeSnippet.slice(from, to));
      expect(task.pasteOffset).toBeGreaterThanOrEqual(0);
      expect(task.pasteOffset).toBeLessThanOrEqual(task.codeSnippet.length);
      expect(task.expectedResults.length).toBeGreaterThan(0);
      // Every acceptable result is a real edit, not the unchanged snippet
      for (const result of task.expectedResults) {
        expect(result).not.toBe(task.codeSnippet);
        expect(result.length).toBeGreaterThan(task.codeSnippet.length);
      }
    }
  });
});

describe('generateRaceTaskBatches', () => {
  it('returns the requested count of each task type', () => {
    const batches = generateRaceTaskBatches(2);
    expect(batches.positionTasks).toHaveLength(2);
    expect(batches.deleteTasks).toHaveLength(2);
    expect(batches.yankPasteTasks).toHaveLength(2);
    expect(batches.positionTasks.every((t) => t.type === 'navigate')).toBe(
      true
    );
    expect(batches.deleteTasks.every((t) => t.type === 'delete')).toBe(true);
    expect(batches.yankPasteTasks.every((t) => t.type === 'yank_paste')).toBe(
      true
    );
  });
});

describe('checkPositionTask', () => {
  it('accepts exactly the target offset', () => {
    const task = generatePositionTask();
    expect(checkPositionTask(task, task.targetOffset)).toBe(true);
    expect(checkPositionTask(task, task.targetOffset + 1)).toBe(false);
    expect(checkPositionTask(task, 0)).toBe(false);
  });
});
