import type { Score } from './types';

/** A small neutral score for the renderer's own tests (the renderer never imports a game's music). */
export const testScore: Score = {
  stepsPerBeat: 2,
  stepsPerBar: 8,
  rootHz: 100,
  leadOctaves: 2,
  scale: [0, 2, 3, 5, 7, 8, 10, 12],
  drums: 'D.tkD.t.D.tkD.tt',
  claps: '.c...c...c...c..',
  shaker: 'S.s.S.s.S.s.S.s.',
  bass: '0.0.0.0.0.0.4.0.',
  phrases: ['4.45.543.2.1.0--', '0.12.3.45.43.2.1', '5.5.6.54.3.2.1.0', '4.54.32.1.0.1.0-'],
  layerUp: [0.12, 0.32, 0.6],
  layerDown: [0.06, 0.2, 0.4],
};
