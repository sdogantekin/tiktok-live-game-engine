import { normalizeComment } from '../../core/events/comment-normalizer';
import type { GameMode, GiftEffect, ModeEffect } from '../../core/mode';
import { type TakiCommandConfig, type TakiGiftConfig, type TakiTakmaConfig, takiTakmaConfig } from './config';

/** Takı Takma Töreni: guests of both sides pin takı on the couple; the more generous side wins. */
export function createTakiTakmaMode(config: TakiTakmaConfig = takiTakmaConfig): GameMode {
  const teamIds = new Set(config.teams.map((team) => team.id));

  // Maps keyed by normalized words: comments and gift keys are untrusted, so never index plain objects with them.
  const commands = new Map<string, TakiCommandConfig>();
  for (const [word, command] of Object.entries(config.commands)) {
    const key = normalizeComment(word);
    if (key === null) throw new Error(`Invalid command word: ${word}`);
    if (command.behavior.kind === 'join' && !teamIds.has(command.behavior.teamId)) {
      throw new Error(`Command ${word} joins unknown team ${command.behavior.teamId}`);
    }
    commands.set(key, command);
  }
  const gifts = new Map<string, TakiGiftConfig>(Object.entries(config.gifts));

  return {
    id: 'taki-takma',
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
      const act = (animation: string): ModeEffect => ({ type: 'present', event: { type: 'player_action', playerId: player.id, animation } });

      if (behavior.kind === 'applaud') return ctx.tryCooldown('visual') ? [act(behavior.animation)] : [];

      // Pinning: in a scoring round the pin and its point go together under one cooldown; outside a round it is only for show.
      if (ctx.isScoring) return ctx.tryCooldown('score') ? [act(behavior.animation), { type: 'score', points: behavior.points }] : [];
      return ctx.tryCooldown('visual') ? [act(behavior.animation)] : [];
    },

    handleGift(ctx, action): GiftEffect[] {
      const gift = gifts.get(action.giftKey);
      if (!gift) return [];

      // The points are never held back by the visual cooldown; the engine adds them only for a joined player in a scoring round.
      const effects: GiftEffect[] = [{ type: 'score', points: gift.points }];
      if (!gift.globalCooldown || ctx.tryGlobalCooldown(gift.globalCooldown)) {
        effects.push({
          type: 'present',
          event: ctx.player ? { type: 'celebration', effect: gift.item, playerId: ctx.player.id } : { type: 'celebration', effect: gift.item },
        });
      }
      return effects;
    },
  };
}
