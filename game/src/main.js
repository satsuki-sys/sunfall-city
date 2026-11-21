// main.js — the boot file. index.html loads this module; it reads the query
// string (a seed for the city, a shot name for the screenshot stagings),
// builds the Game, wires the menu buttons to it, shows the title screen,
// and publishes the game as window.__game for the play-test rig. Everything
// else lives in world.js and its specialists.

import { Game } from './world.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 7) || 7;
const shot = params.get('shot');

const game = new Game(document.getElementById('app'), seed);
window.__game = game;

game.hud.onNewGame = () => game.startGame(true);
game.hud.onContinue = () => game.startGame(false);
game.hud.onResume = () => game.resumeGame();
game.hud.onRespawn = () => game.respawn();
game.hud.showTitle(game.hasSave);

if (shot) stageShot(game, shot);
