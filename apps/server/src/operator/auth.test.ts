import { describe, expect, it } from 'vitest';
import { generateOperatorToken, isValidOperatorToken } from './auth';

describe('operator token', () => {
  it('generates distinct, sufficiently long tokens', () => {
    const a = generateOperatorToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(generateOperatorToken()).not.toBe(a);
  });

  it('accepts only the exact token', () => {
    expect(isValidOperatorToken('secret-token', 'secret-token')).toBe(true);
    expect(isValidOperatorToken('secret-token ', 'secret-token')).toBe(false);
    expect(isValidOperatorToken('Secret-token', 'secret-token')).toBe(false);
    expect(isValidOperatorToken('secret', 'secret-token')).toBe(false);
  });

  it('rejects missing, non-string and oversized input without throwing', () => {
    for (const bad of [undefined, null, 42, {}, [], '', 'x'.repeat(1000)]) {
      expect(isValidOperatorToken(bad, 'secret-token')).toBe(false);
    }
  });
});
