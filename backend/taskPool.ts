import { Piscina } from 'piscina';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import type { Task, PositionTask } from './types.js';
import { taskContentHash } from './taskHash.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Workers always run compiled JS — tsx loader hooks don't propagate to worker threads.
// In prod (running from dist/), the worker is a sibling file.
// In dev (running via tsx from project root), resolve into dist/.
const isCompiled = import.meta.url.endsWith('.js');
const workerPath = isCompiled
  ? path.resolve(__dirname, 'taskWorker.js')
  : path.resolve(__dirname, 'dist', 'taskWorker.js');

const poolSize = Math.max(2, Math.min(4, os.cpus().length - 1));

const pool = new Piscina({
  filename: workerPath,
  minThreads: poolSize,
  maxThreads: poolSize,
  maxQueue: 64,
});

console.log(`[TaskPool] Started ${poolSize} worker threads via piscina`);

// ---------------------------------------------------------------------------
// Content hashing
// ---------------------------------------------------------------------------

/** Stamp each generated task with its stable content hash (mutates + returns). */
export function attachContentHashes<T extends Task>(tasks: T[]): T[] {
  for (const task of tasks) {
    task.contentHash = taskContentHash(task);
  }
  return tasks;
}

// ---------------------------------------------------------------------------
// Pre-generated task cache
// ---------------------------------------------------------------------------
// Three flat arrays of tasks generated at startup. Room creation and practice
// sessions randomly pick from these instead of generating on-the-fly, avoiding
// Piscina queue pressure under load.
//
// 200 navigate + 200 delete + 100 yank_paste ≈ 250-500 KB in memory.
// With random selection (with replacement) the number of unique 10-task games is ≈2.56×10^22.
// ---------------------------------------------------------------------------

/** Cache sizes; env overrides exist so integration tests can boot fast. */
function cacheCount(envVar: string, fallback: number): number {
  const parsed = parseInt(process.env[envVar] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
const CACHE_NAVIGATE_COUNT = cacheCount('TASK_CACHE_NAVIGATE_COUNT', 200);
const CACHE_DELETE_COUNT = cacheCount('TASK_CACHE_DELETE_COUNT', 200);
const CACHE_YANK_PASTE_COUNT = cacheCount('TASK_CACHE_YANK_PASTE_COUNT', 100);

const cachedNavigateTasks: Task[] = [];
const cachedDeleteTasks: Task[] = [];
const cachedYankPasteTasks: Task[] = [];

let cacheReady = false;
let cacheReadyPromise: Promise<void> | null = null;

function pickRandom<T>(array: T[], count: number): T[] {
  const result: T[] = [];
  const len = array.length;
  for (let i = 0; i < count; i++) {
    result.push(array[Math.floor(Math.random() * len)]!);
  }
  return result;
}

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    result[i] = result[j] as T;
    result[j] = temp as T;
  }
  return result;
}

/**
 * Pick a random set of tasks from the pre-generated cache.
 * Returns 4 navigate + 4 delete + 2 yank_paste, shuffled.
 * Synchronous — no worker threads, no async, no queue pressure.
 */
export function pickTasksFromCache(): Task[] {
  if (
    cachedNavigateTasks.length < 4 ||
    cachedDeleteTasks.length < 4 ||
    cachedYankPasteTasks.length < 2
  ) {
    throw new Error(
      `pickTasksFromCache: cache not initialized (navigate=${cachedNavigateTasks.length}, delete=${cachedDeleteTasks.length}, yank_paste=${cachedYankPasteTasks.length})`
    );
  }
  const nav = pickRandom(cachedNavigateTasks, 4);
  const del = pickRandom(cachedDeleteTasks, 4);
  const yank = pickRandom(cachedYankPasteTasks, 2);
  return shuffle([...nav, ...del, ...yank]);
}

/** Returns true once the cache has been fully populated. */
export function isTaskCacheReady(): boolean {
  return cacheReady;
}

