// Boot: read the URL, build the game, and leave a handle on the window for
// the screenshot stage (and for anyone poking at the game from a console).
// `?seed=` picks the city's seed, `?shot=` stages one of the four
// deterministic scenes named in shots.json.

import { Game } from './world.js';
import { DEFAULT_SEED } from './config.js';

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));

const game = new Game(document.getElementById('app'), {
  seed: Number.isFinite(seedParam) && seedParam > 0 ? Math.floor(seedParam) : DEFAULT_SEED,
  shot: params.get('shot'),
});

window.__game = game;
