import { describe, expect, it } from 'vitest';
import { HelloSchema, SOCKET_NAMESPACES } from './index';

describe('HelloSchema', () => {
  it('accepts a valid handshake', () => {
    const parsed = HelloSchema.parse({
      status: 'ok',
      namespace: SOCKET_NAMESPACES.broadcast,
      serverTime: 1,
    });
    expect(parsed.namespace).toBe('/broadcast');
  });

  it('rejects unknown namespaces and malformed payloads', () => {
    expect(HelloSchema.safeParse({ status: 'ok', namespace: '/x', serverTime: 1 }).success).toBe(false);
    expect(HelloSchema.safeParse({ status: 'nope', namespace: '/broadcast', serverTime: 1 }).success).toBe(false);
    expect(HelloSchema.safeParse(null).success).toBe(false);
  });
});
