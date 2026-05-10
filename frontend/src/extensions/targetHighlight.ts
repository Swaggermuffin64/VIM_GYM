import { StateField, StateEffect, RangeSet } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  gutter,
  GutterMarker,
} from '@codemirror/view';

// Effect to set the target position (for navigate tasks - single character)
export const setTargetPosition = StateEffect.define<number | null>();

// Effect to set target range (for delete tasks - multiple characters)
export const setTargetRange = StateEffect.define<{
  from: number;
  to: number;
} | null>();

// Effect to set yank range (for yank_paste tasks - blue highlight)
export const setYankRange = StateEffect.define<{
  from: number;
  to: number;
} | null>();

// Effect to set paste destination marker (for yank_paste tasks - green highlight)
export const setPasteMarker = StateEffect.define<number | null>();

// Effect to confirm yank (switches yank highlight from blue to green)
export const setYankConfirmed = StateEffect.define<boolean>();

// Decoration mark for single target character (navigate - coral/red)
const targetMark = Decoration.mark({
  class: 'cm-target-highlight',
});

// Decoration mark for delete range (magenta/pink)
const deleteRangeMark = Decoration.mark({
  class: 'cm-delete-highlight',
});

// Decoration mark for yank range (blue)
const yankRangeMark = Decoration.mark({
  class: 'cm-yank-highlight',
});

// Decoration mark for paste destination (green)
const pasteMarkerMark = Decoration.mark({
  class: 'cm-paste-highlight',
});

/**
 * Gutter marker that renders a visible ↵ glyph for newline characters that
 * are the sole highlighted character on their line.
 */
class NewlineGlyphMarker extends GutterMarker {
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-newline-glyph';
    span.textContent = '↵';
    return span;
  }
}

const newlineGlyphMarker = new NewlineGlyphMarker();

/**
 * Gutter marker for lines that will be merged (after a newline in the target range)
 */
class MergeLineMarker extends GutterMarker {
  toDOM() {
    const marker = document.createElement('div');
    marker.className = 'cm-merge-line-marker';
    return marker;
  }
}

const mergeLineMarker = new MergeLineMarker();

/**
 * State field to track which lines should have the merge marker
 */
export const mergeLineState = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(markers, tr) {
    // Check for setTargetRange effect
    for (const effect of tr.effects) {
      if (effect.is(setTargetRange)) {
        if (effect.value === null) {
          return RangeSet.empty;
        }
        const { from, to } = effect.value;
        return buildMergeLineMarkers(tr.state.doc, from, to);
      }
      if (effect.is(setTargetPosition)) {
        return RangeSet.empty;
      }
    }

    // On doc change, rebuild markers if we have any
    if (tr.docChanged && markers !== RangeSet.empty) {
      // Find current highlight range and rebuild
      let hasRange = false;
      let from = 0,
        to = 0;

      const decorations = tr.state.field(targetHighlightField, false);
      if (decorations) {
        decorations.between(0, tr.state.doc.length, (f, t, deco) => {
          if (deco.spec.class === 'cm-delete-highlight') {
            hasRange = true;
            from = f;
            to = t;
          }
        });
      }

      if (hasRange && from < to) {
        return buildMergeLineMarkers(tr.state.doc, from, to);
      }
      return RangeSet.empty;
    }

    return markers;
  },
});

/**
 * Build markers for lines that come after newlines in the target range
 */
function buildMergeLineMarkers(
  doc: {
    sliceString: (from: number, to: number) => string;
    lineAt: (pos: number) => { from: number; to: number; number: number };
    lines: number;
  },
  from: number,
  to: number
): RangeSet<GutterMarker> {
  const markers: Array<{ from: number; marker: GutterMarker }> = [];
  const text = doc.sliceString(from, to);
  let searchPos = 0;

  while ((searchPos = text.indexOf('\n', searchPos)) !== -1) {
    // Position right after the newline
    const posAfterNewline = from + searchPos + 1;

    // Make sure we're not past the end of the range
    if (posAfterNewline <= to) {
      const nextLine = doc.lineAt(posAfterNewline);
      markers.push({ from: nextLine.from, marker: mergeLineMarker });
    }
    searchPos++;
  }

  // Sort and dedupe
  const sorted = markers.sort((a, b) => a.from - b.from);
  return RangeSet.of(sorted.map((m) => m.marker.range(m.from)));
}

