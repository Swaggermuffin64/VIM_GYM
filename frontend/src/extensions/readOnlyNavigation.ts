import {
  Annotation,
  EditorState,
  Transaction,
  TransactionSpec,
  StateEffect,
  StateField,
  Extension,
} from '@codemirror/state';

function shouldDebugUndo(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    (globalThis as { __vimRacingDebugUndo?: boolean }).__vimRacingDebugUndo ===
      true
  );
}

function logUndoDebug(message: string, data?: unknown): void {
  if (!shouldDebugUndo()) return;
  if (data !== undefined) {
    console.log(`[vim-undo-debug] ${message}`, data);
    return;
  }
  console.log(`[vim-undo-debug] ${message}`);
}

/**
 * State effect to toggle delete mode on/off
 */
export const setDeleteMode = StateEffect.define<boolean>();

/**
 * State effect to set the allowed deletion range (for delete tasks)
 */
export const setAllowedDeleteRange = StateEffect.define<{
  from: number;
  to: number;
} | null>();

/**
 * State effect to allow a reset (bypasses the read-only filter)
 */
export const allowReset = StateEffect.define<boolean>();
export const setUndoBarrier = StateEffect.define<boolean>();

/**
 * State effect to toggle yank+paste mode
 */
export const setYankPasteMode = StateEffect.define<boolean>();

/**
 * State effect to signal that the correct text has been yanked.
 * Transitions from yank phase (no edits) to paste phase (insertions only).
 */
export const setYankPasteConfirmed = StateEffect.define<boolean>();

/**
 * State effect to set the allowed paste offset.
 * Insertions must occur on the same line as this offset.
 */
export const setAllowedPasteOffset = StateEffect.define<number | null>();

export type EditBlockReason =
  | 'undoBarrier'
  | 'readOnlyTask'
  | 'insertNotAllowed'
  | 'outsideAllowedRange'
  | 'wrongPastePosition';

export const blockedEditReasonAnnotation = Annotation.define<EditBlockReason>();

/**
 * State field that tracks whether deletions are allowed
 */
const deleteModeState = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setDeleteMode)) {
        return effect.value;
      }
    }
    return value;
  },
});

const yankPasteModeState = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setYankPasteMode)) return effect.value;
    }
    return value;
  },
});

const yankPasteConfirmedState = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setYankPasteConfirmed)) return effect.value;
      // Reset when yankPasteMode is toggled
      if (effect.is(setYankPasteMode)) return false;
    }
    return value;
  },
});

const allowedPasteOffsetState = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setAllowedPasteOffset)) return effect.value;
      // Reset when yankPasteMode is toggled
      if (effect.is(setYankPasteMode)) return null;
    }
    return value;
  },
});

/**
 * State field that blocks undo/redo immediately after a reset swap.
 * It is cleared on the first normal document edit after reset.
 */
const undoBarrierState = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setUndoBarrier)) {
        return effect.value;
      }
    }

    if (tr.docChanged) {
      const isResetSwap = tr.effects.some(
        (effect) => effect.is(allowReset) && effect.value
      );
      if (!isResetSwap) {
        return false;
      }
    }

    return value;
  },
});

/**
 * State field that tracks the allowed deletion range.
 * This range shrinks as characters are deleted.
 */
const allowedDeleteRangeState = StateField.define<{
  from: number;
  to: number;
} | null>({
  create: () => null,
  update(value, tr) {
    // Check for explicit range set effect
    for (const effect of tr.effects) {
      if (effect.is(setAllowedDeleteRange)) {
        return effect.value;
      }
    }

    // Map the range through document changes to keep it in sync
    if (value && tr.docChanged) {
      // Keep boundary inserts inside the tracked range so undo at either edge
      // restores the full highlighted span.
      const newFrom = tr.changes.mapPos(value.from, -1);
      const newTo = tr.changes.mapPos(value.to, 1);

      // If the range collapsed or became invalid, return null
      if (newFrom >= newTo) {
        return null;
      }
      return { from: newFrom, to: newTo };
    }

    return value;
  },
});

/**
 * Extension that allows Vim navigation but blocks document modifications.
 * When delete mode is enabled, deletions are only allowed within the target range.
 */
