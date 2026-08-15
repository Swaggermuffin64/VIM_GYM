// backend/taskHash.test.ts
import { describe, it, expect } from 'vitest';
import {
  canonicalJsonStringify,
  taskContentHash,
  optimalKeystrokeCountForTask,
} from './taskHash.js';
import type { PositionTask } from './types.js';

const baseTask: PositionTask = {
  id: 'task-abc123',
  type: 'navigate',
  description: 'Go to line 3',
  codeSnippet: 'const x = 1;\nconst y = 2;\nconst z = 3;',
  targetPosition: { line: 3, col: 6 },
  targetOffset: 32,
  recommendedSequence: ['2j', 'w'],
  recommendedWeight: 3,
};

describe('canonicalJsonStringify', () => {
  it('sorts object keys recursively so key order never changes the output', () => {
    expect(canonicalJsonStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalJsonStringify({ a: { c: 3, d: 2 }, b: 1 })
    );
  });

  it('preserves array order', () => {
    expect(canonicalJsonStringify([1, 2])).not.toBe(
      canonicalJsonStringify([2, 1])
    );
  });
});

describe('taskContentHash', () => {
  it('is stable across property insertion order', () => {
    const reordered = JSON.parse(
      canonicalJsonStringify(baseTask)
    ) as PositionTask;
    expect(taskContentHash(reordered)).toBe(taskContentHash(baseTask));
  });

  it('ignores id and recommendation fields (volatile / solver-derived)', () => {
    const other: PositionTask = {
      ...baseTask,
      id: 'different-id',
      recommendedSequence: ['j', 'j', 'w'],
      recommendedWeight: 99,
    };
    expect(taskContentHash(other)).toBe(taskContentHash(baseTask));
  });

  it('changes when content changes', () => {
    const other: PositionTask = { ...baseTask, targetOffset: 33 };
    expect(taskContentHash(other)).not.toBe(taskContentHash(baseTask));
  });

  it('is 64 lowercase hex chars', () => {
    expect(taskContentHash(baseTask)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('optimalKeystrokeCountForTask', () => {
  it('counts individual keys across sequence tokens ("2j","w" -> 3)', () => {
    expect(optimalKeystrokeCountForTask(baseTask)).toBe(3);
  });

  it('returns null when there is no recommendation', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { recommendedSequence, recommendedWeight, ...rest } = baseTask;
    expect(optimalKeystrokeCountForTask(rest as PositionTask)).toBeNull();
  });
});