/**
 * State field to track which lines should show the ↵ glyph in the gutter.
 * A glyph appears when a \n is the only highlighted character on its line.
 */
const newlineGlyphState = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(markers, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setTargetRange)) {
        if (effect.value === null) return RangeSet.empty;
        const { from, to } = effect.value;
        return buildNewlineGlyphMarkers(tr.state.doc, from, to);
      }
      if (effect.is(setTargetPosition)) return RangeSet.empty;
    }

    // Always re-evaluate on doc changes — the glyph may become needed after
    // the user deletes visible characters, leaving only a \n on the line.
    if (tr.docChanged) {
      let hasRange = false;
      let from = 0,
        to = 0;
      const decorations = tr.state.field(targetHighlightField, false);
      if (decorations) {
        decorations.between(0, tr.state.doc.length, (f, t, deco) => {
          if (deco.spec.class === 'cm-delete-highlight') {
            hasRange = true;
            from = f;
            to = t;
          }
        });
      }
      if (hasRange && from < to) {
        return buildNewlineGlyphMarkers(tr.state.doc, from, to);
      }
      return markers;
    }

    return markers;
  },
});

/**
 * Build gutter markers for newlines that are the sole highlighted character
 * on their line. The marker is placed on the line the \n terminates.
 */
function buildNewlineGlyphMarkers(
  doc: {
    sliceString: (from: number, to: number) => string;
    lineAt: (pos: number) => { from: number; to: number };
  },
  from: number,
  to: number
): RangeSet<GutterMarker> {
  const markers: Array<{ from: number; marker: GutterMarker }> = [];
  const text = doc.sliceString(from, to);
  let searchPos = 0;

  while ((searchPos = text.indexOf('\n', searchPos)) !== -1) {
    const newlinePos = from + searchPos;
    const line = doc.lineAt(newlinePos);
    // Overlap of the delete range with this line's visible content
    const highlightStart = Math.max(from, line.from);
    const highlightEnd = Math.min(to, line.to);
    if (highlightStart >= highlightEnd) {
      markers.push({ from: line.from, marker: newlineGlyphMarker });
    }
    searchPos++;
  }

  const sorted = markers.sort((a, b) => a.from - b.from);
  return RangeSet.of(sorted.map((m) => m.marker.range(m.from)));
}

/**
 * Gutter that houses both the ↵ glyph and the merge-line bar.
 * The glyph takes priority if both would appear on the same line.
 */
const newlineIndicatorGutter = gutter({
  class: 'cm-newline-gutter',
  lineMarker: (view, line) => {
    const glyphs = view.state.field(newlineGlyphState);
    let hasGlyph = false;
    glyphs.between(line.from, line.from + 1, () => {
      hasGlyph = true;
    });
    if (hasGlyph) return newlineGlyphMarker;

    const merges = view.state.field(mergeLineState);
    let hasMerge = false;
    merges.between(line.from, line.from + 1, () => {
      hasMerge = true;
    });
    if (hasMerge) return mergeLineMarker;

    return null;
  },
});

/**
 * Build decorations for a delete range (just the highlight mark).
 */
function buildDeleteDecorations(from: number, to: number): DecorationSet {
  return RangeSet.of([deleteRangeMark.range(from, to)]);
}

