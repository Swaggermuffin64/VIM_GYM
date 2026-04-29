import {
  generatePositionTask as _generatePositionTask,
  generatePositionTasks as _generatePositionTasks,
  generateDeleteTasks as _generateDeleteTasks,
} from './tasks.js';

// Piscina calls these by name via pool.run(data, { name: '...' })
export function generatePositionTask(): ReturnType<
  typeof _generatePositionTask
> {
  return _generatePositionTask();
}

export function generatePositionTasks(
  count: number
): ReturnType<typeof _generatePositionTasks> {
  return _generatePositionTasks(count);
}

export function generateDeleteTasks(
  count: number
): ReturnType<typeof _generateDeleteTasks> {
  return _generateDeleteTasks(count);
}
