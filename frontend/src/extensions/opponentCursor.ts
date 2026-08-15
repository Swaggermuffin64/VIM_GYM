import { StateField, StateEffect, RangeSet } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';

// Effect to set the opponent cursor position
export const setOpponentCursor = StateEffect.define<number | null>();

// Decoration mark for the opponent's cursor
const opponentCursorMark = Decoration.mark({
  class: 'cm-opponent-cursor',
});

// StateField to track and display the opponent cursor
export const opponentCursorField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    // Check for our effect
    for (const effect of tr.effects) {
      if (effect.is(setOpponentCursor)) {
        if (effect.value === null) {
          return Decoration.none;
        }
        // Create decoration for the opponent cursor
        const pos = effect.value;
        const docLength = tr.state.doc.length;

        if (pos >= 0 && pos < docLength) {
          return RangeSet.of([opponentCursorMark.range(pos, pos + 1)]);
        }
        return Decoration.none;
      }
    }
    // Map decorations through document changes
    return decorations.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

// Theme for the opponent cursor (yellow/gold)
export const opponentCursorTheme = EditorView.baseTheme({
  '.cm-opponent-cursor': {
    backgroundColor: '#ffd700',
    color: '#1a1a2e',
    borderRadius: '2px',
    boxShadow: '0 0 8px #ffd700, 0 0 16px #ffd70055',
    animation: 'opponentPulse 0.8s ease-in-out infinite',
  },
  '@keyframes opponentPulse': {
    '0%, 100%': {
      boxShadow: '0 0 8px #ffd700, 0 0 16px #ffd70055',
    },
    '50%': {
      boxShadow: '0 0 12px #ffd700, 0 0 24px #ffd70088',
    },
  },
});

// Combined extension for easy import
export const opponentCursorExtension = [
  opponentCursorField,
  opponentCursorTheme,
];
