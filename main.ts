// Sunfall City — hand-in program for the gta6-01 bounty (Node 22, stdlib only).
//
// The game itself lives in this directory's game/ folder: a low-poly 3D open-world
// crime game that runs fully offline in a desktop browser. three.js is vendored
// under game/vendor/; every other file is a hand-written ES module. You play Rook,
// a courier in a sun-soaked coastal city: run Marisol's three jobs, steal and drive
// anything with wheels, dodge or outrun the Sunfall PD, work the Taxi Dash, and
// bank cash between sunsets.
//
// This program's only job is the hand-in: copy game/ and screenshots/ from beside
// this file into the output directory, then write dossier.json there — the summary
// the judge reads — using the vendored make.fun library.
//
// Try the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output'; // the grader's mount point

// --- Copy the playable game -------------------------------------------------
mkdirSync(outDir, { recursive: true });
cpSync(join(rootDir, 'game'), join(outDir, 'game'), { recursive: true });

// --- Copy the screenshots (the folder is expected, its contents optional) ---
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(rootDir, 'screenshots'))) {
  cpSync(join(rootDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// --- Write the dossier --------------------------------------------------------
// The caps below come from the scorer's own gate (reference/gate.json): only
// text_max_bytes shapes the bytes written; the rest refuse an entry the scorer
// itself would refuse — more than 4 screenshots or one over 256 KiB, more than
// 993 files or 48 MiB in game/, or a path under game/ over 1000 bytes. (game/
// counts beside /output's own 1000-entry cap, its screenshots/ and dossier.json.)
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
