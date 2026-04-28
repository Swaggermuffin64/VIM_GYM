import { Piscina } from 'piscina';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import type { Task, PositionTask } from './types.js';

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

export async function generatePositionTaskAsync(): Promise<PositionTask> {
  return pool.run(null, {
    name: 'generatePositionTask',
  }) as Promise<PositionTask>;
}

export async function generatePositionTasksAsync(
  count: number
): Promise<Task[]> {
  return pool.run(count, { name: 'generatePositionTasks' }) as Promise<Task[]>;
}

export async function generateDeleteTasksAsync(count: number): Promise<Task[]> {
  return pool.run(count, { name: 'generateDeleteTasks' }) as Promise<Task[]>;
}
