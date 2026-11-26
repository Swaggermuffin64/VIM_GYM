/**
 * Shared look of the bento profile tiles: the card surface, the 13px uppercase
 * section label and the 13px meta text. Every tile in this folder builds on
 * these so the page reads as one system; the page grid (Task 8) owns spans
 * and uses TILE_GAP between tiles.
 */
import type React from 'react';
import { colors } from '../../theme';

/** Pixel gap between tiles in the bento grid. */
export const TILE_GAP = 10;

/**
 * A bento card: flat surface, thin border, rounded. Tiles never set grid
 * spans, but they fill their grid cell's full height so neighbouring tiles in
 * a row end on the same line instead of leaving empty space below.
 */
export const tile: React.CSSProperties = {
  height: '100%',
  background: colors.bgCard,
  border: `1px solid ${colors.border}`,
  borderRadius: '14px',
  padding: '16px',
  boxSizing: 'border-box',
  fontSize: '15px',
  color: colors.textPrimary,
};

/** Uppercase label naming a tile ("Activity", "Trophy case"). */
export const sectionLabel: React.CSSProperties = {
  margin: 0,
  fontSize: '13px',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  fontWeight: 700,
  color: colors.textSecondary,
};

/** Secondary text: sublabels, dates, captions. Never smaller than 13px. */
export const meta: React.CSSProperties = {
  margin: 0,
  fontSize: '13px',
  color: colors.textMuted,
};
