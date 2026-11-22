import { describe, expect, it } from 'vitest';
import { MAX_DISPLAY_NAME_GRAPHEMES, sanitizeDisplayName } from './display-name';

describe('sanitizeDisplayName', () => {
  it('keeps normal names, including Turkish characters', () => {
    expect(sanitizeDisplayName('Ayşe Yılmaz')).toBe('Ayşe Yılmaz');
  });

  it('trims, collapses whitespace and strips control/invisible characters', () => {
    expect(sanitizeDisplayName('  Ali \n\t Veli  ')).toBe('Ali Veli');
    expect(sanitizeDisplayName('Al​i‮')).toBe('Ali');
  });

  it('truncates by grapheme, not UTF-16 unit', () => {
    const name = sanitizeDisplayName('👨‍👩‍👧'.repeat(40));
    expect(Array.from(new Intl.Segmenter().segment(name))).toHaveLength(MAX_DISPLAY_NAME_GRAPHEMES);
    expect(sanitizeDisplayName('x'.repeat(100))).toHaveLength(MAX_DISPLAY_NAME_GRAPHEMES);
  });

  it('limits stacked combining marks', () => {
    const zalgo = `a${'́'.repeat(50)}`;
    expect(sanitizeDisplayName(zalgo).length).toBeLessThanOrEqual(3);
  });

  it('falls back when nothing printable remains', () => {
    expect(sanitizeDisplayName('')).toBe('Viewer');
    expect(sanitizeDisplayName('​ \n')).toBe('Viewer');
    expect(sanitizeDisplayName('', 'Misafir')).toBe('Misafir');
  });

  it('does not crash on very large input', () => {
    expect(sanitizeDisplayName('a'.repeat(1_000_000))).toHaveLength(MAX_DISPLAY_NAME_GRAPHEMES);
  });
});
