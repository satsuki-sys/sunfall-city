// main.js — the boot. It builds the game, wires the menu buttons, pauses
// when the pointer unlocks mid-play, and runs the frame loop. With a
// ?shot= parameter it stages one of the screenshot scenes instead of the
// title screen.

import { Game } from './world.js';
import { stageShot } from './shots.js';
import { showScreen } from './hud.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 7) || 7;
const shot = params.get('shot');

const game = new Game(document.getElementById('app'), seed);
window.__game = game;

const byId = (id) => document.getElementById(id);

if (shot) {
  stageShot(game, shot);
  showScreen(null);
} else {
  showScreen('title-screen');
  if (game.hasSave) byId('btn-continue').style.display = 'inline-block';
  byId('btn-play').addEventListener('click', () => { game.audio.unlock(); game.startNewGame(); });
  byId('btn-continue').addEventListener('click', () => { game.audio.unlock(); game.startContinue(); });
  byId('btn-resume').addEventListener('click', () => game.resumeGame());
  byId('btn-quit-title').addEventListener('click', () => {
    game.state = 'title';
    showScreen('title-screen');
    if (game.hasSave) byId('btn-continue').style.display = 'inline-block';
  });
  byId('btn-respawn').addEventListener('click', () => game.respawn());
  game.renderer.domElement.addEventListener('click', () => {
    if (game.state === 'playing' && document.pointerLockElement !== game.renderer.domElement) game.lockPointer();
  });
  // Losing the pointer mid-play (Esc, most likely) pauses — but give the
  // lock a moment to settle after starting, so the churn of the first
  // click never trips it.
  let lockHeldAt = 0;
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === game.renderer.domElement) lockHeldAt = performance.now();
    else if (game.state === 'playing' && performance.now() - lockHeldAt > 1200) game.pauseGame();
  });
}

// Frame loop. The step is clamped at both ends: a negative or huge step
// after a stall would turn the camera's smoothing into a catapult.
const clock = { last: performance.now() };
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - clock.last) / 1000));
  clock.last = now;
  game.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
