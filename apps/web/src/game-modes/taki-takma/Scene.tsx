import { useFrame } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { Avatars } from '../../game-renderer/Avatars';
import { BeatClock } from '../../game-renderer/beat-clock';
import { Boundary } from '../../game-renderer/Boundary';
import { SlotsStore } from '../../game-renderer/avatar-store';
import { Crowd } from '../../game-renderer/Crowd';
import { EnergyMeter } from '../../game-renderer/crowd-energy';
import { EffectDirector } from '../../game-renderer/effect-director';
import { Effects } from '../../game-renderer/Effects';
import { SoundDirector } from '../../game-renderer/audio/SoundDirector';
import { perf, perfParam } from '../../game-renderer/perf';
import { type SlotOccupant, slotKey } from '../../game-renderer/name-tags';
import type { SceneProps } from '../../game-renderer/types';
import { Ceremony } from './Ceremony';
import { CarriedGold, Guests } from './Guests';
import { GoldPieces } from './gold';
import { Hall, Lighting } from './Hall';
import { soundDesign } from './sound-design';
import { animationRules, AVATAR_CAP, CROWD_CAPACITY, effectRecipes, figuresOf, formation, ITEM_SIZES, looks, MILESTONE_EVERY, TEAM_IDS } from './scene-config';
import { milestonesPassed, ReactionGate, Reactions, Trips } from './trips';

const TEAMS: readonly string[] = TEAM_IDS;
const TEAM_COLORS = { gelin: '#e0457b', damat: '#2f6fdb' };

/** Takı Takma Töreni's 3D scene: the hall, the couple and parents, two queues of guests, and the gold. */
export function Scene({ roster, teams, cues, tags, audio, phase, paused, secondsLeft }: SceneProps) {
  const avatarCap = perfParam('cap') ?? AVATAR_CAP;
  const crowdCapacity = perfParam('crowd') ?? CROWD_CAPACITY;
  const store = useMemo(() => new SlotsStore({ teamIds: TEAMS, capTotal: avatarCap, formation, animations: animationRules, arrangement: 'queue' }), [avatarCap]);
  const director = useMemo(() => new EffectDirector(effectRecipes), []);
  const energy = useMemo(() => new EnergyMeter(), []);
  const clock = useMemo(() => new BeatClock(), []);
  const trips = useMemo(() => new Trips(), []);
  const reactions = useMemo(() => new Reactions(), []);
  const gate = useMemo(() => new ReactionGate(1500), []);
  const gold = useMemo(() => new GoldPieces(), []);
  const teamOf = useRef(new Map<string, string | null>());
  const nameOf = useRef(new Map<string, string>());
  const lastScores = useRef<Record<string, number>>({});

  const syncTags = useCallback(() => {
    const occupants: SlotOccupant[] = [];
    for (const teamId of TEAMS) {
      store.slots.slots(teamId).forEach((playerId, index) => {
        occupants.push({ slotKey: slotKey(teamId, index), playerId, name: playerId ? (nameOf.current.get(playerId) ?? '') : '', teamId });
      });
    }
    tags.setOccupants(occupants);
  }, [store, tags]);

  useEffect(() => {
    teamOf.current = new Map(roster.map((entry) => [entry.id, entry.teamId]));
    nameOf.current = new Map(roster.map((entry) => [entry.id, entry.name]));
    store.setRoster(roster);
    trips.keepOnly(new Set(roster.map((entry) => entry.id)));
    syncTags();
  }, [roster, store, trips, syncTags]);

  /** The couple and parents of a side react: a nod and a clap for each takı, a bow, tears and cheers for the big moments. */
  const react = useCallback(
    (side: string, big: boolean, now: number) => {
      for (const figure of figuresOf(side)) {
        if (!gate.allow(`${figure.id}:${big ? 'big' : 'small'}`, now)) continue;
        if (!big) reactions.fire(figure.id, 'flourish', now);
        else reactions.fire(figure.id, figure.role === 'mother' ? 'special' : figure.role === 'father' ? 'jump' : 'special', now);
      }
    },
    [gate, reactions],
  );

  useEffect(
    () =>
      cues.subscribe((cue) => {
        const now = performance.now();
        perf.cuesReceived++;
        store.handleCue(cue, now);
        syncTags();
        if ('playerId' in cue && cue.playerId && cue.type !== 'chat') tags.emphasize(cue.playerId);
        if (cue.type === 'chat') tags.say(cue.playerId, cue.text);
        director.handle(cue, now);
        if (cue.type === 'player_action') {
          const teamId = teamOf.current.get(cue.playerId);
          if (teamId) {
            energy.bump(teamId, 0.12, now);
            if (cue.animation === 'pin') react(teamId, false, now);
          }
        } else if (cue.type === 'crowd') {
          energy.bump(cue.teamId, Math.min(1, cue.actions * 0.03), now);
        }
      }),
    [cues, store, director, energy, syncTags, tags, react],
  );

  useEffect(
    () =>
      director.subscribe((start) => {
        const size = ITEM_SIZES[start.effect];
        if (size && start.playerId) trips.announce(start.playerId, size); // before the walk starts: it carries this gift's takı
        store.handleEffect(start);
        const side = start.playerId ? teamOf.current.get(start.playerId) : null;
        if (side && size && size >= 3) react(side, true, start.at); // a necklace set or a house key moves the whole family
      }),
    [director, store, trips, react],
  );

  // Every 25 points a side collects: a takı shower over the hall, and that side's family is moved.
  const scores = useMemo(() => Object.fromEntries(teams.map((team) => [team.id, team.score ?? 0])), [teams]);
  useEffect(() => {
    const now = performance.now();
    for (const teamId of TEAMS) {
      const after = scores[teamId] ?? 0;
      if (milestonesPassed(lastScores.current[teamId] ?? 0, after, MILESTONE_EVERY) > 0 && phase === 'active') {
        director.handle({ type: 'celebration', effect: 'taki_yagmuru' }, now);
        react(teamId, true, now);
      }
      lastScores.current[teamId] = after;
    }
  }, [scores, phase, director, react]);


  useFrame(() => {
    const now = performance.now();
    clock.tick(now, Math.max(...TEAMS.map((teamId) => energy.get(teamId, now))));
    store.setMotion({ offset: [0, 0, 0], heading: [0, 1], beats: clock.beats, bpm: clock.bpm });
  }, -2);

  useFrame(() => {
    perf.avatarsVisible = TEAMS.reduce((sum, teamId) => sum + store.slots.visibleCount(teamId), 0);
  });

  const primitiveAvatars = <Avatars store={store} teamIds={TEAMS} looks={looks} />;
  const goldCount = TEAMS.length * store.slots.slots(TEAMS[0]!).length;

  return (
    <>
      <Lighting />
      <Hall scores={scores} colors={TEAM_COLORS} />
      <Boundary label="ceremony" fallback={null}>
        <Suspense fallback={null}>
          <Ceremony reactions={reactions} />
        </Suspense>
      </Boundary>
      <Boundary label="guests" fallback={primitiveAvatars}>
        <Suspense fallback={primitiveAvatars}>
          <Guests store={store} trips={trips} gold={gold} />
        </Suspense>
      </Boundary>
      <CarriedGold gold={gold} count={goldCount} />
      <Crowd teamIds={TEAMS} teams={teams} capacityPerTeam={crowdCapacity} store={store} formation={formation} energy={energy} looks={looks} />
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
