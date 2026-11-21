// shots.js — the deterministic screenshot stagings. Loading the game with
// ?shot=<name>&seed=7 skips the title screen and poses a living scene for
// each of the four screenshots in shots.json: the cover (on foot downtown,
// first objective up), the drive (crossing town in a car), the chase (three
// stars, the Sunset Score escape) and the mission (at the warehouse on the
// delivery run). The scenes are real game state — traffic flows, the discs
// spin, the police give chase — only the opening positions are arranged.

import { PLACES } from './config.js';
import { freshSave } from './save.js';

// Pose the player in a specific car at a specific place, rolling.
function putPlayerInCar(game, car, x, z, heading, speed) {
  car.setPosition(x, z, heading);
  car.speed = speed;
  game.playerCar = car;
  game.lastCar = car;
  game.player.setVisible(false);
  game.camYaw = heading;
  game.camPitch = 0.14;
}

export function stageShot(game, name) {
  game.shotMode = true;
  game.state = 'playing';
  game.hud.hideScreens();
  game.applyProfile(freshSave());
  const m = game.missions;

  if (name === 'drive') {
    game.profile.cash = 485;
    const car = game.parkedCars[0];
    putPlayerInCar(game, car, -30, 124, Math.PI / 2, 12.5);
    m.stage = 0;
  } else if (name === 'chase') {
    game.profile.cash = 510;
    const disc = m.discs.discs[4]; // café corner, already found in this scene
    disc.taken = true;
    disc.group.visible = false;
    game.profile.discs = [4];
    m.stage = 3;
    m.caseTaken = true;
    const car = game.parkedCars[1];
    putPlayerInCar(game, car, 60, -20, Math.PI / 2, 14);
    game.police.stars = 3;
    game.police.spawnCruiser();
    game.police.spawnCruiser();
    const [c1, c2] = game.police.cruisers;
    if (c1) { c1.setPosition(38, -27, Math.PI / 2); c1.speed = 13; }
    if (c2) { c2.setPosition(30, -13, Math.PI / 2); c2.speed = 12; }
  } else if (name === 'mission') {
    game.profile.cash = 485;
    m.stage = 1;
    m.timer = 170;
    game.player.setPosition(-118, -116, -2.2);
    game.camYaw = -2.2;
    game.camPitch = 0.12;
  } else {
    // 'cover' and anything unrecognized: the opening moment of the game.
    game.profile.cash = 485;
    m.stage = 0;
    game.player.setPosition(PLACES.spawn.x, PLACES.spawn.z, PLACES.spawn.heading);
    game.camYaw = PLACES.spawn.heading;
    game.camPitch = 0.16;
  }
  m.refreshObjective();
}
