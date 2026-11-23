import type { Phase } from '@live-game/contracts';
import { normalizeComment } from '../../core/events/comment-normalizer';
import type { GameMode, GiftEffect, LikeEffect, LiveContext, ModeEffect } from '../../core/mode';
import { type AtYarisiConfig, atYarisiConfig, RACE_TEAM_ID, type RaceGift } from './config';
import { RaceSim, seededRandom } from './race';

/** The cheer the crowd gives when someone who is not racing sends a gift. */
const CROWD_CHEER = 'crowd_cheer';

/**
 * At Yarışı: a horse race for viewers. Everyone who types a join word is in the game; the first `capacity` of them race
 * and the rest wait their turn. Likes and gifts help the sender's own horse (both capped, gifts lower), the server runs the
 * race, and the results rank people, not teams.
 */
export function createAtYarisiMode(config: AtYarisiConfig = atYarisiConfig, random: () => number = seededRandom(Date.now())): GameMode {
  // Lookups use Maps keyed by normalized words: comments and gift keys are untrusted, so never index plain objects with them.
  const joinWords = new Set<string>();
  for (const word of Object.keys(config.commands)) {
    const key = normalizeComment(word);
    if (key === null) throw new Error(`Invalid command word: ${word}`);
    joinWords.add(key);
  }
  const gifts = new Map<string, RaceGift>(Object.entries(config.gifts));

  let race = new RaceSim(config.race, random);
  /** Viewers waiting for a place in the next race, first come first served. */
  let waiting: string[] = [];
  let lastPhase: Phase = 'stopped';
  const nameOf = new Map<string, string>();

  const isIn = (id: string) => race.has(id) || waiting.includes(id);

  /** A new race: last race's horses go to the back of the queue (so everyone gets a turn), then the grid fills from the front. */
  function newRace(): void {
    if (race.stage === 'grid') return; // the last race never started (the game was stopped): its grid is still the next one
    const previous = race.standing().map((racer) => racer.id);
    race = new RaceSim(config.race, random);
    waiting = [...waiting, ...previous.filter((id) => !waiting.includes(id))];
  }

  function fillGrid(): void {
    while (race.stage === 'grid' && race.size < config.race.capacity && waiting.length > 0) {
      const id = waiting.shift()!;
      race.add(id, nameOf.get(id) ?? 'viewer');
    }
  }

  return {
    id: 'at-yarisi',
    config,

    handleCommand(ctx, action) {
      const player = ctx.player;
      if (!player || !joinWords.has(action.command)) return [];

      nameOf.set(player.id, player.name);
      const effects: ModeEffect[] = [{ type: 'join_team', teamId: RACE_TEAM_ID }];
      if (isIn(player.id)) return effects;
      if (race.stage === 'grid' && waiting.length === 0 && race.add(player.id, player.name)) return effects;

      waiting.push(player.id);
      if (ctx.tryCooldown('hint')) effects.push({ type: 'present', event: { type: 'hint', playerId: player.id, reason: 'queued' } });
      return effects;
    },

    handleLike(ctx, action): LikeEffect[] {
      if (!race.like(action.playerId, action.count)) return [];
      return ctx.tryCooldown('boostCue') ? [{ type: 'present', event: { type: 'player_action', playerId: action.playerId, animation: 'boost' } }] : [];
    },

    handleGift(ctx, action): GiftEffect[] {
      const gift = gifts.get(action.giftKey);
      if (!gift) return [];
      const player = ctx.player;
      if (player && race.gift(player.id, gift)) return [{ type: 'present', event: { type: 'celebration', effect: gift.effect, playerId: player.id } }];
      // A gift from someone who is not racing (or between races) is a cheer from the stands, and helps nobody.
      return ctx.tryGlobalCooldown('crowdCheer') ? [{ type: 'present', event: { type: 'celebration', effect: CROWD_CHEER } }] : [];
    },

    live: {
      step(dtMs: number, ctx: LiveContext) {
        // Viewers who were removed or ignored leave the race and the queue.
        for (const id of [...race.ids(), ...waiting]) {
          const player = ctx.players.get(id);
          if (!player || player.ignored) {
            race.remove(id);
            waiting = waiting.filter((w) => w !== id);
          } else {
            nameOf.set(id, player.name);
            race.rename(id, player.name);
          }
        }

        const newRound = (ctx.phase === 'lobby' || ctx.phase === 'countdown' || ctx.phase === 'active') && (lastPhase === 'stopped' || lastPhase === 'results');
        if (newRound) newRace();
        lastPhase = ctx.phase;

        fillGrid();
        if (ctx.phase === 'active') race.start();
        if (ctx.isScoring) race.step(dtMs);
        if (ctx.phase === 'results') race.stop(); // time ran out: places follow distance

        if (ctx.phase === 'active' && race.stage === 'finished') return { endRound: true };
      },
      view: () => race.view(waiting.length),
      ranking: () => race.ranking(),
    },
  };
}
