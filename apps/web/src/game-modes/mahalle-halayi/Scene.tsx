import { useFrame } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { Avatars } from '../../game-renderer/Avatars';
import { BeatClock } from '../../game-renderer/beat-clock';
import { Boundary } from '../../game-renderer/Boundary';
import { ModelAvatars } from '../../game-renderer/ModelAvatars';
import { SlotsStore } from '../../game-renderer/avatar-store';
import { Crowd } from '../../game-renderer/Crowd';
import { EnergyMeter } from '../../game-renderer/crowd-energy';
import { EffectDirector } from '../../game-renderer/effect-director';
import { Effects } from '../../game-renderer/Effects';
import { SoundDirector } from '../../game-renderer/audio/SoundDirector';
import { perf, perfParam } from '../../game-renderer/perf';
import { type SlotOccupant, slotKey } from '../../game-renderer/name-tags';
import type { SceneProps } from '../../game-renderer/types';
import { Lighting, PrimitiveCourtyard } from './Courtyard';
import { ModelCourtyard } from './ModelCourtyard';
import { ModelCrowd } from './ModelCrowd';
import { Performers } from './Performers';
import { soundDesign } from './sound-design';
import { animationRules, AVATAR_CAP, avatarModels, CROWD_CAPACITY, effectRecipes, formation, lineMotion, looks, TEAM_IDS } from './scene-config';

const TEAMS: readonly string[] = TEAM_IDS;

/** Mahalle Halayı's 3D scene: the courtyard, the halay lines, the crowd, and celebration effects. */
export function Scene({ roster, teams, cues, tags, audio, phase, paused, secondsLeft }: SceneProps) {
  // `?perf=1&cap=..&crowd=..` overrides, for performance sweeps only.
  const avatarCap = perfParam('cap') ?? AVATAR_CAP;
  const crowdCapacity = perfParam('crowd') ?? CROWD_CAPACITY;
  const store = useMemo(() => new SlotsStore({ teamIds: TEAMS, capTotal: avatarCap, formation, animations: animationRules }), [avatarCap]);
  const director = useMemo(() => new EffectDirector(effectRecipes), []);
  const energy = useMemo(() => new EnergyMeter(), []);
  const clock = useMemo(() => new BeatClock(), []);
  const teamOf = useRef(new Map<string, string | null>());
  const nameOf = useRef(new Map<string, string>());

  /** Tells the name-tag layer which player currently stands in each avatar slot. */
  const syncTags = useCallback(() => {
    const occupants: SlotOccupant[] = [];
    for (const teamId of TEAMS) {
      store.slots.slots(teamId).forEach((playerId, index) => {
        occupants.push({ slotKey: slotKey(teamId, index), playerId, name: playerId ? (nameOf.current.get(playerId) ?? '') : '', teamId, leader: store.slots.isLeaderSlot(teamId, index) });
      });
    }
    tags.setOccupants(occupants);
  }, [store, tags]);

  useEffect(() => {
    teamOf.current = new Map(roster.map((entry) => [entry.id, entry.teamId]));
    nameOf.current = new Map(roster.map((entry) => [entry.id, entry.name]));
    store.setRoster(roster);
    syncTags();
  }, [roster, store, syncTags]);

  useEffect(
    () =>
      cues.subscribe((cue) => {
        const now = performance.now();
        perf.cuesReceived++;
        store.handleCue(cue, now);
        syncTags(); // an active player may just have been given an avatar
        if ('playerId' in cue && cue.playerId) tags.emphasize(cue.playerId);
        director.handle(cue, now);
        if (cue.type === 'player_action') {
          const teamId = teamOf.current.get(cue.playerId);
          if (teamId) energy.bump(teamId, 0.12, now);
        } else if (cue.type === 'crowd') {
          energy.bump(cue.teamId, Math.min(1, cue.actions * 0.03), now);
        }
      }),
    [cues, store, director, energy, syncTags, tags],
  );

  useEffect(() => director.subscribe((start) => store.handleEffect(start)), [director, store]);

  // One shared beat for the lines, the couple, the musicians and the crowd; its tempo follows the group energy.
  // Runs before everything that reads it (negative priority sorts first and does not take over rendering).
  useFrame(() => {
    const now = performance.now();
    clock.tick(now, Math.max(...TEAMS.map((teamId) => energy.get(teamId, now))));
    const motion = lineMotion(clock.beats, clock.bpm);
    store.setMotion(motion);
    tags.setTravel(motion.offset);
  }, -2);

  useFrame(() => {
    perf.avatarsVisible = TEAMS.reduce((sum, teamId) => sum + store.slots.visibleCount(teamId), 0);
  });

  // Modelled assets load asynchronously; the primitive versions show meanwhile and stay if loading fails.
  const primitiveAvatars = <Avatars store={store} teamIds={TEAMS} looks={looks} />;
  const crowdProps = { teamIds: TEAMS, teams, capacityPerTeam: crowdCapacity, store, formation, energy, looks };

  return (
    <>
      <Lighting />
      <Boundary label="courtyard" fallback={<PrimitiveCourtyard director={director} />}>
        <Suspense fallback={<PrimitiveCourtyard director={director} />}>
          <ModelCourtyard />
        </Suspense>
      </Boundary>
      <Boundary label="avatars" fallback={primitiveAvatars}>
        <Suspense fallback={primitiveAvatars}>
          <ModelAvatars store={store} teamIds={TEAMS} models={avatarModels} />
        </Suspense>
      </Boundary>
      <Boundary label="performers" fallback={null}>
        <Suspense fallback={null}>
          <Performers store={store} />
        </Suspense>
      </Boundary>
      <Boundary label="crowd" fallback={<Crowd {...crowdProps} />}>
        <Suspense fallback={<Crowd {...crowdProps} />}>
          <ModelCrowd {...crowdProps} />
        </Suspense>
      </Boundary>
      <Effects director={director} store={store} />
      {audio && (
        <SoundDirector
          engine={audio}
          design={soundDesign}
          clock={clock}
          energyOf={(now) => Math.max(...TEAMS.map((teamId) => energy.get(teamId, now)))}
          phase={phase}
          paused={paused}
          secondsLeft={secondsLeft}
          cues={cues}
        />
      )}
    </>
  );
}