// StateField to track and display the target highlight
export const targetHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    // Check for our effects
    for (const effect of tr.effects) {
      // Handle single position (navigate)
      if (effect.is(setTargetPosition)) {
        if (effect.value === null) {
          return Decoration.none;
        }
        const pos = effect.value;
        const docLength = tr.state.doc.length;

        if (pos >= 0 && pos < docLength) {
          return RangeSet.of([targetMark.range(pos, pos + 1)]);
        }
        return Decoration.none;
      }

      // Handle range (delete)
      if (effect.is(setTargetRange)) {
        if (effect.value === null) {
          return Decoration.none;
        }
        const { from, to } = effect.value;
        const docLength = tr.state.doc.length;

        if (from >= 0 && to <= docLength && from < to) {
          return buildDeleteDecorations(from, to);
        }
        return Decoration.none;
      }

      // Handle yank range (blue highlight)
      if (effect.is(setYankRange)) {
        if (effect.value === null) {
          return Decoration.none;
        }
        const { from, to } = effect.value;
        const docLength = tr.state.doc.length;
        if (from >= 0 && to <= docLength && from < to) {
          return RangeSet.of([yankRangeMark.range(from, to)]);
        }
        return Decoration.none;
      }

      // Handle yank confirmed (clear the yank highlight)
      if (effect.is(setYankConfirmed)) {
        if (!effect.value) return decorations;
        return Decoration.none;
      }
    }

    // Map decorations through document changes and rebuild if needed
    if (tr.docChanged && decorations !== Decoration.none) {
      // Extract the current range from decorations and rebuild
      let hasRange = false;
      let from = 0,
        to = 0;

      decorations.between(0, tr.state.doc.length, (f, t, deco) => {
        if (deco.spec.class === 'cm-delete-highlight') {
          hasRange = true;
          // Include edits that occur exactly on either boundary so undo at
          // range edges restores the original visual highlight.
          from = tr.changes.mapPos(f, -1);
          to = tr.changes.mapPos(t, 1);
        }
      });

      if (hasRange && from < to) {
        return buildDeleteDecorations(from, to);
      }
      return Decoration.none;
    }

    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

// State field for paste marker (separate from main highlight, can coexist)
const pasteMarkerField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setPasteMarker)) {
        if (effect.value === null) {
          return Decoration.none;
        }
        const pos = effect.value;
        const docLength = tr.state.doc.length;
        if (pos >= 0 && pos < docLength) {
          return RangeSet.of([pasteMarkerMark.range(pos, pos + 1)]);
        }
        return Decoration.none;
      }
      // Clear paste marker when other highlight effects fire
      if (effect.is(setTargetPosition) || effect.is(setTargetRange)) {
        return Decoration.none;
      }
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

// Theme for target highlights
// Using cyan for navigate and magenta for delete - these contrast well with oneDark syntax colors
export const targetHighlightTheme = EditorView.baseTheme({
  // Navigate highlight (cyan/teal - semi-transparent to keep text readable)
  '.cm-target-highlight': {
    backgroundColor: 'rgba(6, 182, 212, 0.35)',
    outline: '2px solid #06b6d4',
  },
  // Delete highlight (magenta/pink - semi-transparent to keep text readable)
  '.cm-delete-highlight': {
    backgroundColor: 'rgba(236, 72, 153, 0.35)',
    outline: '2px solid #ec4899',
  },
  // Yank highlight (blue - text to yank)
  '.cm-yank-highlight': {
    backgroundColor: 'rgba(59, 130, 246, 0.35)',
    outline: '2px solid #3b82f6',
  },
  // Paste destination highlight (green - where to paste)
  '.cm-paste-highlight': {
    backgroundColor: 'rgba(34, 197, 94, 0.35)',
    outline: '2px solid #22c55e',
    borderLeft: '2px solid #22c55e',
  },
  // Newline indicator gutter (houses both ↵ glyphs and merge bars)
  '.cm-newline-gutter': {
    width: '22px',
    backgroundColor: 'transparent',
  },
  '.cm-newline-gutter .cm-gutterElement': {
    padding: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ↵ glyph shown when a newline is the only highlighted char on the line
  '.cm-newline-glyph': {
    color: '#ec4899',
    backgroundColor: 'rgba(236, 72, 153, 0.25)',
    border: '1px solid rgba(236, 72, 153, 0.6)',
    borderRadius: '3px',
    padding: '0 2px',
    fontSize: '0.8em',
    fontWeight: 'bold',
    fontFamily: 'monospace',
    lineHeight: '1',
  },
  // Merge bar shown on lines that will be joined
  '.cm-merge-line-marker': {
    width: '3px',
    height: '100%',
    backgroundColor: '#ec4899',
    borderRadius: '1px',
  },
});

// Combined extension for easy import
export const targetHighlightExtension = [
  targetHighlightField,
  pasteMarkerField,
  mergeLineState,
  newlineGlyphState,
  newlineIndicatorGutter,
  targetHighlightTheme,
];
