import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Transaction } from '@codemirror/state';
import { Vim, getCM } from '@replit/codemirror-vim';
import type { CodeMirrorV } from '@replit/codemirror-vim';

import type { Task } from '../types/task';
import { VimRaceEditor, type VimRaceEditorHandle } from './VimRaceEditor';
import { setTargetPosition, setTargetRange } from '../extensions/targetHighlight';
import { setDeleteMode, setAllowedDeleteRange, allowReset, setUndoBarrier } from '../extensions/readOnlyNavigation';

interface SummaryTaskSandboxProps {
  task: Task;
  onCompletionChange?: (isComplete: boolean) => void;
  resetToken?: number;
  autoFocusOnMount?: boolean;
}

export const SummaryTaskSandbox: React.FC<SummaryTaskSandboxProps> = ({
  task,
  onCompletionChange,
  resetToken = 0,
  autoFocusOnMount = false,
}) => {
  const editorRef = useRef<VimRaceEditorHandle>(null);
  const onCompletionChangeRef = useRef(onCompletionChange);
  const isCompleteRef = useRef(false);
  const hasSeenInitialCursorRef = useRef(false);
  const [editorReadyTick, setEditorReadyTick] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    onCompletionChangeRef.current = onCompletionChange;
  }, [onCompletionChange]);

  const applyTaskState = useCallback(() => {
    const view = editorRef.current?.view;
    if (!view) return;

    const taskEffects =
      task.type === 'navigate'
        ? [
            setTargetPosition.of(task.targetOffset),
            setDeleteMode.of(false),
            setAllowedDeleteRange.of(null),
          ]
        : task.type === 'delete'
          ? [
              setTargetRange.of(task.targetRange),
              setDeleteMode.of(true),
              setAllowedDeleteRange.of(task.targetRange),
            ]
          : [
              setDeleteMode.of(false),
              setAllowedDeleteRange.of(null),
            ];

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: task.codeSnippet,
      },
      selection: { anchor: 0 },
      effects: [allowReset.of(true), setUndoBarrier.of(true), ...taskEffects],
      annotations: Transaction.addToHistory.of(false),
    });

    const cm = getCM(view);
    if (cm?.state?.vim) {
      Vim.handleEx(cm as CodeMirrorV, 'nohlsearch');
    }
  }, [task]);

  useEffect(() => {
    isCompleteRef.current = false;
    hasSeenInitialCursorRef.current = false;
    setIsComplete(false);
    onCompletionChangeRef.current?.(false);
  }, [task]);

  useEffect(() => {
    if (editorReadyTick === 0) return;
    applyTaskState();
  }, [applyTaskState, editorReadyTick]);

  useEffect(() => {
    if (editorReadyTick === 0) return;
    isCompleteRef.current = false;
    hasSeenInitialCursorRef.current = false;
    setIsComplete(false);
    onCompletionChangeRef.current?.(false);
    applyTaskState();
  }, [applyTaskState, editorReadyTick, resetToken]);

  const markTaskComplete = useCallback((consumeNavigateHighlight: boolean) => {
    if (isCompleteRef.current) return;
    isCompleteRef.current = true;
    setIsComplete(true);

    const view = editorRef.current?.view;
    if (view) {
      if (consumeNavigateHighlight) {
        view.dispatch({
          effects: [setTargetPosition.of(null)],
        });
      }
      view.contentDOM.blur();
    }

    onCompletionChangeRef.current?.(true);
  }, []);

  const handleCursorChange = useCallback((offset: number) => {
    if (!hasSeenInitialCursorRef.current) {
      hasSeenInitialCursorRef.current = true;
      return;
    }
    if (task.type === 'navigate' && offset === task.targetOffset) {
      markTaskComplete(true);
    }
  }, [markTaskComplete, task]);

  const handleDocChange = useCallback((text: string) => {
    if (task.type === 'delete' && text === task.expectedResult) {
      markTaskComplete(false);
    }
  }, [markTaskComplete, task]);

  return (
    <div style={styles.container}>
      <div style={styles.editorWrapper}>
        <VimRaceEditor
          ref={editorRef}
          initialDoc={task.codeSnippet}
          onReady={() => setEditorReadyTick((tick) => tick + 1)}
          onCursorChange={handleCursorChange}
          onDocChange={handleDocChange}
          shouldAllowBlur={() => true}
        allowMouseFocusOnly
        autoFocusOnMount={autoFocusOnMount}
        />
        {isComplete && <div style={styles.freezeOverlay} />}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  editorWrapper: {
    position: 'relative',
  },
  freezeOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 5,
    cursor: 'default',
  },
};
