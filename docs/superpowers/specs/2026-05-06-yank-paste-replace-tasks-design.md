# New Task Types: Yank+Paste and Replace

## Overview

Add two new task types to the vim racing game: yank+paste (duplicate text to a target location) and replace (single/multi-character replacement). Both use buffer-diff validation and extend the vim graph solver for recommended sequences.

## Yank+Paste Task

### Player Experience

Player sees a highlighted substring (yank target) and a highlighted destination position. They yank the substring and paste it at the destination, duplicating the text in the buffer.

### Data Structure

```typescript
interface YankPasteTask {
  id: string;
  type: 'yank_paste';
  description: string; // "Yank the highlighted text and paste it at the marker"
  codeSnippet: string;
  yankRange: { from: number; to: number }; // character offsets of text to yank
  pasteOffset: number; // character offset where paste should appear
  expectedResult: string; // buffer with yanked text duplicated at paste location
  yankedText: string; // the text within yankRange (precomputed for validation)
  recommendedSequence?: string;
  recommendedWeight?: number;
}
```

### Generation

1. Pick a random code snippet, remove empty lines.
2. Select a yank target using existing snippet indices (wordIndices, curlyBraceIndices, etc.) — prefer word-sized or small structural units.
3. Pick a valid paste offset: must be outside the yank range, at a logical position (line start, after a word boundary, etc.).
4. Compute `expectedResult`: insert `yankedText` at `pasteOffset` within the original snippet.
5. Compute recommended sequence via extended graph solver: navigate to yank start, yank motion, navigate to paste location, `p` or `P`.

### Streaming Validation

- Buffer length must be between `codeSnippet.length` and `expectedResult.length` (text can only grow as paste occurs).
- The original text outside the paste insertion point must remain intact — validate that the buffer minus inserted characters is a supersequence check: characters can only be added, never removed or changed.

### Completion Validation

- `player.editorBuffer === task.expectedResult`

## Replace Task

### Player Experience

Player sees highlighted character(s) and the replacement text displayed. They use `r` (single) or `R` (multi) to perform the replacement.

### Data Structure

```typescript
interface ReplaceTask {
  id: string;
  type: 'replace';
  description: string; // "Replace the highlighted character(s)"
  codeSnippet: string;
  targetRange: { from: number; to: number }; // offsets of text to replace
  replacementText: string; // what to type as replacement
  expectedResult: string; // buffer after replacement applied
  originalText: string; // text within targetRange before replacement (precomputed)
  strategy: 'SINGLE' | 'MULTI'; // r vs R mode
  recommendedSequence?: string;
  recommendedWeight?: number;
}
```

### Generation

1. Pick a random code snippet, remove empty lines.
2. Choose strategy: SINGLE or MULTI (random or weighted).
3. **SINGLE**: Pick a random non-whitespace character. Generate a different replacement character (alphanumeric, avoiding confusing substitutions).
4. **MULTI**: Pick a short span (2-5 characters) at a word or identifier boundary. Generate replacement text of equal length (R mode overwrites in-place without changing buffer length).
5. Compute `expectedResult`: snippet with targetRange replaced by replacementText.
6. Compute recommended sequence: navigate to target start, then `r` + char (SINGLE) or `R` + chars + `Esc` (MULTI).

### Streaming Validation

- Buffer length must remain exactly `codeSnippet.length` (replace never adds or removes characters).
- Only characters within `targetRange` may differ from the original snippet. All other positions must match.

### Completion Validation

- `player.editorBuffer === task.expectedResult`

## Graph Solver Extensions

Extend `vimGraph.ts` to model new operations:

### Yank Edges

Yank operations don't modify the buffer but populate a register. The graph needs a state dimension for register contents (empty vs populated).

- `yw` — yank word
- `yy` — yank line
- `y$` — yank to end of line
- `y0` — yank to start of line
- Text-object yanks: `yi{`, `yi(`, `yi[`, `ya"`, etc.

### Paste Edges

Paste inserts register contents at cursor position. Only available when register is populated.

- `p` — paste after cursor
- `P` — paste before cursor

### Replace Edges

- `r` + char — replace single character at cursor (weight: 1 + 1 for the char)
- `R` + chars + `Esc` — enter replace mode, type N chars, escape (weight: 1 + N + 1)

### State Model for Yank+Paste

The solver needs to track: (cursor_position, register_state). For yank+paste tasks:

- Start state: (initial_cursor, empty_register)
- After yank: (cursor_after_yank, register=yankedText)
- After navigate + paste: (final_cursor, register=yankedText), buffer matches expectedResult

This makes the graph 2D (position x register_state) but register_state is binary (empty/full) so it doubles the node count rather than exploding it.

## Task Count and Distribution

Update `NUM_TASKS` or task distribution logic:

- Current: 5 navigate + 5 delete = 10 tasks per race
- Proposed: distribute across 4 types. Suggested split: 3 navigate + 3 delete + 2 yank_paste + 2 replace = 10 tasks. Exact distribution can be tuned.

## Frontend Changes

### Editor Highlighting

- **Yank+Paste**: Highlight the yank range (one color) and the paste destination (different color/marker). Need a new decoration style for "paste here" indicator.
- **Replace**: Highlight the target range and display the replacement text nearby (tooltip, inline ghost text, or side panel).

### Validation Events

- Both new types use the same `sendEditorText(text)` streaming mechanism as delete tasks.
- Completion detection: `editorText === task.expectedResult` (same as delete).

### Task Type Rendering

Frontend needs to handle new task types in the task display component — show appropriate descriptions, highlight the relevant ranges, and display any supplementary info (paste target, replacement text).

## Anti-Cheat Considerations

- Same `MIN_TASK_COMPLETION_MS` (150ms) applies.
- Yank+Paste: player could theoretically type the text manually instead of yanking. Buffer validation can't distinguish this, which is acceptable — they still need to produce the correct result quickly.
- Replace: player could delete and insert instead of using r/R. Same trade-off — acceptable for racing since it's slower than the intended approach.

## Migration / Compatibility

- Add `'yank_paste' | 'replace'` to the `TaskType` union (replace existing unused `'insert' | 'change'`).
- New task interfaces added to `types.ts`.
- `generateRaceTaskBatchesAsync` updated to include new task types.
- Frontend task type definitions updated to mirror backend.
- No database migration needed (tasks are ephemeral, generated per-race).
