/**
 * Loads a task's code snippet into the editor with a fresh undo stack.
 *
 * Every mode (practice, multiplayer, the summary sandbox) reuses one editor
 * across tasks and swaps the snippet in place. CodeMirror keeps the undo stack
 * across that swap, and its undo transactions bypass transaction filters
 * (`filter: false`), so readOnlyNavigation cannot stop `u` from replaying a
 * previous task's deletion into the new snippet. Clearing the history on each
 * load is what keeps tasks independent.
 *
 * The editor must include `taskUndoHistory` in its extensions (VimRaceEditor
 * does) for the history reset to take effect.
 */
import {
  Compartment,
  EditorState,
  Extension,
  StateEffect,
  Transaction,
  TransactionSpec,
} from '@codemirror/state';
import { history } from '@codemirror/commands';
import { allowReset, setUndoBarrier } from './readOnlyNavigation';

const taskUndoHistoryCompartment = new Compartment();

/** Undo history extension that `loadTaskSnippet` can wipe between tasks. */
export const taskUndoHistory: Extension =
  taskUndoHistoryCompartment.of(history());

/** Anything that holds editor state and accepts transactions — an EditorView. */
export interface TaskEditor {
  readonly state: EditorState;
  dispatch(...specs: TransactionSpec[]): void;
}

/**
 * Empty the undo and redo stacks. Reconfiguring to the same extension keeps
 * the old field state, so history is removed first and then re-added.
 */
export function clearTaskUndoHistory(editor: TaskEditor): void {
  editor.dispatch({ effects: taskUndoHistoryCompartment.reconfigure([]) });
  editor.dispatch({
    effects: taskUndoHistoryCompartment.reconfigure(history()),
  });
}

/**
 * Replace the whole document with `snippet`, move the cursor to the start,
 * and clear undo history so nothing from the previous task can be undone
 * into it. `effects` are applied in the same transaction as the swap.
 */
export function loadTaskSnippet(
  editor: TaskEditor,
  snippet: string,
  effects: StateEffect<unknown>[] = []
): void {
  clearTaskUndoHistory(editor);
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: snippet },
    selection: { anchor: 0 },
    effects: [allowReset.of(true), setUndoBarrier.of(true), ...effects],
    annotations: Transaction.addToHistory.of(false),
  });
}
