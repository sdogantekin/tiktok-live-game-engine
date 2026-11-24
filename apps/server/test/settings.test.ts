import { describe, expect, it } from 'vitest';
import { createAtYarisiMode } from '../src/game-modes/at-yarisi/rules';
import { seededRandom } from '../src/game-modes/at-yarisi/race';
import { createMahalleHalayiMode } from '../src/game-modes/mahalle-halayi/rules';
import type { GameMode } from '../src/core/mode';
import { createTestEngine } from './helpers';

/** A game with one declared setting, recording what the engine hands it. */
function gameWithSetting() {
  const applied: Record<string, number>[] = [];
  const base = createMahalleHalayiMode();
  const mode: GameMode = {
    ...base,
    config: { ...base.config, settings: [{ key: 'size', label: 'Size', min: 2, max: 9, default: 5 }] },
    applySettings: (values) => applied.push({ ...values }),
  };
  return { mode, applied };
}

describe('game settings', () => {
  it('start at their defaults and are published with the HUD; a game without settings publishes none', () => {
    const { mode } = gameWithSetting();
    expect(createTestEngine({ mode }).engine.state.hud().settings).toEqual({
      defs: [{ key: 'size', label: 'Size', min: 2, max: 9, default: 5 }],
      values: { size: 5 },
    });
    expect(createTestEngine().engine.state.hud().settings).toEqual({ defs: [], values: {} });
  });

  it('are changed by the operator within their limits and handed to the game', () => {
    const { mode, applied } = gameWithSetting();
    const { engine } = createTestEngine({ mode });
    expect(engine.operator({ type: 'set_setting', key: 'size', value: 7 })).toEqual({ ok: true });
    expect(engine.state.hud().settings.values).toEqual({ size: 7 });
    expect(applied).toEqual([{ size: 7 }]);
  });

  it('refuse an unknown key, a value outside the limits, a non-integer, and a change that changes nothing', () => {
    const { mode, applied } = gameWithSetting();
    const { engine } = createTestEngine({ mode });
    expect(engine.operator({ type: 'set_setting', key: 'nope', value: 3 })).toEqual({ ok: false, reason: 'unknown_setting' });
    expect(engine.operator({ type: 'set_setting', key: 'size', value: 1 })).toEqual({ ok: false, reason: 'invalid_value' });
    expect(engine.operator({ type: 'set_setting', key: 'size', value: 10 })).toEqual({ ok: false, reason: 'invalid_value' });
    expect(engine.operator({ type: 'set_setting', key: 'size', value: 2.5 }).ok).toBe(false);
    expect(engine.operator({ type: 'set_setting', key: 'size', value: 5 })).toEqual({ ok: false, reason: 'nothing_to_change' });
    expect(applied).toEqual([]);
  });

  it('cannot change while a round is active, but can before it starts (countdown included) and after it', () => {
    const { mode } = gameWithSetting();
    const { engine, startActiveRound } = createTestEngine({ mode });
    expect(engine.operator({ type: 'set_setting', key: 'size', value: 3 })).toEqual({ ok: true }); // stopped
    engine.operator({ type: 'start_game' });
    expect(engine.operator({ type: 'set_setting', key: 'size', value: 4 })).toEqual({ ok: true }); // before the round (lobby or countdown)
    startActiveRound();
    expect(engine.state.hud().phase).toBe('active');
    expect(engine.operator({ type: 'set_setting', key: 'size', value: 6 })).toEqual({ ok: false, reason: 'round_running' });
    expect(engine.state.hud().settings.values).toEqual({ size: 4 });
    engine.operator({ type: 'end_round' });
    expect(engine.operator({ type: 'set_setting', key: 'size', value: 6 })).toEqual({ ok: true }); // results
  });

  it('go back to the new game\'s defaults when the game is switched', () => {
    const { mode } = gameWithSetting();
    const { engine } = createTestEngine({ mode, modes: () => createMahalleHalayiMode() });
    engine.operator({ type: 'set_setting', key: 'size', value: 8 });
    engine.operator({ type: 'select_game', modeId: 'mahalle-halayi' });
    expect(engine.state.hud().settings).toEqual({ defs: [], values: {} });
  });

  it('are refused for a game that declares none', () => {
    const { engine } = createTestEngine();
    expect(engine.operator({ type: 'set_setting', key: 'size', value: 3 })).toEqual({ ok: false, reason: 'unknown_setting' });
  });
});

describe('the laps setting of the horse race', () => {
  const lapsOf = (engine: ReturnType<typeof createTestEngine>['engine']) => {
    const view = engine.liveView();
    return view?.kind === 'race' ? view.laps : -1;
  };

  it('declares laps within what a round can hold, defaulting to 6', () => {
    const { engine } = createTestEngine({ mode: createAtYarisiMode(undefined, seededRandom(1)) });
    expect(engine.state.hud().settings.defs).toEqual([{ key: 'laps', label: 'Laps', min: 1, max: 8, default: 6 }]);
    expect(engine.state.hud().settings.values).toEqual({ laps: 6 });
  });

  it('changes the laps of the race that has not started yet, and of the next ones', () => {
    const { engine, say, clock } = createTestEngine({ mode: createAtYarisiMode(undefined, seededRandom(1)) });
    engine.operator({ type: 'start_game' });
    say('a', '1');
    engine.step();
    expect(lapsOf(engine)).toBe(6);

    expect(engine.operator({ type: 'set_setting', key: 'laps', value: 2 })).toEqual({ ok: true });
    engine.step();
    expect(lapsOf(engine)).toBe(2); // the grid was still filling, so this race takes it

    engine.operator({ type: 'start_round' });
    clock.advance(20_000); // past the countdown
    engine.tick();
    engine.step();
    expect(engine.operator({ type: 'set_setting', key: 'laps', value: 5 }).ok).toBe(false); // a race is on
    expect(lapsOf(engine)).toBe(2);
  });
});
