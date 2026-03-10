import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { EditorState, Compartment } from "@codemirror/state";
import { cpp } from "@codemirror/lang-cpp";
import {
  EditorView, keymap, drawSelection,
  highlightActiveLine, lineNumbers, highlightActiveLineGutter
} from "@codemirror/view";
import { defaultKeymap, history } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { vim, Vim, getCM } from '@replit/codemirror-vim';
import { oneDark } from '@codemirror/theme-one-dark';

import { targetHighlightExtension } from '../extensions/targetHighlight';
import { cursorTracker } from '../extensions/cursorTracker';
import {
  blockedEditReasonAnnotation,
  EditBlockReason,
  readOnlyNavigation,
} from '../extensions/readOnlyNavigation';
import type { KeystrokeEvent } from '../types/keystroke';

// ---------------------------------------------------------------------------
// Shared color palette used across all race / practice pages
// ---------------------------------------------------------------------------
export const editorColors = {
  bgDark: '#0a0a0f',
  bgCard: '#12121a',
  bgGradientStart: '#0f172a',
  bgGradientEnd: '#1e1b4b',
  primary: '#06b6d4',
  primaryLight: '#22d3ee',
  primaryGlow: 'rgba(6, 182, 212, 0.3)',
  secondary: '#ec4899',
  secondaryLight: '#f472b6',
  success: '#10b981',
  successLight: '#34d399',
  warning: '#fbbf24',
  warningDark: '#f59e0b',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  border: '#334155',
  borderLight: '#475569',
};

const EDITOR_FONT_SIZE_PX = '18px';

// ---------------------------------------------------------------------------
// Editor-only extensions (shared between practice & multiplayer)
// ---------------------------------------------------------------------------

const lineNumbersCompartment = new Compartment();
const historyCompartment = new Compartment();

/** Block all mouse interaction — the editor is keyboard-only. */
const disableMouseInteraction = EditorView.domEventHandlers({
  mousedown: () => true,
  click: () => true,
  dblclick: () => true,
  contextmenu: () => true,
  selectstart: () => true,
});

/** Allow click-to-focus but block mouse cursor movement/selection. */
const focusOnlyMouseInteraction = EditorView.domEventHandlers({
  mousedown: (event, view) => {
    event.preventDefault();
    view.focus();
    return true;
  },
  click: (event, view) => {
    event.preventDefault();
    view.focus();
    return true;
  },
  dblclick: (event, view) => {
    event.preventDefault();
    view.focus();
    return true;
  },
  contextmenu: () => true,
  selectstart: () => true,
});

function shouldDebugUndo(): boolean {
  return typeof globalThis !== 'undefined'
    && (globalThis as { __vimRacingDebugUndo?: boolean }).__vimRacingDebugUndo === true;
}


