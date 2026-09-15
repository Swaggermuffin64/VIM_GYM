/**
 * Tests for the yank/paste phase of the readOnlyNavigation transaction filter.
 *
 * The paste gate must only let through insertions that produce one of the
 * task's accepted results. Anything else (wrong position, wrong register,
 * typed text) is blocked so the buffer can never desync from the task —
 * previously a paste anywhere on the marker's line was allowed, leaving the
 * player stuck until they undid or reset.
 */
import { describe, it, expect } from 'vitest';
import { EditorState, StateEffect } from '@codemirror/state';
import {
  readOnlyNavigation,
  setYankPasteMode,
  setYankPasteConfirmed,
  setAllowedPasteResults,
} from './readOnlyNavigation';

const DOC = 'const foo = bar;\nconst baz = qux;';

/** Build an editor state in yank/paste mode, optionally already in paste phase. */
function createYankPasteState(options: {
  confirmed: boolean;
  allowedResults?: string[];
}): EditorState {
  let state = EditorState.create({ doc: DOC, extensions: readOnlyNavigation });
  // Mode is enabled when the task starts; yank confirmation and the accepted
  // results arrive later in a separate transaction (as the app dispatches them).
  state = state.update({ effects: setYankPasteMode.of(true) }).state;
  const effects: StateEffect<unknown>[] = [];
  if (options.confirmed) {
    effects.push(setYankPasteConfirmed.of(true));
  }
  if (options.allowedResults) {
    effects.push(setAllowedPasteResults.of(options.allowedResults));
  }
  if (effects.length > 0) {
    state = state.update({ effects }).state;
  }
  return state;
}

describe('readOnlyNavigation yank/paste gate', () => {
  it('blocks all edits during the yank phase', () => {
    const state = createYankPasteState({ confirmed: false });
    const result = state.update({
      changes: { from: 0, insert: 'foo' },
      userEvent: 'input.paste',
    }).state;
    expect(result.doc.toString()).toBe(DOC);
  });

  it('allows a paste that produces an accepted result', () => {
    // Simulate pasting "foo" right after offset 5 (characterwise p on the f of foo)
    const expected = DOC.slice(0, 6) + 'foo' + DOC.slice(6);
    const state = createYankPasteState({
      confirmed: true,
      allowedResults: [expected],
    });
    const result = state.update({
      changes: { from: 6, insert: 'foo' },
      userEvent: 'input.paste',
    }).state;
    expect(result.doc.toString()).toBe(expected);
  });

  it('blocks a paste at the wrong position even on the correct line', () => {
    // Accepted result pastes "foo" at offset 6; pasting at offset 12 (same
    // line) must be rejected so the buffer cannot desync from the task.
    const expected = DOC.slice(0, 6) + 'foo' + DOC.slice(6);
    const state = createYankPasteState({
      confirmed: true,
      allowedResults: [expected],
    });
    const result = state.update({
      changes: { from: 12, insert: 'foo' },
      userEvent: 'input.paste',
    }).state;
    expect(result.doc.toString()).toBe(DOC);
  });

  it('blocks pasting the wrong text at the right position', () => {
    const expected = DOC.slice(0, 6) + 'foo' + DOC.slice(6);
    const state = createYankPasteState({
      confirmed: true,
      allowedResults: [expected],
    });
    const result = state.update({
      changes: { from: 6, insert: 'WRONG' },
      userEvent: 'input.paste',
    }).state;
    expect(result.doc.toString()).toBe(DOC);
  });

  it('accepts any of multiple accepted results (p and P variants)', () => {
    const resultP = DOC.slice(0, 7) + 'foo' + DOC.slice(7);
    const resultShiftP = DOC.slice(0, 6) + 'foo' + DOC.slice(6);
    const state = createYankPasteState({
      confirmed: true,
      allowedResults: [resultP, resultShiftP],
    });
    const afterShiftP = state.update({
      changes: { from: 6, insert: 'foo' },
      userEvent: 'input.paste',
    }).state;
    expect(afterShiftP.doc.toString()).toBe(resultShiftP);
  });

  it('blocks deletions during the paste phase', () => {
    const state = createYankPasteState({
      confirmed: true,
      allowedResults: [DOC.slice(1)],
    });
    const result = state.update({
      changes: { from: 0, to: 1 },
      userEvent: 'delete',
    }).state;
    expect(result.doc.toString()).toBe(DOC);
  });

  it('allows a linewise paste below the target line', () => {
    // yy on line 1 then p on line 2: inserts "const foo = bar;\n" content
    // as a new line after line 2 (end of document, no trailing newline).
    const expected = DOC + '\nconst foo = bar;';
    const state = createYankPasteState({
      confirmed: true,
      allowedResults: [expected],
    });
    const result = state.update({
      changes: { from: DOC.length, insert: '\nconst foo = bar;' },
      userEvent: 'input.paste',
    }).state;
    expect(result.doc.toString()).toBe(expected);
  });

  it('still allows every insertion when no allowed results are set', () => {
    const state = createYankPasteState({ confirmed: true });
    const result = state.update({
      changes: { from: 3, insert: 'zzz' },
      userEvent: 'input.paste',
    }).state;
    expect(result.doc.toString()).toBe(DOC.slice(0, 3) + 'zzz' + DOC.slice(3));
  });
});
