import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateOperatorToken(): string {
  return randomBytes(16).toString('hex');
}

/** Constant-time comparison of a client-supplied token against the configured one. */
export function isValidOperatorToken(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string' || provided.length === 0 || provided.length > 256) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
