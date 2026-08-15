import { describe, it, expect } from 'vitest';
import { isValidTasksPayload } from './leaderboard.js';

function task(type: string) {
  return { id: 'task-1', type, description: 'd', codeSnippet: 'abc' };
}

describe('isValidTasksPayload', () => {
  it('accepts every task type the game actually produces', () => {
    // Regression: yank_paste was added to TaskType but this validator was not
    // updated, silently 400-ing any practice session containing one.
    expect(isValidTasksPayload([task('navigate')])).toBe(true);
    expect(isValidTasksPayload([task('delete')])).toBe(true);
    expect(isValidTasksPayload([task('yank_paste')])).toBe(true);
  });

  it('still accepts legacy stored types', () => {
    expect(isValidTasksPayload([task('change')])).toBe(true);
    expect(isValidTasksPayload([task('insert')])).toBe(true);
  });

  it('rejects unknown types and malformed payloads', () => {
    expect(isValidTasksPayload([task('teleport')])).toBe(false);
    expect(isValidTasksPayload([])).toBe(false);
    expect(isValidTasksPayload('nope')).toBe(false);
    expect(isValidTasksPayload([{ type: 'navigate' }])).toBe(false); // no id
  });
});
