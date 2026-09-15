/**
 * Tests for the paste destination marker in the targetHighlight extension.
 *
 * Characterwise tasks highlight a single character; linewise tasks (yy + p)
 * highlight the whole target line so players can see the paste target is the
 * line, not one column.
 */
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import {
  targetHighlightExtension,
  setPasteMarker,
  pasteMarkerField,
} from './targetHighlight';

const DOC = 'const foo = bar;\nconst baz = qux;';

function pasteDecorations(
  state: EditorState
): Array<{ from: number; to: number; cls: string }> {
  const found: Array<{ from: number; to: number; cls: string }> = [];
  state
    .field(pasteMarkerField)
    .between(0, state.doc.length, (from, to, deco) => {
      found.push({ from, to, cls: String(deco.spec.class) });
    });
  return found;
}

function stateWithMarker(
  marker: { offset: number; linewise?: boolean } | null
): EditorState {
  const state = EditorState.create({
    doc: DOC,
    extensions: targetHighlightExtension,
  });
  return state.update({ effects: setPasteMarker.of(marker) }).state;
}

describe('paste marker highlight', () => {
  it('marks a single character for characterwise tasks', () => {
    const decos = pasteDecorations(stateWithMarker({ offset: 6 }));
    expect(decos).toEqual([{ from: 6, to: 7, cls: 'cm-paste-highlight' }]);
  });

  it("marks the target line's characters for linewise tasks", () => {
    // Offset 17 is the start of line 2 ("const baz = qux;"), which spans 17-33
    const decos = pasteDecorations(
      stateWithMarker({ offset: 17, linewise: true })
    );
    expect(decos).toEqual([{ from: 17, to: 33, cls: 'cm-paste-highlight' }]);
  });

  it('falls back to a full-width line highlight on an empty line', () => {
    const state = EditorState.create({
      doc: 'first\n\nlast',
      extensions: targetHighlightExtension,
    }).update({
      effects: setPasteMarker.of({ offset: 6, linewise: true }),
    }).state;
    expect(pasteDecorations(state)).toEqual([
      { from: 6, to: 6, cls: 'cm-paste-line-highlight' },
    ]);
  });

  it('clears the marker when set to null', () => {
    let state = stateWithMarker({ offset: 6 });
    state = state.update({ effects: setPasteMarker.of(null) }).state;
    expect(pasteDecorations(state)).toEqual([]);
  });
});
