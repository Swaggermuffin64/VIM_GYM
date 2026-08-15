// backend/db/stats.test.ts
import { describe, it, expect } from 'vitest';
import { compactKeystrokes, MAX_STORED_KEYSTROKES } from './stats.js';
import type { KeystrokeEvent } from '../types.js';

function ev(
  key: string,
  dtMs: number,
  mods: Partial<KeystrokeEvent> = {}
): KeystrokeEvent {
  return {
    key,
    dtMs,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    ...mods,
  };
}

describe('compactKeystrokes', () => {
  it('converts events to {k, t} with cumulative non-decreasing t', () => {
    expect(compactKeystrokes([ev('d', 0), ev('w', 120), ev('j', 80)])).toEqual([
      { k: 'd', t: 0 },
      { k: 'w', t: 120 },
      { k: 'j', t: 200 },
    ]);
  });

  it('clamps negative dtMs to zero delta instead of going back in time', () => {
    const out = compactKeystrokes([ev('a', 0), ev('b', -50)]);
    expect(out).toEqual([
      { k: 'a', t: 0 },
      { k: 'b', t: 0 },
    ]);
  });

  it('prefixes ctrl/meta/alt modifiers onto the key', () => {
    const out = compactKeystrokes([ev('r', 0, { ctrlKey: true })]);
    expect(out).toEqual([{ k: 'C-r', t: 0 }]);
  });

  it(`returns null above the ${MAX_STORED_KEYSTROKES}-event cap`, () => {
    const events = Array.from({ length: MAX_STORED_KEYSTROKES + 1 }, (_, i) =>
      ev('x', i)
    );
    expect(compactKeystrokes(events)).toBeNull();
  });

  it('returns null for an empty array', () => {
    expect(compactKeystrokes([])).toBeNull();
  });
});

import {
  upsertTasksOnFirstUse,
  createGameSession,
  finishGameSession,
  insertTaskAttempt,
  attachKeystrokesToAttempt,
} from './stats.js';

describe('stats writers without DATABASE_URL', () => {
  it('all resolve as no-ops instead of throwing', async () => {
    await expect(upsertTasksOnFirstUse([])).resolves.toBeUndefined();
    await expect(
      createGameSession({
        playMode: 'practice',
        taskHashes: ['a'.repeat(64)],
        startedAt: new Date(),
        userIds: ['00000000-0000-0000-0000-000000000000'],
      })
    ).resolves.toBeNull();
    await expect(
      finishGameSession({ gameId: 1, finishedAt: new Date(), results: [] })
    ).resolves.toBeUndefined();
    await expect(
      insertTaskAttempt({
        userId: '00000000-0000-0000-0000-000000000000',
        taskHash: 'a'.repeat(64),
        gameId: 1,
        playMode: 'practice',
        durationMs: 1000,
        keystrokeCount: 5,
        keystrokes: null,
      })
    ).resolves.toBeUndefined();
    await expect(
      attachKeystrokesToAttempt({
        userId: '00000000-0000-0000-0000-000000000000',
        gameId: 1,
        taskHash: 'a'.repeat(64),
        keystrokeCount: 5,
        keystrokes: [{ k: 'w', t: 0 }],
      })
    ).resolves.toBeUndefined();
  });
});
