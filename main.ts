// Sunfall City — the hand-in. This program copies the game (game/, plain
// static files a desktop browser loads offline) and the screenshots into
// the output directory, then writes dossier.json with the vendored
// make.fun library: the summary the judge reads. Run it the way the kit
// prescribes — `node main.ts` — with MAKEFUN_OUTPUT_DIR standing in for
// /output outside the grader's container. It runs twice and writes the
// same bytes both times: nothing here depends on the clock, the network
// or the order the filesystem returns names in.

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The game first, then the screenshots beside it, exactly as they sit in
// the repository: the dossier is built from what lands in /output, and the
// gate rebuilds it from the same files to compare byte for byte. (The
// screenshots are the maker's own renders of the staged ?shot= scenes;
// shots.json at the root captions each one.)
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps, from the kit's gate: the dossier text is capped,
// and an entry the scorer would refuse (too many screenshots, an oversized
// game tree) is refused here instead of being handed in to fail.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// One line for the human (or agent) watching the run: what was handed in.
const shotCount = existsSync(join(out, 'screenshots'))
  ? readdirSync(join(out, 'screenshots')).length
  : 0;
console.log(`Sunfall City handed in: game/ and ${shotCount} screenshots copied, dossier.json written to ${out}`);
