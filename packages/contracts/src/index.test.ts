import { describe, expect, it } from 'vitest';
import {
  GameActionSchema,
  HelloSchema,
  NormalizedEventSchema,
  OperatorCommandSchema,
  PresentationEventSchema,
  SOCKET_NAMESPACES,
} from './index';

describe('HelloSchema', () => {
  it('accepts a valid handshake', () => {
    const parsed = HelloSchema.parse({ status: 'ok', namespace: SOCKET_NAMESPACES.broadcast, serverTime: 1 });
    expect(parsed.namespace).toBe('/broadcast');
  });

  it('rejects unknown namespaces and malformed payloads', () => {
    expect(HelloSchema.safeParse({ status: 'ok', namespace: '/x', serverTime: 1 }).success).toBe(false);
    expect(HelloSchema.safeParse({ status: 'nope', namespace: '/broadcast', serverTime: 1 }).success).toBe(false);
    expect(HelloSchema.safeParse(null).success).toBe(false);
  });
});

describe('NormalizedEventSchema', () => {
  const base = { eventId: 'e1', provider: 'simulator', userId: 'u1', displayName: 'Ayşe', receivedAt: 1 };

  it('accepts comment and gift events', () => {
    expect(NormalizedEventSchema.safeParse({ ...base, kind: 'comment.received', payload: { text: 'halay' } }).success).toBe(true);
    expect(
      NormalizedEventSchema.safeParse({ ...base, kind: 'gift.received', payload: { giftKey: 'rose', count: 1 } }).success,
    ).toBe(true);
  });

  it('rejects unknown kinds, missing ids, and bad gift counts', () => {
    expect(NormalizedEventSchema.safeParse({ ...base, kind: 'like.received', payload: {} }).success).toBe(false);
    expect(NormalizedEventSchema.safeParse({ ...base, eventId: '', kind: 'comment.received', payload: { text: 'x' } }).success).toBe(false);
    expect(
      NormalizedEventSchema.safeParse({ ...base, kind: 'gift.received', payload: { giftKey: 'rose', count: 0 } }).success,
    ).toBe(false);
  });
});

describe('OperatorCommandSchema', () => {
  it('accepts valid commands', () => {
    expect(OperatorCommandSchema.safeParse({ type: 'start_game' }).success).toBe(true);
    expect(OperatorCommandSchema.safeParse({ type: 'reassign_player', playerId: 'p', teamId: 'gelin' }).success).toBe(true);
  });

  it('rejects unknown types and missing fields', () => {
    expect(OperatorCommandSchema.safeParse({ type: 'set_score', teamId: 'gelin', score: 99 }).success).toBe(false);
    expect(OperatorCommandSchema.safeParse({ type: 'reassign_player', playerId: 'p' }).success).toBe(false);
  });
});

describe('GameActionSchema / PresentationEventSchema', () => {
  it('validate their discriminated unions', () => {
    expect(GameActionSchema.safeParse({ type: 'command', playerId: 'p', command: 'halay' }).success).toBe(true);
    expect(GameActionSchema.safeParse({ type: 'gift', playerId: null, giftKey: 'rose', count: 1 }).success).toBe(true);
    expect(PresentationEventSchema.safeParse({ type: 'hint', playerId: 'p', reason: 'no_team' }).success).toBe(true);
    expect(PresentationEventSchema.safeParse({ type: 'hint', playerId: 'p', reason: 'other' }).success).toBe(false);
  });
});
