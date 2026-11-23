import type { MusicMode, NoteEvent, Score } from './types';

/** Highest arrangement layer: 0 bed, 1 drums, 2 + lead melody, 3 + claps and an octave shadow. */
export const MAX_LAYER = 3;

/** Frequency of a scale degree; degrees past the end of the scale continue into the next octave. */
export function degreeFreq(score: Score, degree: number, octaves = 0): number {
  const size = score.scale.length - 1 || 1; // the last scale entry is the octave
  const octave = Math.floor(degree / size);
  const semitones = score.scale[degree - octave * size]! + 12 * octave;
  return score.rootHz * 2 ** (octaves + semitones / 12);
}

/**
 * The arrangement layer for a group energy (0..1), with hysteresis so the music does not flap while the energy hovers
 * around a threshold: climbing needs `layerUp`, falling back needs the energy to drop below `layerDown`.
 */
export function nextLayer(current: number, energy: number, score: Score): number {
  let layer = current;
  while (layer < MAX_LAYER && energy >= score.layerUp[layer]!) layer++;
  while (layer > 0 && energy < score.layerDown[layer - 1]!) layer--;
  return layer;
}

/** The layer actually played: a calm bed stays at 0, a building beat at 1, the full arrangement follows the energy. */
export function effectiveLayer(mode: MusicMode, energyLayer: number): number {
  if (mode === 'calm') return 0;
  if (mode === 'build') return 1;
  return Math.max(1, energyLayer);
}

/** A melody note starting at `position` of `phrase`: how many steps it lasts (itself plus following holds). */
function melodyNote(phrase: string, position: number): { degree: number; steps: number } | null {
  const ch = phrase[position];
  if (ch === undefined || ch < '0' || ch > '9') return null;
  let steps = 1;
  while (phrase[position + steps] === '-') steps++;
  return { degree: Number(ch), steps };
}

/** What the music plays on one step. Pure: the same (score, step, layer, mode) always gives the same notes. */
export function planStep(score: Score, step: number, layer: number, mode: MusicMode): NoteEvent[] {
  if (mode === 'off') return [];
  const notes: NoteEvent[] = [];
  const length = score.drums.length;
  const position = ((step % length) + length) % length;
  const onBeat = position % score.stepsPerBeat === 0;

  // The drone: one long note per bar, always.
  if (position % score.stepsPerBar === 0) notes.push({ voice: 'drone', freq: score.rootHz, steps: score.stepsPerBar });

  const drum = score.drums[position];
  if (layer === 0) {
    // A quiet bed: only the bass drum on the beat.
    if (onBeat && (drum === 'D' || drum === 'd')) notes.push({ voice: 'bassDrum', velocity: 0.45 });
  } else {
    const velocity = layer >= 2 ? 0.9 : 0.75;
    if (drum === 'D') notes.push({ voice: 'bassDrum', velocity });
    else if (drum === 'd') notes.push({ voice: 'bassDrum', velocity: velocity * 0.55 });
    else if (drum === 't') notes.push({ voice: 'rimDrum', velocity });
    else if (drum === 'k' && layer >= 2) notes.push({ voice: 'rimDrum', velocity: 0.3 });
  }

  if (layer >= 1) {
    // Shaker texture: accents on the beat, soft pulses between (every step from layer 2 up, every other step at layer 1).
    const shake = score.shaker[position];
    if (shake === 'S' || (shake === 's' && (layer >= 2 || position % 2 === 0))) notes.push({ voice: 'shaker', velocity: shake === 'S' ? 0.8 : 0.45 });
    // Rhythmic bass: short plucks that lock to the drum pattern.
    const pluck = score.bass[position];
    if (pluck !== undefined && pluck >= '0' && pluck <= '9') notes.push({ voice: 'bass', freq: degreeFreq(score, Number(pluck), -1), velocity: 0.85 });
  }

  if (layer >= 2) {
    const phrase = score.phrases[Math.floor(step / length) % score.phrases.length]!;
    const note = melodyNote(phrase, position);
    if (note) {
      notes.push({ voice: 'reed', freq: degreeFreq(score, note.degree, score.leadOctaves), steps: note.steps, velocity: 0.8 });
      if (layer >= 3) notes.push({ voice: 'reed', freq: degreeFreq(score, note.degree, score.leadOctaves + 1), steps: note.steps, velocity: 0.2 });
    }
  }
  if (layer >= 3 && score.claps[position] === 'c') notes.push({ voice: 'clap', velocity: 0.6 });
  return notes;
}

/** Score invariants a game's music must meet (checked by tests, so a typo in a pattern cannot ship silently). */
export function validateScore(score: Score): string[] {
  const problems: string[] = [];
  const length = score.drums.length;
  if (length % score.stepsPerBar !== 0) problems.push('drums must be a whole number of bars');
  if (score.claps.length !== length) problems.push('claps must be as long as drums');
  if (!/^[Ddtk.]+$/.test(score.drums)) problems.push('drums may only use D d t k .');
  if (!/^[c.]+$/.test(score.claps)) problems.push('claps may only use c .');
  if (score.shaker.length !== length) problems.push('shaker must be as long as drums');
  if (!/^[Ss.]+$/.test(score.shaker)) problems.push('shaker may only use S s .');
  if (score.bass.length !== length) problems.push('bass must be as long as drums');
  if (!/^[0-9.]+$/.test(score.bass)) problems.push('bass may only use digits .');
  score.phrases.forEach((phrase, i) => {
    if (phrase.length !== length) problems.push(`phrase ${i} must be as long as drums`);
    if (!/^[0-9.-]+$/.test(phrase)) problems.push(`phrase ${i} may only use digits . -`);
    if (phrase.startsWith('-')) problems.push(`phrase ${i} starts with a hold`);
  });
  if (score.layerDown.some((down, i) => down >= score.layerUp[i]!)) problems.push('each layerDown must be below its layerUp');
  return problems;
}
