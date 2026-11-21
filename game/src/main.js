// Boot and screens: title, pause, and the downed/busted end screen. The Game
// (world.js) runs the city itself; this file only wires the menus, pointer
// lock and the frame loop — plus the ?shot= staging that produces the entry's
// screenshots.

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

window.__game = game; // staging/debug handle; the screenshot rig reads it

function lockPointer() {
  game.renderer.domElement.requestPointerLock?.();
}

// Losing pointer lock mid-play (the player pressed Esc, most likely) pauses —
// but only once the lock has genuinely been held a moment, so the brief lock
// churn of starting a game never trips it.
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === game.renderer.domElement) lockHeldAt = performance.now();
  else if (game.state === 'playing' && !shot && performance.now() - lockHeldAt > 1200) pauseGame();
});

function startPlaying(fresh) {
  if (fresh) {
    clearSave();
    game.missions.restore(0);
    game.cash = 60;
    game.stats.taxiFares = 0;
  }
  titleScreen.style.display = 'none';
  endScreen.style.display = 'none';
  game.startGame();
  lockPointer();
}

function pauseGame() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  game.saveGame();
  pauseScreen.style.display = 'flex';
}

if (shot) {
  // Screenshot mode: stage the scene and skip every menu.
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

// Frame loop. Timestamps from requestAnimationFrame can lag performance.now()
// on a busy first frame; a negative step would turn the camera's smoothing
// lerp into a catapult, so the step is clamped at both ends.
const clock = { last: performance.now() };
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - clock.last) / 1000));
  clock.last = now;
  if (game.state !== 'paused') game.update(dt);
  else game.renderer.render(game.scene, game.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
