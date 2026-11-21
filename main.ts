// Sunfall City — the hand-in program for make.fun's gta6-01 bounty.
//
// The game itself is the static `game/` folder beside this file: plain files
// a desktop browser opens offline, no build step, no network. This program
// does the handing in — it copies `game/` and `screenshots/` into the
// output directory and writes `dossier.json`, the summary the judge reads,
// using the kit's vendored library so the bytes match the scorer's own
// rebuild exactly.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts'; // the kit's dossier contract

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The caps are the scorer's own (the kit's gate.json): only text_max_bytes
// shapes the dossier's bytes; the rest simply refuse, here first, an entry
// the scorer would refuse anyway — too many screenshots, an oversized game.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
