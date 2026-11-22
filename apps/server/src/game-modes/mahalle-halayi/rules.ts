import { normalizeComment } from '../../core/events/comment-normalizer';
import type { GameMode, GiftEffect, ModeEffect } from '../../core/mode';
import {
  type GiftConfig,
  type MahalleCommandConfig,
  type MahalleHalayiConfig,
  mahalleHalayiConfig,
} from './config';

export function createMahalleHalayiMode(config: MahalleHalayiConfig = mahalleHalayiConfig): GameMode {
  const teamIds = new Set(config.teams.map((team) => team.id));

  // Lookups use Maps keyed by normalized words: gift keys and comments are untrusted, so never index plain objects with them.
  const commands = new Map<string, MahalleCommandConfig>();
  for (const [word, command] of Object.entries(config.commands)) {
    const key = normalizeComment(word);
    if (key === null) throw new Error(`Invalid command word: ${word}`);
    if (command.behavior.kind === 'join' && !teamIds.has(command.behavior.teamId)) {
      throw new Error(`Command ${word} joins unknown team ${command.behavior.teamId}`);
    }
    commands.set(key, command);
  }
  const gifts = new Map<string, GiftConfig>(Object.entries(config.gifts));

  return {
    id: 'mahalle-halayi',
    config,

    handleCommand(ctx, action) {
      const command = commands.get(action.command);
      const player = ctx.player;
      if (!command || !player) return [];

      const { behavior } = command;
      if (behavior.kind === 'join') return [{ type: 'join_team', teamId: behavior.teamId }];

      if (player.teamId === null) {
        return ctx.tryCooldown('hint')
          ? [{ type: 'present', event: { type: 'hint', playerId: player.id, reason: 'no_team' } }]
          : [];
      }
      if (!ctx.tryCooldown('visual')) return [];

      const effects: ModeEffect[] = [
        { type: 'present', event: { type: 'player_action', playerId: player.id, animation: behavior.animation } },
      ];
      // The animation always plays; energy needs an active round and an elapsed score cooldown.
      if (behavior.points > 0 && ctx.isScoring && ctx.tryCooldown('score')) {
        effects.push({ type: 'score', points: behavior.points });
      }
      return effects;
    },

    handleGift(ctx, action): GiftEffect[] {
      const gift = gifts.get(action.giftKey);
      if (!gift) return [];
      if (gift.globalCooldown && !ctx.tryGlobalCooldown(gift.globalCooldown)) return [];

      const playerId = gift.target === 'sender' && ctx.player ? ctx.player.id : undefined;
      return [
        {
          type: 'present',
          event: playerId
            ? { type: 'celebration', effect: gift.effect, playerId }
            : { type: 'celebration', effect: gift.effect },
        },
      ];
    },
  };
}