const readOnlyFilter = EditorState.transactionFilter.of((tr) => {
  const buildBlockedTransaction = (
    reason: EditBlockReason
  ): TransactionSpec => {
    const blocked: TransactionSpec = {
      annotations: blockedEditReasonAnnotation.of(reason),
    };
    if (tr.selection) blocked.selection = tr.selection;
    if (tr.scrollIntoView) blocked.scrollIntoView = true;
    return blocked;
  };

  const isUndoRedo = tr.isUserEvent('undo') || tr.isUserEvent('redo');
  if (isUndoRedo) {
    logUndoDebug('saw undo/redo transaction', {
      userEvent: tr.annotation(Transaction.userEvent),
      docChanged: tr.docChanged,
    });
  }

  // If no document changes, allow everything (navigation, selection, etc.)
  if (!tr.docChanged) {
    if (isUndoRedo) {
      logUndoDebug('allowing undo/redo with no doc changes');
    }
    return tr;
  }

  // Check if this transaction has an allowReset effect - if so, let it through
  for (const effect of tr.effects) {
    if (effect.is(allowReset) && effect.value) {
      if (isUndoRedo) {
        logUndoDebug('allowing undo/redo due to allowReset effect');
      }
      return tr;
    }
  }

  // Check if delete mode is enabled
  const deleteMode = tr.startState.field(deleteModeState);
  const undoBarrier = tr.startState.field(undoBarrierState);

  if (isUndoRedo && undoBarrier) {
    logUndoDebug('blocking undo/redo due to reset barrier');
    return buildBlockedTransaction('undoBarrier');
  }

  if (deleteMode) {
    const allowedRange = tr.startState.field(allowedDeleteRangeState);

    if (isUndoRedo && allowedRange) {
      let isInAllowedRange = true;
      tr.changes.iterChanges((fromA, toA) => {
        if (fromA < allowedRange.from || toA > allowedRange.to) {
          isInAllowedRange = false;
        }
      });

      if (isInAllowedRange) {
        logUndoDebug('allowing undo/redo inside allowed range', {
          allowedRange,
        });
        return tr;
      }
      logUndoDebug('blocking undo/redo outside allowed range', {
        allowedRange,
      });
      return buildBlockedTransaction('outsideAllowedRange');
    }

    let isValidDeletion = true;
    let outsideAllowedRange = false;

    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      const isDelete = inserted.length === 0 || inserted.length < toA - fromA;
      if (!isDelete) {
        isValidDeletion = false;
        return;
      }

      if (allowedRange) {
        if (fromA < allowedRange.from || toA > allowedRange.to) {
          isValidDeletion = false;
          outsideAllowedRange = true;
        }
      }
    });

    if (isValidDeletion) {
      if (isUndoRedo) {
        logUndoDebug('allowing undo/redo as valid deletion');
      }
      return tr;
    }

    return buildBlockedTransaction(
      outsideAllowedRange ? 'outsideAllowedRange' : 'insertNotAllowed'
    );
  }

  // Yank+paste mode: two phases
  const yankPasteMode = tr.startState.field(yankPasteModeState);
  if (yankPasteMode) {
    const confirmed = tr.startState.field(yankPasteConfirmedState);
    if (!confirmed) {
      // Yank phase: block all doc changes (navigation only)
      return buildBlockedTransaction('readOnlyTask');
    }
    // Paste phase: allow insertions only, no deletions
    let hasDeletion = false;
    tr.changes.iterChanges((fromA, toA) => {
      if (toA > fromA) hasDeletion = true; // something was removed
    });
    if (hasDeletion) {
      return buildBlockedTransaction('insertNotAllowed');
    }
    // Check insertion position matches the expected paste location
    const pasteOffset = tr.startState.field(allowedPasteOffsetState);
    if (pasteOffset !== null) {
      const line = tr.startState.doc.lineAt(pasteOffset);
      let wrongPosition = false;
      tr.changes.iterChanges((fromA) => {
        // Allow insertion anywhere on the paste marker's line or just past its newline (linewise paste)
        if (fromA < line.from || fromA > line.to + 1) {
          wrongPosition = true;
        }
      });
      if (wrongPosition) {
        return buildBlockedTransaction('wrongPastePosition');
      }
    }
    return tr;
  }

  if (isUndoRedo) {
    logUndoDebug('blocking undo/redo transaction', {
      deleteMode,
      hasSelection: Boolean(tr.selection),
      scrollIntoView: tr.scrollIntoView,
    });
  }

  return buildBlockedTransaction('readOnlyTask');
});

/**
 * The read-only navigation extension bundle.
 * Use setDeleteMode effect to toggle deletion capability.
 * Use setAllowedDeleteRange to restrict deletions to a specific range.
 */
export const readOnlyNavigation: Extension = [
  deleteModeState,
  yankPasteModeState,
  yankPasteConfirmedState,
  allowedPasteOffsetState,
  undoBarrierState,
  allowedDeleteRangeState,
  readOnlyFilter,
];
