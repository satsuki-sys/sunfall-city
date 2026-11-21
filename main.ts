// Sunfall City — the hand-in program for make.fun's gta6-01 bounty.
// Runtime: Node 22, standard library only.
//
// The game itself sits in the game/ folder next to this file: a low-poly 3D
// open-world crime game that runs entirely offline in a desktop browser.
// three.js is vendored under game/vendor/, and every other file the game
// loads is a hand-written ES module. You play Rook, a courier in a coastal
// city stuck at golden hour: run Marisol's three jobs, steal and drive
// anything on wheels, dodge or outrun the Sunfall PD, work the Taxi Dash,
// hunt down the twelve hidden sun discs, and bank cash between sunsets.
//
// This program does exactly one thing — the hand-in. It copies game/ and
// screenshots/ from beside itself into the output directory and then writes
// dossier.json there, the summary the judge reads, using the vendored
// make.fun library.
//
// To try the game locally: `node serve.ts`, then open http://localhost:8080.
// Away from the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (Node 22 runs this .ts file directly, via its built-in type stripping.)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output'; // the grader's mount

// Copy the playable game into the output directory.
mkdirSync(outDir, { recursive: true });
cpSync(join(rootDir, 'game'), join(outDir, 'game'), { recursive: true });

// Copy the screenshots. The folder itself is expected to exist in the
// output; its contents are optional, so guard the copy on the source.
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(rootDir, 'screenshots'))) {
  cpSync(join(rootDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// Write the dossier. The limits below mirror the scorer's own gate
// (reference/gate.json): text_max_bytes shapes how many bytes are written,
// while the rest make this program refuse anything the scorer would refuse
// anyway — more than 4 screenshots or one larger than 256 KiB, more than
// 993 files or 48 MiB under game/, or a single game/ path over 1000 bytes.
// (game/ is counted next to /output's own 1000-entry cap, which also covers
// its screenshots/ folder and dossier.json.)
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