function createLineNumbersExtension(relative: boolean) {
  return lineNumbers({
    formatNumber: (lineNo: number, state: EditorState) => {
      if (!relative) return String(lineNo);
      const cursorLine = state.doc.lineAt(state.selection.main.head).number;
      if (lineNo === cursorLine) return String(lineNo);
      return String(Math.abs(cursorLine - lineNo));
    },
  });
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Handle exposed to parent components via ref. */
export interface VimRaceEditorHandle {
  /** The underlying CodeMirror EditorView (null before mount). */
  view: EditorView | null;
  /** Toggle between relative and absolute line numbers. */
  setRelativeLineNumbers: (relative: boolean) => void;
  /** Clear undo/redo history stack. */
  resetUndoHistory: () => void;
}

interface VimRaceEditorProps {
  /** Initial document content shown when the editor mounts. */
  initialDoc: string;
  /** Called once after the EditorView is created. */
  onReady?: (view: EditorView) => void;
  /** Called whenever the cursor position changes. */
  onCursorChange: (offset: number) => void;
  /** Called whenever the document text changes. */
  onDocChange?: (text: string) => void;
  /** Called when a document edit is blocked by task guardrails. */
  onBlockedEdit?: (reason: EditBlockReason) => void;
  /** Called for each key pressed while focused in the editor. */
  onKeyStroke?: (event: KeystrokeEvent) => void;
  /**
   * Called on blur — return `true` to allow the blur (e.g. task complete),
   * `false` to auto-refocus. Defaults to never allowing blur.
   */
  shouldAllowBlur?: () => boolean;
  /**
   * Allow mouse interactions (click-to-focus, click-to-move-cursor).
   * Defaults to false for keyboard-only race mode behavior.
   */
  allowMouseNavigation?: boolean;
  /**
   * Allow mouse clicks to focus editor, but block mouse cursor movement.
   * Ignored when allowMouseNavigation is true.
   */
  allowMouseFocusOnly?: boolean;
  /**
   * Auto-focus editor once on mount. Defaults to true.
   */
  autoFocusOnMount?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const VimRaceEditor = forwardRef<VimRaceEditorHandle, VimRaceEditorProps>(
  ({
    initialDoc,
    onReady,
    onCursorChange,
    onDocChange,
    onBlockedEdit,
    onKeyStroke,
    shouldAllowBlur,
    allowMouseNavigation = false,
    allowMouseFocusOnly = false,
    autoFocusOnMount = true,
  }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);

    // Refs for callbacks so CodeMirror extensions never hold stale closures.
    const onCursorChangeRef = useRef(onCursorChange);
    const onDocChangeRef = useRef(onDocChange);
    const onBlockedEditRef = useRef(onBlockedEdit);
    const onKeyStrokeRef = useRef(onKeyStroke);
    const shouldAllowBlurRef = useRef(shouldAllowBlur);

    useEffect(() => { onCursorChangeRef.current = onCursorChange; }, [onCursorChange]);
    useEffect(() => { onDocChangeRef.current = onDocChange; }, [onDocChange]);
    useEffect(() => { onBlockedEditRef.current = onBlockedEdit; }, [onBlockedEdit]);
    useEffect(() => { onKeyStrokeRef.current = onKeyStroke; }, [onKeyStroke]);
    useEffect(() => { shouldAllowBlurRef.current = shouldAllowBlur; }, [shouldAllowBlur]);

    useImperativeHandle(ref, () => ({
      get view() { return viewRef.current; },
      setRelativeLineNumbers(relative: boolean) {
        viewRef.current?.dispatch({
          effects: lineNumbersCompartment.reconfigure(
            createLineNumbersExtension(relative),
          ),
        });
      },
      resetUndoHistory() {
        // Reconfiguring to the same extension preserves field state, so
        // remove history first, then re-add to guarantee a fresh undo stack.
        viewRef.current?.dispatch({
          effects: historyCompartment.reconfigure([]),
        });
        viewRef.current?.dispatch({
          effects: historyCompartment.reconfigure(history()),
        });
      },
    }));

    // Create editor on mount, destroy on unmount.
    useEffect(() => {
      if (!containerRef.current) return;

      // Use Vim-style regexes in search to avoid PCRE helper prompts/no-match hints.
      if (typeof (Vim as { setOption?: (name: string, value: unknown) => void }).setOption === 'function') {
        (Vim as { setOption?: (name: string, value: unknown) => void }).setOption?.('pcre', false);
      }

      const docChangeListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onDocChangeRef.current?.(update.state.doc.toString());
        }
        for (const transaction of update.transactions) {
          const blockReason = transaction.annotation(blockedEditReasonAnnotation);
          if (blockReason) {
            onBlockedEditRef.current?.(blockReason);
          }
        }
      });

      const view = new EditorView({
        doc: initialDoc,
        parent: containerRef.current,
        extensions: [
          vim({ status: true }),
          cpp(),
          oneDark,
          readOnlyNavigation,
          docChangeListener,
          ...targetHighlightExtension,
          cursorTracker((offset) => onCursorChangeRef.current(offset)),
          lineNumbersCompartment.of(createLineNumbersExtension(true)),
          historyCompartment.of(history()),
          drawSelection(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          ...(allowMouseNavigation ? [] : [allowMouseFocusOnly ? focusOnlyMouseInteraction : disableMouseInteraction]),
          keymap.of([...defaultKeymap, ...searchKeymap]),
          EditorView.theme({
            '&': {
              fontSize: EDITOR_FONT_SIZE_PX,
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            },
            '.cm-content': {
              caretColor: editorColors.primary,
            },
            '.cm-cursor, .cm-dropCursor': {
              borderLeftColor: editorColors.primary,
              borderLeftWidth: '2px',
            },
            '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
              backgroundColor: `${editorColors.primary}30`,
            },
            '.cm-activeLine': {
              backgroundColor: `${editorColors.primary}10`,
            },
            '.cm-activeLineGutter': {
              backgroundColor: `${editorColors.primary}15`,
            },
            '.cm-gutters': {
              backgroundColor: editorColors.bgCard,
              borderRight: `1px solid ${editorColors.border}`,
            },
            '.cm-lineNumbers .cm-gutterElement': {
              color: editorColors.textMuted,
            },
            '.cm-lineNumbers .cm-gutterElement.cm-activeLineGutter': {
              color: editorColors.primaryLight,
            },
            '.cm-panels': {
              backgroundColor: 'transparent',
              color: editorColors.textPrimary,
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              fontSize: EDITOR_FONT_SIZE_PX,
              padding: '0',
              margin: '0',
            },
            '.cm-panels div': {
              padding: '0',
              margin: '0',
            },
            '.cm-panels button': {
              display: 'none',
            },
            '.cm-panels span + span': {
              display: 'none',
            },
            '.cm-panels input': {
              backgroundColor: 'transparent',
              color: editorColors.textPrimary,
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              fontSize: EDITOR_FONT_SIZE_PX,
              border: 'none',
              borderRadius: '0',
              outline: 'none',
              padding: '0',
              margin: '0',
              lineHeight: '1.4',
            },
          }),
        ],
      });

      viewRef.current = view;
      onReady?.(view);

      // ---------------------------------------------------------------
      // Escape key: intercept at the DOM level so the browser never
      // gets to blur the contenteditable element.  Route the key
      // through the Vim API so insert→normal transitions always work.
      // ---------------------------------------------------------------
      const handleEscapeKey = (e: KeyboardEvent) => {
        // Shift is only a modifier for other keys in this telemetry model.
        // Skip standalone Shift presses so they don't inflate keystroke counts.
        if (e.key === 'Shift') {
          return;
        }

        onKeyStrokeRef.current?.({
          key: e.key,
          altKey: e.altKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          shiftKey: e.shiftKey,
          repeat: e.repeat,
          dtMs: Math.max(0, Math.floor(e.timeStamp)),
        });

        if (shouldDebugUndo() && (e.key === 'u' || (e.key.toLowerCase() === 'r' && e.ctrlKey))) {
          const cm = getCM(view);
          console.log('[vim-undo-debug] keydown in editor', {
            key: e.key,
            ctrlKey: e.ctrlKey,
            insertMode: Boolean(cm?.state?.vim?.insertMode),
            vimAttached: Boolean(cm?.state?.vim),
          });
        }

        if (e.key === 'Escape' || (e.key === '[' && e.ctrlKey)) {
          e.preventDefault();
          const cm = getCM(view);
          if (cm?.state?.vim) {
            try {
              Vim.handleKey(cm, '<Esc>', 'user');
            } catch {
              cm.state.vim.insertMode = false;
            }
          }
        }
      };
      // Capture phase ensures we record the key before downstream handlers
      // can trigger task-complete state transitions in parent components.
      view.contentDOM.addEventListener('keydown', handleEscapeKey, true);

      const handleWindowKeyCapture = (e: KeyboardEvent) => {
        if (!shouldDebugUndo()) return;
        if (e.key !== 'u' && !(e.key.toLowerCase() === 'r' && e.ctrlKey)) return;
        if (!view.dom.contains(e.target as Node)) return;

        console.log('[vim-undo-debug] window capture keydown', {
          key: e.key,
          ctrlKey: e.ctrlKey,
          targetTag: (e.target as HTMLElement | null)?.tagName,
          activeInsideEditor: view.dom.contains(document.activeElement),
        });
      };
      window.addEventListener('keydown', handleWindowKeyCapture, { capture: true });

      // Refocus the editor whenever it loses focus unintentionally.
      // Parents opt into allowing blur via the shouldAllowBlur callback.
      // This also handles Escape-from-Vimium which blurs without a keydown.
      const handleBlur = (e: FocusEvent) => {
        // Allow focus to move to vim dialogs (e.g. '/' search prompt)
        // that live inside the editor DOM but outside contentDOM.
        if (e.relatedTarget instanceof Node && view.dom.contains(e.relatedTarget)) {
          return;
        }

        const allowBlur = shouldAllowBlurRef.current;
        if (!allowBlur || !allowBlur()) {
          // Force vim back to normal mode — Vimium (or similar browser
          // extensions) can steal Escape, blur the editor, and leave vim
          // stuck in insert mode since the keydown never reached the page.
          const cm = getCM(view);
          if (cm?.state?.vim?.insertMode) {
            try {
              Vim.handleKey(cm, '<Esc>', 'user');
            } catch {
              cm.state.vim.insertMode = false;
            }
          }
          requestAnimationFrame(() => viewRef.current?.focus());
        }
      };
      view.contentDOM.addEventListener('blur', handleBlur);

      // Auto-focus on mount.
      if (autoFocusOnMount) {
        view.focus();
      }

      return () => {
        view.contentDOM.removeEventListener('keydown', handleEscapeKey, true);
        view.contentDOM.removeEventListener('blur', handleBlur);
        window.removeEventListener('keydown', handleWindowKeyCapture, { capture: true });
        view.destroy();
        viewRef.current = null;
      };
      // initialDoc and autoFocusOnMount are intentionally read only on mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <div ref={containerRef} />;
  },
);

VimRaceEditor.displayName = 'VimRaceEditor';
