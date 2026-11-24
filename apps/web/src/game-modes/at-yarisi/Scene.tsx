import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SoundDirector } from '../../game-renderer/audio/SoundDirector';
import { BeatClock } from '../../game-renderer/beat-clock';
import { Boundary } from '../../game-renderer/Boundary';
import { EnergyMeter } from '../../game-renderer/crowd-energy';
import { floatingKey } from '../../game-renderer/name-tags';
import type { SceneProps } from '../../game-renderer/types';
import { type GateState, gateTimeline } from './gate';
import { CHASE_FOV, PIP, pipActive, railCamera, chaseCamera, chaseFor, damp, dampAngle, focusOf, gridCamera, type Subject, WIDE } from './camera';
import { type HorseFrame, Horses } from './Horses';
import { laneOffset, shape } from './scene-config';
import { type RaceFx, RaceEffects } from './RaceEffects';
import { RACE_CUES, soundDesign } from './sound-design';
import { leadingRacers, RAIL_TAG_COUNT, railTags } from './railtags';
import { colorsFor } from './colors';
import { RaceSmoother } from './smoothing';
import { Course } from './Course';
import { HiddenInPip, PipRegistry } from './Pip';
import { Scenery } from './Scenery';
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
  /** How lively the crowd is (0..1), updated every frame from the race. */
  const mood = useRef(0);
  const fx = useRef<RaceFx | null>(null);
  /** The starting gate (stalls, doors, whether it still stands) and whether the leader is on the last lap, for the course. */
  const gate = useRef<GateState>({ stalls: 0, open: 0, up: true });
  const finalLap = useRef(false);
  const startedAt = useRef<number | null>(null);
  /** The small rail-camera view: its camera, the parts it leaves out, and whether it is showing. */
  const pipCamera = useMemo(() => new THREE.PerspectiveCamera(34, PIP.width / PIP.height, 0.5, 700), []);
  const pipHidden = useMemo(() => new PipRegistry(), []);
  const pipOn = useRef(false);
  const pipFocus = useRef(0);
  const pipSize = useMemo(() => new THREE.Vector2(), []);
  const sun = useRef<THREE.DirectionalLight>(null);
  const sunTarget = useRef<THREE.Object3D>(null);
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
        else if (cue.type === 'player_action') {
          energy.bump(TEAM, 0.06, now); // a burst of likes
          tags.emphasize(cue.playerId); // the viewer's own name lights up: their taps landed
        } else if (cue.type === 'celebration' && cue.effect !== RACE_CUES.lastLap && cue.effect !== RACE_CUES.won) {
          energy.bump(TEAM, 0.15, now); // a gift
          if (cue.playerId) tags.emphasize(cue.playerId);
        }
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

    colorsFor(smoother.current); // every racer on the grid has a colour of its own before anything is drawn
    const racers = smoother.step(now, dtMs);
    const stage = smoother.stage;
    frame.current = { racers, stage };
    if (stage === 'racing' && startedAt.current === null) startedAt.current = now;
    if (stage === 'grid' || stage === null) startedAt.current = null;
    gate.current = { stalls: stage === 'grid' || stage === null || startedAt.current === null ? racers.length : gate.current.stalls, ...gateTimeline(startedAt.current === null ? null : (now - startedAt.current) / 1000) };
    clock.tick(now, excitement(now, stage === 'racing')); // before the sound director reads it (it runs later)
    mood.current = excitement(now, stage === 'racing');

    // Moments in the race itself that get a sound: the leader starting the last lap, and the first horse home.
    const view = smoother.current;
    if (stage === 'grid' || stage === null) {
      r.lastLapSounded = false;
      r.winSounded = false;
      finalLap.current = false;
    } else if (view && stage === 'racing') {
      const leader = racers.reduce((best, racer) => Math.max(best, racer.distance), 0);
      finalLap.current = lapOf(leader, view.lapLength, view.laps) === view.laps;
      if (!r.lastLapSounded && view.laps > 1 && lapOf(leader, view.lapLength, view.laps) === view.laps) {
        r.lastLapSounded = true;
        cues.emit({ type: 'celebration', effect: RACE_CUES.lastLap });
      }
    }
    const winnerIndex = racers.findIndex((racer) => racer.place === 1);
    if (stage === 'finished') finalLap.current = true;
    if (!r.winSounded && winnerIndex >= 0) {
      r.winSounded = true;
      cues.emit({ type: 'celebration', effect: RACE_CUES.won });
      const spot = trackPoint(shape, racers[winnerIndex]!.distance, laneOffset(winnerIndex, racers.length));
      fx.current?.burst(spot.x, spot.z); // confetti over the winner
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
    let fov = CHASE_FOV;
    if (subjects.length === 0 || stage === 'grid' || stage === null) {
      target = gridCamera(shape, (now - r.gridSince) / 1000);
    } else {
      const winner = racers.findIndex((racer) => racer.place === 1);
      const focus = stage === 'finished' && winner >= 0 ? { x: subjects[winner]!.x, z: subjects[winner]!.z, heading: subjects[winner]!.heading } : focusOf(subjects, 3)!;
      r.focus = r.focus
        ? { x: damp(r.focus.x, focus.x, 7, dt), z: damp(r.focus.z, focus.z, 7, dt), heading: dampAngle(r.focus.heading, focus.heading, 4, dt) }
        : focus;
      // The last stretch: the camera drops in close and low behind the leaders, and the view tightens.
      const leader = racers.reduce((best, racer) => Math.max(best, racer.distance), 0);
      const chase = chaseFor(view ? view.laps * view.lapLength - leader : Infinity);
      target = chaseCamera(r.focus, stage === 'finished' ? WIDE : chase.tuning);
      fov = stage === 'finished' ? CHASE_FOV : chase.fov;
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
    const camera = state.camera as THREE.PerspectiveCamera;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = damp(camera.fov, fov, 3, dt);
      camera.updateProjectionMatrix();
    }
    state.camera.updateMatrixWorld();

    // The sun's shadow follows the action: its light and target ride along with the camera's focus.
    const light = sun.current;
    const target3 = sunTarget.current;
    if (light && target3) {
      const centre = r.focus ?? trackPoint(shape, 0);
      target3.position.set(centre.x, 0, centre.z);
      light.position.set(centre.x + 26, 55, centre.z + 20);
      light.target.updateMatrixWorld();
    }

    // Name tags follow the horses: the tag layer is told where each one is on the stage every frame.
    const ids = racers.map((racer) => `${racer.id}:${racer.name}`).join('|'); // names too, so a viewer whose name changes is relabelled
    if (ids !== r.ids) {
      r.ids = ids;
      tags.setOccupants(racers.map((racer, i) => ({ slotKey: floatingKey(i), playerId: racer.id, name: racer.name, teamId: TEAM })));
    }
    // The rail camera: while it is showing it keeps pace with the leader, seen side-on from the infield.
    pipOn.current = pipActive(view);
    if (pipOn.current) {
      const firstThree = leadingRacers(racers, RAIL_TAG_COUNT);
      pipFocus.current = firstThree[0]?.distance ?? 0;
      const rail = railCamera(firstThree.map((racer) => racer.distance));
      pipCamera.position.set(...rail.position);
      pipCamera.lookAt(...rail.lookAt);
      // (the field of view is changed through the focal length, which is how three.js lets it be set)
      const fovNow = damp(pipCamera.fov, rail.fov, 4, dt);
      pipCamera.setFocalLength((0.5 * pipCamera.getFilmHeight()) / Math.tan(THREE.MathUtils.degToRad(fovNow) / 2));
      pipCamera.updateMatrixWorld();

      // The names of the first three, over their jockeys: worked out through the rail camera, placed inside its window.
      railTags.current = leadingRacers(racers, RAIL_TAG_COUNT).map((racer, rank) => {
        const index = racers.indexOf(racer);
        const p = trackPoint(shape, racer.distance, laneOffset(index, racers.length));
        r.point.set(p.x, 3.1, p.z).project(pipCamera);
        return { id: racer.id, name: racer.name, rank: rank + 1, x: (r.point.x + 1) / 2, y: (1 - r.point.y) / 2, visible: r.point.z > -1 && r.point.z < 1 && Math.abs(r.point.x) < 1 && Math.abs(r.point.y) < 1 };
      });
    } else if (railTags.current.length > 0) {
      railTags.current = [];
    }

    subjects.forEach((subject, i) => {
      r.point.set(subject.x, TAG_HEIGHT, subject.z).project(state.camera);
      const visible = r.point.z > -1 && r.point.z < 1 && Math.abs(r.point.x) < 1.05 && Math.abs(r.point.y) < 1.05;
      const x = (r.point.x + 1) / 2;
      const y = (1 - r.point.y) / 2;
      tags.setDynamic(floatingKey(i), { small: { x: x + 0.012, y }, big: { x, y: y - 0.04 }, visible });
    });
  }, -2);

  // Drawing is taken over here (a frame callback with a priority above zero does that): the main view, then, when it is showing, the small
  // rail-camera view in its corner of the same canvas, without the crowd, scenery and effects.
  useFrame((state) => {
    const { gl, scene, camera } = state;
    gl.info.autoReset = false; // count both passes together
    gl.info.reset();
    gl.getSize(pipSize);
    gl.setScissorTest(false);
    gl.setViewport(0, 0, pipSize.x, pipSize.y);
    gl.render(scene, camera);
    if (!pipOn.current) return;
    const unit = pipSize.x / 100;
    const w = PIP.width * unit;
    const h = PIP.height * unit;
    const x = pipSize.x - PIP.right * unit - w;
    const y = pipSize.y - PIP.top * unit - h; // three measures y from the bottom
    pipHidden.hide(pipFocus.current, 70);
    gl.setScissorTest(true);
    gl.setViewport(x, y, w, h);
    gl.setScissor(x, y, w, h);
    gl.clearDepth();
    gl.render(scene, pipCamera);
    pipHidden.show();
    gl.setScissorTest(false);
    gl.setViewport(0, 0, pipSize.x, pipSize.y);
  }, 1);

  return (
    <>
      <color attach="background" args={['#a8d4f0']} />
      <fog attach="fog" args={['#a8d4f0', 140, 420]} />
      <hemisphereLight args={['#ffffff', '#6a8a5a', 1.5]} />
      <object3D ref={sunTarget} />
      <directionalLight
        ref={(light) => {
          sun.current = light;
          if (light && sunTarget.current) light.target = sunTarget.current;
        }}
        position={[40, 70, 30]}
        intensity={1.8}
        color="#fff1d6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-camera-near={10}
        shadow-camera-far={140}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
      <Course excitement={mood} gate={gate} finalLap={finalLap} pip={pipHidden} />
      <Boundary label="scenery" fallback={null}>
        <Suspense fallback={null}>
          <HiddenInPip registry={pipHidden}>
            <Scenery />
          </HiddenInPip>
        </Suspense>
      </Boundary>
      <Boundary label="horses" fallback={null}>
        <Suspense fallback={null}>
          <Horses frame={frame} pip={pipHidden} />
          <HiddenInPip registry={pipHidden}>
            <RaceEffects frame={frame} fxRef={fx} />
          </HiddenInPip>
        </Suspense>
      </Boundary>
      {audio && (
        <SoundDirector engine={audio} design={soundDesign} clock={clock} energyOf={(now) => excitement(now, smoother.stage === 'racing')} phase={phase} paused={paused} secondsLeft={secondsLeft} cues={cues} />
      )}
    </>
  );
}
