import { describe, expect, it } from 'vitest';
import { MAX_COMMENT_LENGTH, normalizeComment } from './comment-normalizer';

describe('Turkish locale support', () => {
  it('has ICU tr casing available', () => {
    expect('I'.toLocaleLowerCase('tr')).toBe('ı');
    expect('İ'.toLocaleLowerCase('tr')).toBe('i');
  });
});

describe('normalizeComment', () => {
  it.each([
    ['halay', 'halay'],
    ['HALAY', 'halay'],
    ['Halay', 'halay'],
    ['  halay  ', 'halay'],
    ['zıpla', 'zipla'],
    ['ZIPLA', 'zipla'],
    ['Zıpla', 'zipla'],
    ['zipla', 'zipla'],
    ['İ', 'i'],
    ['I', 'i'],
    ['ı', 'i'],
    ['oyna', 'oyna'],
    ['OYNA', 'oyna'],
    ['gelin', 'gelin'],
    ['GELİN', 'gelin'],
    ['Damat', 'damat'],
    ['şğüöç', 'sguoc'],
    ['ŞĞÜÖÇ', 'sguoc'],
  ])('maps %j to %j', (input, expected) => {
    expect(normalizeComment(input)).toBe(expected);
  });

  it('collapses internal whitespace and newlines', () => {
    expect(normalizeComment('ha\nlay')).toBe('ha lay');
    expect(normalizeComment('  ha   lay ')).toBe('ha lay');
  });

  it('strips zero-width and bidi characters so injection cannot create or hide matches', () => {
    expect(normalizeComment('ha​lay')).toBe('halay');
    expect(normalizeComment('‮halay‬')).toBe('halay');
    expect(normalizeComment('​​')).toBeNull();
  });

  it('does not make sentences or punctuation look like commands', () => {
    expect(normalizeComment('halay!')).toBe('halay!');
    expect(normalizeComment('halay halay')).toBe('halay halay');
    expect(normalizeComment('ben halay yapıyorum')).toBe('ben halay yapiyorum');
  });

  it('returns null for empty or over-long input', () => {
    expect(normalizeComment('')).toBeNull();
    expect(normalizeComment('   ')).toBeNull();
    expect(normalizeComment('a'.repeat(MAX_COMMENT_LENGTH))).toBe('a'.repeat(MAX_COMMENT_LENGTH));
    expect(normalizeComment('a'.repeat(MAX_COMMENT_LENGTH + 1))).toBeNull();
    expect(normalizeComment('x'.repeat(5000))).toBeNull();
  });

  it('is idempotent', () => {
    for (const input of ['ZIPLA', 'Zıpla', 'GELİN', 'halay!']) {
      const once = normalizeComment(input)!;
      expect(normalizeComment(once)).toBe(once);
    }
  });
});
