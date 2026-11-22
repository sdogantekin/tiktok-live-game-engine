// Rebuilds the Mahalle Halayı GLB assets from their Blender scripts (headless, deterministic).
// Usage: pnpm assets:build        (set BLENDER=/path/to/Blender to override the default macOS location)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const blender = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';
if (!existsSync(blender)) {
  console.error(`Blender not found at ${blender}. Install Blender or set BLENDER=/path/to/Blender.`);
  process.exit(1);
}

const scripts = join(import.meta.dirname, '..', 'assets', 'game-modes', 'mahalle-halayi', 'scripts');
for (const script of ['build_character.py', 'build_crowd.py', 'build_courtyard.py']) {
  const result = spawnSync(blender, ['-b', '--factory-startup', '--python', join(scripts, script)], { encoding: 'utf8' });
  const lines = `${result.stdout}\n${result.stderr}`.split('\n').filter((line) => line.startsWith('[') || /Error|Traceback/.test(line));
  console.log(lines.join('\n'));
  if (result.status !== 0) {
    console.error(`${script} failed (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}
console.log('Assets rebuilt. Run `pnpm test` to validate them against their budgets.');
