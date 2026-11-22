import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Avatars } from '../../game-renderer/Avatars';
import { SlotsStore } from '../../game-renderer/avatar-store';
import { Crowd } from '../../game-renderer/Crowd';
import { EnergyMeter } from '../../game-renderer/crowd-energy';
import { EffectDirector } from '../../game-renderer/effect-director';
import { Effects } from '../../game-renderer/Effects';
import { perf } from '../../game-renderer/perf';
import type { SceneProps } from '../../game-renderer/types';
import { Courtyard } from './Courtyard';
import { AVATAR_CAP, CROWD_CAPACITY, effectRecipes, formation, looks, TEAM_IDS } from './scene-config';

const TEAMS: readonly string[] = TEAM_IDS;

/** Mahalle Halayı's 3D scene: the courtyard, the halay lines, the crowd, and celebration effects. */
export function Scene({ roster, teams, cues }: SceneProps) {
  const store = useMemo(() => new SlotsStore({ teamIds: TEAMS, capTotal: AVATAR_CAP, formation }), []);
  const director = useMemo(() => new EffectDirector(effectRecipes), []);
  const energy = useMemo(() => new EnergyMeter(), []);
  const teamOf = useRef(new Map<string, string | null>());

  useEffect(() => {
    teamOf.current = new Map(roster.map((entry) => [entry.id, entry.teamId]));
    store.setRoster(roster);
  }, [roster, store]);

  useEffect(
    () =>
      cues.subscribe((cue) => {
        const now = performance.now();
        perf.cuesReceived++;
        store.handleCue(cue, now);
        director.handle(cue, now);
        if (cue.type === 'player_action') {
          const teamId = teamOf.current.get(cue.playerId);
          if (teamId) energy.bump(teamId, 0.12, now);
        } else if (cue.type === 'crowd') {
          energy.bump(cue.teamId, Math.min(1, cue.actions * 0.03), now);
        }
      }),
    [cues, store, director, energy],
  );

  useEffect(() => director.subscribe((start) => store.handleEffect(start)), [director, store]);

  useFrame(() => {
    perf.avatarsVisible = TEAMS.reduce((sum, teamId) => sum + store.slots.visibleCount(teamId), 0);
  });

  return (
    <>
      <Courtyard director={director} />
      <Avatars store={store} teamIds={TEAMS} looks={looks} />
      <Crowd teamIds={TEAMS} teams={teams} capacityPerTeam={CROWD_CAPACITY} store={store} formation={formation} energy={energy} looks={looks} />
      <Effects director={director} store={store} />
    </>
  );
}
