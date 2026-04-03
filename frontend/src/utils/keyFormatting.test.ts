import { describe, expect, it } from 'vitest';
import {
  expandRecommendedSequence,
  formatKeyLabel,
  formatKeysForDisplay,
  formatTaskTypeLabel,
} from './keyFormatting';

describe('formatKeyLabel', () => {
  it('maps special keys to display labels', () => {
    expect(formatKeyLabel(' ')).toBe('Space');
    expect(formatKeyLabel('Backspace')).toBe('←');
    expect(formatKeyLabel('Escape')).toBe('Esc');
    expect(formatKeyLabel('Meta')).toBeNull();
  });

  it('passes through ordinary keys', () => {
    expect(formatKeyLabel('j')).toBe('j');
  });
});

describe('formatTaskTypeLabel', () => {
  it('returns human-readable task labels', () => {
    expect(formatTaskTypeLabel('navigate')).toBe('Navigate');
    expect(formatTaskTypeLabel('delete')).toBe('Delete');
  });
});

describe('expandRecommendedSequence', () => {
  it('splits composite vim tokens into single-key steps', () => {
    expect(expandRecommendedSequence(['jj', 'fk'])).toEqual([
      'j',
      'j',
      'f',
      'k',
    ]);
  });
});

describe('formatKeysForDisplay', () => {
  it('joins digit runs into repeat counts', () => {
    expect(formatKeysForDisplay(['3', 'j'])).toBe('3 j');
  });

  it('does not merge a leading digit after f/F/t/T', () => {
    expect(formatKeysForDisplay(['f', '3'])).toBe('f 3');
  });
});
