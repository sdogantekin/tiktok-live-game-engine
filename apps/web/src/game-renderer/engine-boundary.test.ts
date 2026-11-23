import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The shared engine code must not know any one game. A game's words, teams and animations live in its own folder
 * (`game-modes/<game>/` on the web, `game-modes/<game>/` on the server) and reach the engine as data and contracts.
 */
const REPO = new URL('../../../../', import.meta.url).pathname;
const SHARED = ['apps/web/src/game-renderer', 'apps/web/src/operator', 'apps/web/src/broadcast', 'apps/web/src/realtime', 'apps/server/src/core', 'apps/server/src/realtime', 'apps/server/src/operator'];
const GAME_WORDS = /halay|gelin|damat|z[ıi]pla|mahalle|mend[ıi]l|kuşatma|kusatma/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('engine boundary', () => {
  it('keeps game-specific words out of the shared engine code', () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const dir of SHARED) {
      for (const file of sourceFiles(join(REPO, dir))) {
        scanned++;
        const code = withoutComments(readFileSync(file, 'utf8'));
        if (GAME_WORDS.test(code)) offenders.push(relative(REPO, file));
      }
    }
    expect(scanned).toBeGreaterThan(30); // the scan really covered the shared folders
    expect(offenders).toEqual([]);
  });
});
