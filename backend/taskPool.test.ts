import { describe, expect, it } from 'vitest';
import {
  generatePositionTaskAsync,
  generatePositionTasksAsync,
  generateDeleteTasksAsync,
  generateRaceTaskBatchesAsync,
  attachContentHashes,
} from './taskPool.js';
import { taskContentHash } from './taskHash.js';
import type { Task } from './types.js';

/**
 * Measure event loop responsiveness during async work.
 * Schedules setImmediate callbacks in a tight loop and records
 * how many fire while the provided promise is pending.
 * If the main thread were blocked, zero callbacks would fire.
 */
function measureEventLoopTicks(promise: Promise<unknown>): Promise<number> {
  return new Promise((resolve) => {
    let ticks = 0;
    let done = false;

    function tick() {
      if (done) return;
      ticks++;
      setImmediate(tick);
    }

    setImmediate(tick);

    promise.finally(() => {
      done = true;
      // One more tick to let the count settle
      setImmediate(() => resolve(ticks));
    });
  });
}

describe('taskPool', () => {
  it('generates a valid position task', async () => {
    const task = await generatePositionTaskAsync();
    expect(task.type).toBe('navigate');
    expect(task.targetOffset).toBeGreaterThan(0);
    expect(task.codeSnippet).toBeTruthy();
  });

  it('generates multiple position tasks', async () => {
    const tasks = await generatePositionTasksAsync(3);
    expect(tasks).toHaveLength(3);
    tasks.forEach((t) => expect(t.type).toBe('navigate'));
  });

  it('generates multiple delete tasks', async () => {
    const tasks = await generateDeleteTasksAsync(3);
    expect(tasks).toHaveLength(3);
    tasks.forEach((t) => expect(t.type).toBe('delete'));
  });

  it('does not block the main thread during task generation', async () => {
    // Generate a batch large enough to take measurable time on the worker
    const taskPromise = generatePositionTasksAsync(5);
    const ticks = await measureEventLoopTicks(taskPromise);

    // If generation ran on the main thread, ticks would be 0.
    // Off the main thread, the event loop stays free and ticks accumulate.
    expect(ticks).toBeGreaterThan(0);
  });

  it('generates all task type batches in one worker job', async () => {
    const start = performance.now();

    const { positionTasks, deleteTasks, yankPasteTasks } =
      await generateRaceTaskBatchesAsync(3);

    const elapsed = performance.now() - start;

    expect(positionTasks).toHaveLength(3);
    expect(deleteTasks).toHaveLength(3);
    expect(yankPasteTasks).toHaveLength(3);
    positionTasks.forEach((t) => expect(t.type).toBe('navigate'));
    deleteTasks.forEach((t) => expect(t.type).toBe('delete'));
    yankPasteTasks.forEach((t) => {
      expect(t.type).toBe('yank_paste');
      if (t.type === 'yank_paste') {
        expect(t.yankRange.from).toBeLessThan(t.yankRange.to);
        expect(t.expectedResults.length).toBeGreaterThan(0);
        t.expectedResults.forEach((r) =>
          expect(r.length).toBeGreaterThan(t.codeSnippet.length)
        );
        expect(t.yankedText).toBe(
          t.codeSnippet.slice(t.yankRange.from, t.yankRange.to)
        );
      }
    });

    console.log(
      `Single-job race batch generation took ${elapsed.toFixed(0)}ms`
    );
  });
});

describe('attachContentHashes', () => {
  it('stamps every task with its content hash', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        type: 'navigate',
        description: 'd',
        codeSnippet: 'abc',
        targetPosition: { line: 1, col: 1 },
        targetOffset: 1,
      },
    ];
    const out = attachContentHashes(tasks);
    expect(out[0]!.contentHash).toBe(taskContentHash(tasks[0]!));
  });
});
