import { describe, expect, it } from 'vitest';
import {
  GameActionSchema,
  LiveViewSchema,
  RoundResultSchema,
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
    expect(OperatorCommandSchema.safeParse({ type: 'set_setting', key: 'laps', value: 3 }).success).toBe(true);
  });

  it('rejects a setting change that is not a whole number or has no key', () => {
    expect(OperatorCommandSchema.safeParse({ type: 'set_setting', key: 'laps', value: 2.5 }).success).toBe(false);
    expect(OperatorCommandSchema.safeParse({ type: 'set_setting', key: '', value: 3 }).success).toBe(false);
    expect(OperatorCommandSchema.safeParse({ type: 'set_setting', key: 'laps', value: '3' }).success).toBe(false);
    expect(OperatorCommandSchema.safeParse({ type: 'set_setting', value: 3 }).success).toBe(false);
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

describe('likes, live views and rankings', () => {
  const base = { eventId: 'e1', provider: 'tiktok', userId: 'u', displayName: 'n', receivedAt: 1 };

  it('accepts a like event with a sensible count and rejects the rest', () => {
    expect(NormalizedEventSchema.safeParse({ ...base, kind: 'like.received', payload: { count: 25 } }).success).toBe(true);
    for (const count of [0, -1, 1.5, 10_001, '3', null, undefined]) {
      expect(NormalizedEventSchema.safeParse({ ...base, kind: 'like.received', payload: { count } }).success).toBe(false);
    }
  });

  it('knows a like action for a game', () => {
    expect(GameActionSchema.safeParse({ type: 'like', playerId: 'p', count: 3 }).success).toBe(true);
    expect(GameActionSchema.safeParse({ type: 'like', playerId: 'p', count: 0 }).success).toBe(false);
  });

  const racer = { id: 'p', name: 'Ayşe', distance: 120.5, speed: 17, boost: 0.4, place: null, finishTime: null };
  const race = { kind: 'race', seq: 3, serverNow: 5, stage: 'racing', laps: 6, lapLength: 400, racers: [racer], waiting: 2, capacity: 10 };

  it('parses a race view and rejects malformed ones', () => {
    expect(LiveViewSchema.safeParse(race).success).toBe(true);
    for (const bad of [
      { ...race, kind: 'bingo' },
      { ...race, stage: 'sleeping' },
      { ...race, racers: Array.from({ length: 33 }, () => racer) },
      { ...race, racers: [{ ...racer, boost: 2 }] },
      { ...race, racers: [{ ...racer, distance: -1 }] },
      { ...race, racers: [{ ...racer, place: 0 }] },
      { ...race, racers: [{ ...racer, finishTime: -1 }] },
      { ...race, racers: [{ id: 'p', name: 'A', distance: 1, speed: 1, boost: 0, place: null }] }, // a racer must say whether it has finished
      { ...race, laps: 0 },
      null,
      'race',
    ]) {
      expect(LiveViewSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('keeps the ranking in a round result optional', () => {
    const result = { round: 1, winner: null, teams: [] };
    expect(RoundResultSchema.safeParse(result).success).toBe(true);
    expect(RoundResultSchema.safeParse({ ...result, ranking: [{ place: 1, playerId: 'p', name: 'A' }] }).success).toBe(true);
    expect(RoundResultSchema.safeParse({ ...result, ranking: [{ place: 0, playerId: 'p', name: 'A' }] }).success).toBe(false);
  });
});
