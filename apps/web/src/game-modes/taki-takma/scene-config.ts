import type { AnimationRules, AnimKind, AvatarLook, AvatarModels, CameraConfig, EffectRecipe, Formation, Vec3 } from '../../game-renderer/types';
import { MODEL_URLS } from './assets.manifest';
import { TRIP_MS } from './trips';

/** Everything visual about the Takı Takma Töreni scene that is data. */
export const TEAM_IDS = ['gelin', 'damat'] as const;

/** Guests walking up to the couple are individually animated; the rest of each side stands behind as a crowd. */
export const AVATAR_CAP = 24;
export const CROWD_CAPACITY = 24;

export const SIDE: Readonly<Record<string, -1 | 1>> = { gelin: -1, damat: 1 };

/** Each side's guests queue in a row facing the couple; slot 0 is the front of the queue. */
const QUEUE_X = 2.5;
const QUEUE_FRONT_Z = -2.4;
const QUEUE_GAP = 0.78;
export const FACING_COUPLE = Math.PI; // rotationY 0 faces +z (the camera), so the guests face the other way

/** The couple stand on a low podium at the far end of the hall; the parents stand beside them. */
export const COUPLE_Z = -5.7;
export const PODIUM_HEIGHT = 0.18;
const COUPLE_X = 1.05;

export const formation: Formation = {
  avatar(teamId, index) {
    const side = SIDE[teamId] ?? 1;
    return { position: [side * QUEUE_X, 0, QUEUE_FRONT_Z + index * QUEUE_GAP], rotationY: FACING_COUPLE };
  },
  crowd(teamId, index) {
    const side = SIDE[teamId] ?? 1;
    const row = index % 8;
    const col = Math.floor(index / 8);
    const x = side * (4.1 + col * 0.8);
    const z = -2.2 + row * 1.0;
    return { position: [x, 0, z], rotationY: Math.atan2(-x, COUPLE_Z - z) };
  },
};

/** Where a guest stands to pin a takı: in front of their own side's person (bride for gelin, groom for damat). */
export function pinSpot(teamId: string, index: number): Vec3 {
  const side = SIDE[teamId] ?? 1;
  return [side * COUPLE_X + ((index % 3) - 1) * 0.32, 0, COUPLE_Z + 1.15];
}

export const looks: Readonly<Record<string, AvatarLook>> = {
  gelin: { bodyColor: '#e0457b', headColor: '#f1c9a5', accessory: 'cone', accessoryColor: '#ffffff' },
  damat: { bodyColor: '#2f6fdb', headColor: '#e8bd98', accessory: 'cylinder', accessoryColor: '#b3261e' },
};

export const camera: CameraConfig = { position: [0, 26, 12.5], lookAt: [0, 0, -1.1], fov: 52 };

/** The guests: they stand, walk up to the couple (`special` plays the pin), clap (`flourish`), and hop for big gifts. */
export const guestModels: AvatarModels = {
  urls: { gelin: MODEL_URLS.characters.guestGelinWoman, damat: MODEL_URLS.characters.guestDamatWoman },
  clips: { idle: 'idle', flourish: 'clap', jump: 'jump', spin: 'clap', wiggle: 'clap', hop: 'jump', special: 'pin' },
  looping: ['idle', 'walk'],
};
export const GUEST_WALK = 'walk';

/** Each side's guests come in two kinds, in evening dress and in a suit; the queue alternates them (woman first). */
export const GUEST_VARIANTS: Readonly<Record<string, readonly [woman: string, man: string]>> = {
  gelin: [MODEL_URLS.characters.guestGelinWoman, MODEL_URLS.characters.guestGelinMan],
  damat: [MODEL_URLS.characters.guestDamatWoman, MODEL_URLS.characters.guestDamatMan],
};
export const guestVariantIndex = (slotIndex: number) => slotIndex % 2;

const reacting = (urls: Record<string, string>, clips: { nod: string; big: string; cheer: string }): AvatarModels => ({
  urls,
  clips: { idle: 'idle', flourish: clips.nod, jump: clips.cheer, spin: clips.nod, wiggle: clips.nod, hop: clips.cheer, special: clips.big },
  looping: ['idle'],
});

export interface Figure {
  id: string;
  /** Which side this figure belongs to (their reactions follow that side's guests). */
  side: 'gelin' | 'damat';
  role: 'couple' | 'mother' | 'father';
  url: string;
  models: AvatarModels;
  position: Vec3;
  rotationY: number;
  scale: number;
}

