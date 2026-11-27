/**
 * Regression tests for loading a task snippet into a reused editor.
 *
 * Bug: after a delete task, pressing `u` on the next task replayed the old
 * deletion and inserted the previous task's text into the new snippet. The
 * snippet swap left the undo stack intact, and CodeMirror's undo bypasses
 * transaction filters, so readOnlyNavigation's undo barrier never saw it.
 */
import { describe, it, expect } from 'vitest';
import { EditorState, Transaction, TransactionSpec } from '@codemirror/state';
import { undo, undoDepth } from '@codemirror/commands';
import {
  readOnlyNavigation,
  setDeleteMode,
  setAllowedDeleteRange,
} from './readOnlyNavigation';
import { loadTaskSnippet, taskUndoHistory } from './taskSnippetLoader';

/**
 * Minimal stand-in for an EditorView: holds the current state and applies
 * dispatched specs, so the loader can be exercised without a DOM.
 */
function createTestEditor(doc: string) {
  const editor = {
    state: EditorState.create({
      doc,
      extensions: [readOnlyNavigation, taskUndoHistory],
    }),
    dispatch(...specs: TransactionSpec[]) {
      editor.state = editor.state.update(...specs).state;
    },
  };
  return editor;
}

/** Simulate the player pressing `u` (vim routes it to the history command). */
function pressUndo(editor: ReturnType<typeof createTestEditor>) {
  undo({
    state: editor.state,
    dispatch: (tr: Transaction) => {
      editor.state = tr.state;
    },
  });
}

/** Load a delete task and perform the player's deletion of [from, to). */
function completeDeleteTask(
  editor: ReturnType<typeof createTestEditor>,
  snippet: string,
  range: { from: number; to: number }
) {
  loadTaskSnippet(editor, snippet, [
    setDeleteMode.of(true),
    setAllowedDeleteRange.of(range),
  ]);
  editor.dispatch({ changes: range, userEvent: 'delete' });
}

describe('loadTaskSnippet', () => {
  it('replaces the document with the snippet and puts the cursor at the start', () => {
    const editor = createTestEditor('old');
    editor.dispatch({ selection: { anchor: 2 } });

    loadTaskSnippet(editor, 'new snippet');

    expect(editor.state.doc.toString()).toBe('new snippet');
    expect(editor.state.selection.main.head).toBe(0);
  });

  it('leaves nothing to undo after loading a task', () => {
    const editor = createTestEditor('');
    completeDeleteTask(editor, 'OLD_TEXT keep', { from: 0, to: 9 });
    expect(undoDepth(editor.state)).toBe(1);

    loadTaskSnippet(editor, 'next task');

    expect(undoDepth(editor.state)).toBe(0);
  });

  it('does not bring back the previous task’s deleted text on undo', () => {
    const editor = createTestEditor('');
    completeDeleteTask(editor, 'OLD_TEXT keep', { from: 0, to: 9 });

    loadTaskSnippet(editor, 'xx new snippet');
    pressUndo(editor);

    expect(editor.state.doc.toString()).toBe('xx new snippet');
  });

  it('only undoes edits made in the current task', () => {
    const editor = createTestEditor('');
    completeDeleteTask(editor, 'OLD_TEXT keep', { from: 0, to: 9 });
    completeDeleteTask(editor, 'xx new snippet', { from: 0, to: 3 });
    expect(editor.state.doc.toString()).toBe('new snippet');

    pressUndo(editor);
    pressUndo(editor);
    pressUndo(editor);

    expect(editor.state.doc.toString()).toBe('xx new snippet');
  });

  it('still lets the player undo their own edits within a task', () => {
    const editor = createTestEditor('');
    completeDeleteTask(editor, 'abc def', { from: 0, to: 4 });
    expect(editor.state.doc.toString()).toBe('def');

    pressUndo(editor);

    expect(editor.state.doc.toString()).toBe('abc def');
  });
});
