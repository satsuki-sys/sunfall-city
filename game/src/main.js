// Boot and screens: the title, the pause menu and the downed/busted end
// screen. The city itself belongs to world.js; this module wires the
// menus, the pointer lock and the frame loop — and, when the URL carries
// a ?shot= parameter, stages the scenes the entry's screenshots are
// rendered from.

import { Game } from './world.js';
import { loadSave, clearSave } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const seed = Number(params.get('seed') ?? 7) || 7;

const byId = (id) => document.getElementById(id);
const titleScreen = byId('title-screen');
const pauseScreen = byId('pause-screen');
const endScreen = byId('end-screen');
let endKind = 'downed';
let lockHeldAt = 0;

const game = new Game(byId('app'), {
  shot,
  seed,
  onEnd(kind) {
    endKind = kind;
    document.exitPointerLock?.();
    byId('end-title').textContent = kind === 'busted' ? 'BUSTED' : 'DOWNED';
    byId('end-text').textContent = kind === 'busted'
      ? 'Sunfall PD walks you to the steps. The fine stings more than the cuffs.'
      : 'You wake up outside Sunfall General. The city kept your dignity; the hospital kept a fee.';
    endScreen.style.display = 'flex';
  },
});

window.__game = game; // the staging/debug handle the screenshot rig reads

function lockPointer() {
  game.renderer.domElement.requestPointerLock?.();
}

// Losing the pointer lock mid-play (Esc, most likely) means pause — but
// only once the lock has genuinely been held for a moment, so the brief
// lock churn while a game starts can never trip it.
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === game.renderer.domElement) lockHeldAt = performance.now();
  else if (game.state === 'playing' && !shot && performance.now() - lockHeldAt > 1200) pauseGame();
});

function startPlaying(fresh) {
  if (fresh) {
    clearSave();
    game.missions.restore(0);
    game.missions.restoreDiscs([]);
    game.cash = 60;
    game.stats.taxiFares = 0;
  }
  titleScreen.style.display = 'none';
  endScreen.style.display = 'none';
  game.startGame();
  lockPointer();
}

/** Fill the pause screen's tally line: cash, fares, discs, story stage. */
function fillPauseStats() {
  const story = ['First Run', 'Borrowed Sunshine', 'The Sunset Score', 'Story complete'][game.missions.storyIndex];
  byId('pause-stats').textContent =
    `Cash $${Math.floor(game.cash).toLocaleString('en-US')} · Taxi fares ${game.stats.taxiFares} · Sun discs ${game.missions.discsFound}/12 · ${story}`;
}

function pauseGame() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  game.saveGame();
  fillPauseStats();
  pauseScreen.style.display = 'flex';
}

if (shot) {
  // Screenshot mode: stage the requested scene and skip the menus entirely.
  stageShot(game, shot);
} else {
  titleScreen.style.display = 'flex';
  if (game.hasSave) byId('btn-continue').style.display = 'inline-block';
  byId('btn-play').addEventListener('click', () => startPlaying(true));
  byId('btn-continue').addEventListener('click', () => {
    const save = loadSave();
    if (save) game.applySave(save);
    startPlaying(false);
  });
  byId('btn-resume').addEventListener('click', () => {
    pauseScreen.style.display = 'none';
    game.state = 'playing';
    lockPointer();
  });
  byId('btn-quit-title').addEventListener('click', () => {
    pauseScreen.style.display = 'none';
    game.state = 'title';
    game.hud.hide();
    titleScreen.style.display = 'flex';
    if (game.hasSave || loadSave()) byId('btn-continue').style.display = 'inline-block';
  });
  byId('btn-respawn').addEventListener('click', () => {
    endScreen.style.display = 'none';
    game.respawn(endKind);
    lockPointer();
  });
  game.renderer.domElement.addEventListener('click', () => {
    if (game.state === 'playing' && document.pointerLockElement !== game.renderer.domElement) lockPointer();
  });
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (game.state === 'playing' && document.pointerLockElement !== game.renderer.domElement) pauseGame();
      else if (game.state === 'paused') {
        pauseScreen.style.display = 'none';
        game.state = 'playing';
      }
    }
  });
}

// The frame loop. requestAnimationFrame timestamps can trail
// performance.now() on a busy first frame, and a negative step would turn
// the camera's smoothing lerp into a catapult, so the step is clamped at
// both ends.
const clock = { last: performance.now() };
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - clock.last) / 1000));
  clock.last = now;
  if (game.state !== 'paused') game.update(dt);
  else game.renderer.render(game.scene, game.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
