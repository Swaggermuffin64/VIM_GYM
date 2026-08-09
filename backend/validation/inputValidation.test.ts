/**
 * Table-driven tests for inputValidation.ts — the XSS/injection barrier for
 * all socket and HTTP user input. These lock down exactly what is accepted:
 * a refactor that silently widens acceptance fails here.
 */
import { describe, expect, it } from 'vitest';
import {
  validatePlayerName,
  validateRoomId,
  validateCursorOffset,
  validateEditorText,
  validateKeystrokeEvents,
  validateBoolean,
  validateOptionalRoomId,
} from './inputValidation.js';

describe('validatePlayerName', () => {
  it.each([
    ['plain name', 'speedster', 'speedster'],
    ['trims whitespace', '  neo  ', 'neo'],
    ['strips HTML-dangerous chars', '<script>bob</script>', 'scriptbob/script'],
    ['strips quotes and backslashes', `a'b"c\\d&e`, 'abcde'],
    ['strips control characters', 'a\x00b\x1Fc\x7Fd', 'abcd'],
    ['truncates to 20 chars', 'x'.repeat(30), 'x'.repeat(20)],
  ])('%s', (_label, input, expected) => {
    const result = validatePlayerName(input);
    expect(result.valid).toBe(true);
    expect(result.value).toBe(expected);
  });

  it.each([
    ['non-string input', 12345],
    ['empty string', ''],
    ['whitespace only', '   '],
    ['only stripped chars', '<>"&'],
  ])('falls back to "Player" for %s', (_label, input) => {
    const result = validatePlayerName(input);
    expect(result.valid).toBe(true);
    expect(result.value).toBe('Player');
  });

  it('rejects profane names instead of sanitizing them', () => {
    const result = validatePlayerName('fuck');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('inappropriate');
  });
});

describe('validateRoomId', () => {
  it('accepts and uppercases 6-char internal codes', () => {
    expect(validateRoomId('abc123')).toEqual({ valid: true, value: 'ABC123' });
    expect(validateRoomId('  XYZ789  ')).toEqual({
      valid: true,
      value: 'XYZ789',
    });
  });

  it('accepts 10-20 char matchmaker ids preserving case', () => {
    const id = 'a1b2c3d4e5f6a1b2';
    expect(validateRoomId(id)).toEqual({ valid: true, value: id });
  });

  it.each([
    ['non-string', 42],
    ['too short', 'abc'],
    ['7 chars (gap between formats)', 'abcd123'],
    ['21 chars (too long)', 'a'.repeat(21)],
    ['special characters', 'abc-12'],
    ['whitespace inside', 'ab c12'],
  ])('rejects %s', (_label, input) => {
    expect(validateRoomId(input).valid).toBe(false);
  });
});

describe('validateCursorOffset', () => {
  it('accepts zero and in-range integers', () => {
    expect(validateCursorOffset(0)).toEqual({ valid: true, value: 0 });
    expect(validateCursorOffset(99999)).toEqual({ valid: true, value: 99999 });
    expect(validateCursorOffset(100000).valid).toBe(true);
  });

  it.each([
    ['string', '5'],
    ['float', 1.5],
    ['negative', -1],
    ['above max', 100001],
    ['NaN', NaN],
  ])('rejects %s', (_label, input) => {
    expect(validateCursorOffset(input).valid).toBe(false);
  });
});

describe('validateEditorText', () => {
  it('accepts strings up to 10000 chars', () => {
    expect(validateEditorText('').valid).toBe(true);
    expect(validateEditorText('x'.repeat(10000)).valid).toBe(true);
  });

  it('rejects non-strings and oversized text', () => {
    expect(validateEditorText(null).valid).toBe(false);
    expect(validateEditorText('x'.repeat(10001)).valid).toBe(false);
  });
});

describe('validateKeystrokeEvents', () => {
  const goodEvent = {
    key: 'j',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    dtMs: 100,
  };

  it('accepts a valid event array and coerces modifier flags to booleans', () => {
    const result = validateKeystrokeEvents([
      { ...goodEvent, altKey: 1, shiftKey: 'yes' },
    ]);
    expect(result.valid).toBe(true);
    expect(result.value![0]).toEqual({
      ...goodEvent,
      altKey: true,
      shiftKey: true,
    });
  });

  it('accepts an empty array', () => {
    expect(validateKeystrokeEvents([]).valid).toBe(true);
  });

  it.each([
    ['non-array', 'not-an-array'],
    ['over 2000 events', Array.from({ length: 2001 }, () => goodEvent)],
    ['null entry', [null]],
    ['missing key', [{ ...goodEvent, key: undefined }]],
    ['empty key', [{ ...goodEvent, key: '' }]],
    ['key over 32 chars', [{ ...goodEvent, key: 'k'.repeat(33) }]],
    ['negative dtMs', [{ ...goodEvent, dtMs: -1 }]],
    ['float dtMs', [{ ...goodEvent, dtMs: 1.5 }]],
    ['dtMs above 10 minutes', [{ ...goodEvent, dtMs: 10 * 60 * 1000 + 1 }]],
  ])('rejects %s', (_label, input) => {
    expect(validateKeystrokeEvents(input).valid).toBe(false);
  });
});

describe('validateBoolean', () => {
  it('coerces truthy/falsy and applies defaults', () => {
    expect(validateBoolean(true)).toEqual({ valid: true, value: true });
    expect(validateBoolean(0)).toEqual({ valid: true, value: false });
    expect(validateBoolean(undefined, true)).toEqual({
      valid: true,
      value: true,
    });
    expect(validateBoolean(null)).toEqual({ valid: true, value: false });
  });
});

describe('validateOptionalRoomId', () => {
  it('treats missing values as valid undefined', () => {
    expect(validateOptionalRoomId(undefined)).toEqual({
      valid: true,
      value: undefined,
    });
    expect(validateOptionalRoomId('')).toEqual({
      valid: true,
      value: undefined,
    });
  });

  it('delegates real values to validateRoomId', () => {
    expect(validateOptionalRoomId('abc123')).toEqual({
      valid: true,
      value: 'ABC123',
    });
    expect(validateOptionalRoomId('bad id!').valid).toBe(false);
  });
});
