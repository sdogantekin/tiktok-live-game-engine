import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SoundDirector } from '../../game-renderer/audio/SoundDirector';
import { BeatClock } from '../../game-renderer/beat-clock';
import { Boundary } from '../../game-renderer/Boundary';
import { EnergyMeter } from '../../game-renderer/crowd-energy';
import { floatingKey } from '../../game-renderer/name-tags';
import type { SceneProps } from '../../game-renderer/types';
import { CHASE, chaseCamera, damp, dampAngle, focusOf, gridCamera, type Subject, WIDE } from './camera';
import { type HorseFrame, Horses } from './Horses';
import { laneOffset, shape } from './scene-config';
import { RACE_CUES, soundDesign } from './sound-design';
import { RaceSmoother } from './smoothing';
import { Course } from './Course';
import { lapOf, trackPoint } from './track';

const TEAM = 'yarisci';
const TAG_HEIGHT = 3.0;

/**
 * At Yarışı's 3D scene: the course, the horses with their jockeys, and a camera that follows the leaders. The server's race
 * views (about ten a second) are eased into smooth motion; nothing here decides anything.
 */
export function Scene({ live, tags, cues, audio, phase, paused, secondsLeft }: SceneProps) {
  const smoother = useMemo(() => new RaceSmoother(), []);
  const clock = useMemo(() => new BeatClock(), []);
  const energy = useMemo(() => new EnergyMeter(), []);
  /** How excited the race is, 0..1: a baseline while it runs, plus what viewers just did. It sets the music's tempo and build. */
  const excitement = (now: number, racing: boolean) => Math.min(1, (racing ? 0.3 : 0) + energy.get(TEAM, now));
  const frame = useRef<HorseFrame>({ racers: [], stage: null });
  const rig = useRef({
    last: 0, // set on the first frame
    gridSince: 0,
    previousStage: null as HorseFrame['stage'],
    focus: null as { x: number; z: number; heading: number } | null,
    position: new THREE.Vector3(),
    look: new THREE.Vector3(),
    ready: false,
    ids: '',
    point: new THREE.Vector3(),
    lastLapSounded: false,
    winSounded: false,
  });

  // The newest race view goes to the smoother; viewers' comments become speech bubbles over their horse.
  useEffect(() => {
    const take = () => {
      const view = live.latest();
      if (view?.kind === 'race') smoother.push(view, performance.now());
    };
    take();
    return live.subscribe(take);
  }, [live, smoother]);
  useEffect(
    () =>
      cues.subscribe((cue) => {
        const now = performance.now();
        if (cue.type === 'chat') tags.say(cue.playerId, cue.text);
        else if (cue.type === 'player_action') energy.bump(TEAM, 0.06, now); // a burst of likes
        else if (cue.type === 'celebration' && cue.effect !== RACE_CUES.lastLap && cue.effect !== RACE_CUES.won) energy.bump(TEAM, 0.15, now); // a gift
      }),
    [cues, tags, energy],
  );

  useFrame((state) => {
    const now = performance.now();
    const r = rig.current;
    if (r.last === 0) {
      r.last = now;
      r.gridSince = now;
    }
    const dtMs = Math.min(100, now - r.last);
    r.last = now;
    const dt = dtMs / 1000;

    const racers = smoother.step(now, dtMs);
    const stage = smoother.stage;
    frame.current = { racers, stage };
    clock.tick(now, excitement(now, stage === 'racing')); // before the sound director reads it (it runs later)

    // Moments in the race itself that get a sound: the leader starting the last lap, and the first horse home.
    const view = smoother.current;
    if (stage === 'grid' || stage === null) {
      r.lastLapSounded = false;
      r.winSounded = false;
    } else if (view && stage === 'racing') {
      const leader = racers.reduce((best, racer) => Math.max(best, racer.distance), 0);
      if (!r.lastLapSounded && view.laps > 1 && lapOf(leader, view.lapLength, view.laps) === view.laps) {
        r.lastLapSounded = true;
        cues.emit({ type: 'celebration', effect: RACE_CUES.lastLap });
      }
    }
    if (!r.winSounded && racers.some((racer) => racer.place === 1)) {
      r.winSounded = true;
      cues.emit({ type: 'celebration', effect: RACE_CUES.won });
    }
    if (stage !== r.previousStage) {
      if (stage === 'grid' || stage === null) r.gridSince = now;
      r.previousStage = stage;
    }

    // Where every horse is on the ground, for the camera and the name tags.
    const subjects: (Subject & { id: string })[] = racers.map((racer, i) => {
      const p = trackPoint(shape, racer.distance, laneOffset(i, racers.length));
      return { id: racer.id, x: p.x, z: p.z, heading: p.heading, distance: racer.distance };
    });

    // The camera: an arc round the grid before the start, then a chase behind the leaders, then a wider view on the winner.
    let target;
    if (subjects.length === 0 || stage === 'grid' || stage === null) {
      target = gridCamera(shape, (now - r.gridSince) / 1000);
    } else {
      const winner = racers.findIndex((racer) => racer.place === 1);
      const focus = stage === 'finished' && winner >= 0 ? { x: subjects[winner]!.x, z: subjects[winner]!.z, heading: subjects[winner]!.heading } : focusOf(subjects, 3)!;
      r.focus = r.focus
        ? { x: damp(r.focus.x, focus.x, 7, dt), z: damp(r.focus.z, focus.z, 7, dt), heading: dampAngle(r.focus.heading, focus.heading, 4, dt) }
        : focus;
      target = chaseCamera(r.focus, stage === 'finished' ? WIDE : CHASE);
    }
    if (stage === 'grid' || stage === null) r.focus = null;
    if (!r.ready) {
      r.position.set(...target.position);
      r.look.set(...target.lookAt);
      r.ready = true;
    } else {
      const lambda = 5;
      r.position.set(damp(r.position.x, target.position[0], lambda, dt), damp(r.position.y, target.position[1], lambda, dt), damp(r.position.z, target.position[2], lambda, dt));
      r.look.set(damp(r.look.x, target.lookAt[0], lambda, dt), damp(r.look.y, target.lookAt[1], lambda, dt), damp(r.look.z, target.lookAt[2], lambda, dt));
    }
    state.camera.position.copy(r.position);
    state.camera.lookAt(r.look);
    state.camera.updateMatrixWorld();

    // Name tags follow the horses: the tag layer is told where each one is on the stage every frame.
    const ids = racers.map((racer) => racer.id).join('|');
    if (ids !== r.ids) {
      r.ids = ids;
      tags.setOccupants(racers.map((racer, i) => ({ slotKey: floatingKey(i), playerId: racer.id, name: racer.name, teamId: TEAM })));
    }
    subjects.forEach((subject, i) => {
      r.point.set(subject.x, TAG_HEIGHT, subject.z).project(state.camera);
      const visible = r.point.z > -1 && r.point.z < 1 && Math.abs(r.point.x) < 1.05 && Math.abs(r.point.y) < 1.05;
      const x = (r.point.x + 1) / 2;
      const y = (1 - r.point.y) / 2;
      tags.setDynamic(floatingKey(i), { small: { x: x + 0.012, y }, big: { x, y: y - 0.04 }, visible });
    });
  }, -2);

  return (
    <>
      <color attach="background" args={['#a8d4f0']} />
      <fog attach="fog" args={['#a8d4f0', 140, 420]} />
      <hemisphereLight args={['#ffffff', '#6a8a5a', 1.5]} />
      <directionalLight position={[40, 70, 30]} intensity={1.8} color="#fff1d6" />
      <Course />
      <Boundary label="horses" fallback={null}>
        <Suspense fallback={null}>
          <Horses frame={frame} />
        </Suspense>
      </Boundary>
      {audio && (
        <SoundDirector engine={audio} design={soundDesign} clock={clock} energyOf={(now) => excitement(now, smoother.stage === 'racing')} phase={phase} paused={paused} secondsLeft={secondsLeft} cues={cues} />
      )}
    </>
  );
}
