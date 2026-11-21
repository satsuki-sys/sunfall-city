// Sunfall City — the hand-in program for make.fun's gta6-01 bounty.
//
// The game itself is the static site under game/ (open game/index.html in a
// browser and play; nothing is built and nothing is fetched). This program
// is the courier: it copies game/ and screenshots/ from beside this file
// into the output directory and writes dossier.json there with the kit's
// vendored buildDossier, byte for byte what the scorer recomputes. Outside
// the grader, MAKEFUN_OUTPUT_DIR names the output directory:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Node 22, standard library only — nothing is installed before it runs, and
// two runs over the same tree write the same bytes. (Verified locally by
// running it twice into two directories and diffing the trees.)

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (the kit's reference/gate.json), passed to the
// dossier builder so an entry the scorer would refuse is refused here too:
// at most 4 screenshots of 256 KiB, at most 993 files and 48 MiB under
// game/, no game path over 1000 bytes, dossier text capped at 160 KiB.
const GATE = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function countFiles(dir: string): number {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    n += entry.isDirectory() ? countFiles(join(dir, entry.name)) : 1;
  }
  return n;
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, GATE));

const gameFiles = countFiles(join(out, 'game'));
const shots = existsSync(join(out, 'screenshots'))
  ? readdirSync(join(out, 'screenshots')).length
  : 0;
console.log(`sunfall-city: handed in ${gameFiles} game files and ${shots} screenshots to ${out}`);