const lift = (x: number, z: number): Vec3 => [x, PODIUM_HEIGHT, z];
const coupleModels = (url: string) => reacting({ only: url }, { nod: 'receive', big: 'thank', cheer: 'clap' });
const parentModels = (url: string) => reacting({ only: url }, { nod: 'clap', big: 'wipe_tears', cheer: 'cheer' });

/** The bride and groom, and the mother and father of each side. The parents turn slightly towards the couple. */
export const figures: readonly Figure[] = [
  { id: 'bride', side: 'gelin', role: 'couple', url: MODEL_URLS.characters.bride, models: coupleModels(MODEL_URLS.characters.bride), position: lift(-COUPLE_X, COUPLE_Z), rotationY: 0, scale: 1.25 },
  { id: 'groom', side: 'damat', role: 'couple', url: MODEL_URLS.characters.groom, models: coupleModels(MODEL_URLS.characters.groom), position: lift(COUPLE_X, COUPLE_Z), rotationY: 0, scale: 1.25 },
  { id: 'anne-gelin', side: 'gelin', role: 'mother', url: MODEL_URLS.characters.anneGelin, models: parentModels(MODEL_URLS.characters.anneGelin), position: lift(-2.55, COUPLE_Z), rotationY: 0.25, scale: 1.1 },
  { id: 'baba-gelin', side: 'gelin', role: 'father', url: MODEL_URLS.characters.babaGelin, models: parentModels(MODEL_URLS.characters.babaGelin), position: lift(-3.55, COUPLE_Z), rotationY: 0.3, scale: 1.1 },
  { id: 'anne-damat', side: 'damat', role: 'mother', url: MODEL_URLS.characters.anneDamat, models: parentModels(MODEL_URLS.characters.anneDamat), position: lift(2.55, COUPLE_Z), rotationY: -0.25, scale: 1.1 },
  { id: 'baba-damat', side: 'damat', role: 'father', url: MODEL_URLS.characters.babaDamat, models: parentModels(MODEL_URLS.characters.babaDamat), position: lift(3.55, COUPLE_Z), rotationY: -0.3, scale: 1.1 },
];

export const figuresOf = (side: string) => figures.filter((figure) => figure.side === side);

/** Every 25 points a side collects, the hall celebrates with a takı shower. */
export const MILESTONE_EVERY = 25;
/** The meter on the hall's back wall counts as full at this many points (it stays full beyond). */
export const METER_FULL_AT = 100;

/** How big the takı is that a guest carries up, by the gift that sent them (a plain `tak` is 1). */
export const ITEM_SIZES: Readonly<Record<string, number>> = { bilezik: 2, kolye_seti: 3.4, ev_anahtari: 4 };

const GOLD = ['#ffd35a', '#ffe9a0', '#fff6d0', '#e6a93a'] as const;

export const effectRecipes: Readonly<Record<string, EffectRecipe>> = {
  bilezik: {
    durationMs: 1500,
    maxConcurrent: 6,
    maxQueued: 0,
    confetti: { count: 40, colors: GOLD, origin: 'player', spread: 1.4, lift: 5 },
    rings: { count: 1, color: '#ffd35a', origin: 'player' },
    avatars: 'spin-player',
  },
  kolye_seti: {
    durationMs: 2500,
    maxConcurrent: 2,
    maxQueued: 2,
    confetti: { count: 120, colors: GOLD, origin: 'center', spread: 4, lift: 8 },
    rings: { count: 2, color: '#ffd35a', origin: 'center' },
    avatars: 'spin-player',
  },
  ev_anahtari: {
    durationMs: 4500,
    maxConcurrent: 1,
    maxQueued: 3,
    confetti: { count: 300, colors: [...GOLD, '#ffffff', '#e0457b', '#2f6fdb'], origin: 'center', spread: 6.5, lift: 11 },
    rings: { count: 3, color: '#ffffff', origin: 'center' },
    avatars: 'spin-player',
  },
  // The hall's own celebration when a side passes a milestone: a shower of gold over the whole hall.
  taki_yagmuru: {
    durationMs: 3000,
    maxConcurrent: 1,
    maxQueued: 1,
    confetti: { count: 220, colors: GOLD, origin: 'center', spread: 5.5, lift: 12 },
    rings: { count: 2, color: '#ffd35a', origin: 'center' },
  },
};

/** What the viewers' words make a guest do: `tak` is the walk to the couple (`special`), `alkış` applause. */
export const animationRules: AnimationRules = {
  durations: { flourish: 1100, jump: 750, spin: 1100, wiggle: 1100, hop: 750, special: TRIP_MS },
  forAction(animation): AnimKind {
    return animation === 'pin' ? 'special' : 'flourish';
  },
};