/** Resolves once the task cache is fully populated. */
export function waitForTaskCache(): Promise<void> {
  if (cacheReady) return Promise.resolve();
  if (cacheReadyPromise) return cacheReadyPromise;
  // Should not happen — fillTaskCache is called at module load
  return Promise.resolve();
}

/**
 * Fill the cache by dispatching generation jobs to the worker pool.
 * Called once at startup before the server accepts connections.
 */
export async function fillTaskCache(): Promise<void> {
  const start = Date.now();
  console.log(
    `[TaskCache] Generating ${CACHE_NAVIGATE_COUNT} navigate + ${CACHE_DELETE_COUNT} delete + ${CACHE_YANK_PASTE_COUNT} yank_paste tasks...`
  );

  // Generate in parallel batches to keep worker threads busy
  const batchSize = 20;

  // Navigate tasks
  for (let i = 0; i < CACHE_NAVIGATE_COUNT; i += batchSize) {
    const count = Math.min(batchSize, CACHE_NAVIGATE_COUNT - i);
    const tasks = attachContentHashes(
      (await pool.run(count, { name: 'generatePositionTasks' })) as Task[]
    );
    cachedNavigateTasks.push(...tasks);
  }

  // Delete tasks
  for (let i = 0; i < CACHE_DELETE_COUNT; i += batchSize) {
    const count = Math.min(batchSize, CACHE_DELETE_COUNT - i);
    const tasks = attachContentHashes(
      (await pool.run(count, { name: 'generateDeleteTasks' })) as Task[]
    );
    cachedDeleteTasks.push(...tasks);
  }

  // Yank/paste tasks
  for (let i = 0; i < CACHE_YANK_PASTE_COUNT; i += batchSize) {
    const count = Math.min(batchSize, CACHE_YANK_PASTE_COUNT - i);
    const tasks = attachContentHashes(
      (await pool.run(count, { name: 'generateYankPasteTasks' })) as Task[]
    );
    cachedYankPasteTasks.push(...tasks);
  }

  cacheReady = true;
  const elapsed = Date.now() - start;
  console.log(
    `[TaskCache] Ready in ${elapsed}ms — ${cachedNavigateTasks.length} navigate, ${cachedDeleteTasks.length} delete, ${cachedYankPasteTasks.length} yank_paste`
  );
}

// Start filling the cache immediately on import
cacheReadyPromise = fillTaskCache();

// ---------------------------------------------------------------------------
// Legacy async generators — kept for the single-task practice endpoint
// and tests. These still go through the Piscina worker pool.
// ---------------------------------------------------------------------------

export async function generatePositionTaskAsync(): Promise<PositionTask> {
  const task = (await pool.run(null, {
    name: 'generatePositionTask',
  })) as PositionTask;
  return attachContentHashes([task])[0]!;
}

export async function generatePositionTasksAsync(
  count: number
): Promise<Task[]> {
  const tasks = (await pool.run(count, {
    name: 'generatePositionTasks',
  })) as Task[];
  return attachContentHashes(tasks);
}

export async function generateDeleteTasksAsync(count: number): Promise<Task[]> {
  const tasks = (await pool.run(count, {
    name: 'generateDeleteTasks',
  })) as Task[];
  return attachContentHashes(tasks);
}

/** One worker job: all task types (shuffle on main thread). */
export async function generateRaceTaskBatchesAsync(
  tasksPerType: number
): Promise<{
  positionTasks: Task[];
  deleteTasks: Task[];
  yankPasteTasks: Task[];
}> {
  const result = (await pool.run(tasksPerType, {
    name: 'generateRaceTaskBatches',
  })) as {
    positionTasks: Task[];
    deleteTasks: Task[];
    yankPasteTasks: Task[];
  };
  attachContentHashes(result.positionTasks);
  attachContentHashes(result.deleteTasks);
  attachContentHashes(result.yankPasteTasks);
  return result;
}
