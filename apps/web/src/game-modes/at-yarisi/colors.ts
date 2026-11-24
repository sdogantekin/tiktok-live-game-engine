import { racerColor } from './track';

/**
 * Silks colours chosen to be told apart at a glance on a phone: every racer on the grid gets a different one, in this order. (A colour made
 * from the viewer's id alone could give two neighbours the same shade.) The saddle cloth and the glow take the same colour.
 */
export const SILKS_PALETTE = [
  '#e63946', // red
  '#2f6fdb', // blue
  '#f2b705', // yellow
  '#2fb344', // green
  '#ff7a1a', // orange
  '#8e44ad', // purple
  '#ff4fa3', // pink
  '#17c3d9', // cyan
  '#f4f4f4', // white
  '#26262e', // black
  '#a8e61d', // lime
  '#8a5a3c', // brown
] as const;

/**
 * Who has which colour. A racer keeps the colour it is first given for as long as it stays in the race (it never changes under the viewer's
 * eyes); a colour freed by a racer who left goes to the next newcomer. Plain state outside React, shared by the scene and the overlay.
 */
export class RacerColors {
  private readonly index = new Map<string, number>();

  /** Gives every new racer in `ids` the first free colour, in order, and frees the colours of racers who are gone. */
  sync(ids: readonly string[]): void {
    const present = new Set(ids);
    for (const id of [...this.index.keys()]) if (!present.has(id)) this.index.delete(id);
    const taken = new Set(this.index.values());
    for (const id of ids) {
      if (this.index.has(id)) continue;
      let next = 0;
      while (taken.has(next) && next < SILKS_PALETTE.length) next++;
      this.index.set(id, next);
      taken.add(next);
    }
  }

  /** The colour of a racer; one made from the id if it has not been given one (or if more than twelve race at once). */
  colorOf(id: string): string {
    const slot = this.index.get(id);
    return slot === undefined || slot >= SILKS_PALETTE.length ? racerColor(id) : SILKS_PALETTE[slot]!;
  }
}

export const racerColors = new RacerColors();

let lastSeq = -1;
/** Syncs the shared colours with a race view (once per view, however many parts of the screen ask) and returns them. */
export function colorsFor(view: { seq: number; racers: readonly { id: string }[] } | null): RacerColors {
  if (view && view.seq !== lastSeq) {
    lastSeq = view.seq;
    racerColors.sync(view.racers.map((racer) => racer.id));
  }
  return racerColors;
}
