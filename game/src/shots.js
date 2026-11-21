// Screenshot staging, behind ?shot=cover|drive|chase|mission. Each scene is
// posed from the same seeded world, then the real simulation is stepped for a
// couple of seconds at a small render size (so headless staging stays fast)
// before the frame is restored to full size, rendered once and flagged ready.
// The screenshots are the game's own renders — nothing is composited.

import { POIS } from './city.js';
import { createCar } from './vehicles.js';

/** Step the simulation without rendering; `pin` re-asserts staged state per step. */
function step(game, seconds, pin = null) {
  const steps = Math.round(seconds * 30);
  game.deferRender = true;
  for (let i = 0; i < steps; i += 1) {
    if (pin) pin();
    game.update(1 / 30);
  }
  game.deferRender = false;
}

function shrink(game) {
  game.renderer.setSize(320, 200, false);
  game.camera.aspect = 320 / 200;
  game.camera.updateProjectionMatrix();
}

function restore(game) {
  game.renderer.setSize(innerWidth, innerHeight);
  game.camera.aspect = innerWidth / innerHeight;
  game.camera.updateProjectionMatrix();
}

function placePlayer(game, x, z, heading) {
  game.player.x = x;
  game.player.z = z;
  game.player.heading = heading;
  game.snapCamera = true;
}

function putPlayerInCar(game, car, x, z, heading, speed) {
  car.x = x;
  car.z = z;
  car.heading = heading;
  car.speed = speed;
  car.mesh.position.set(x, 0, z);
  car.mesh.rotation.y = heading;
  game.player.enterCar(car, game);
  game.lastCar = car;
}

export function stageShot(game, name) {
  shrink(game);
  const rig = game.cameraRig;
  game.cash = 485;
  game.health = 100;

  if (name === 'drive') {
    const car = game.cars.find((c) => c.type === 'sport' && c !== game.markedCar) ?? game.cars[1];
    putPlayerInCar(game, car, -22 - 3.4, -30, 0, 17);
    const ahead = game.cars.filter((c) => c.traffic)[1];
    if (ahead) {
      ahead.traffic.dirX = 0;
      ahead.traffic.dirZ = 1;
      ahead.traffic.line = -22;
      ahead.x = -25.4;
      ahead.z = 26;
      ahead.heading = 0;
      ahead.speed = 9;
    }
    rig.yaw = 0.12;
    rig.pitch = 0.3;
    rig.dist = 10.5;
    step(game, 2.2, () => { car.speed = 17; car.heading = 0; });
  } else if (name === 'chase') {
    game.missions.storyIndex = 2;
    game.missions.stage = 'escape';
    const car = game.cars.find((c) => c.type === 'sedan' && c.driver === 'parked') ?? game.cars[2];
    putPlayerInCar(game, car, 60, 22 - 3.4, -Math.PI / 2, 19);
    game.wanted = 3;
    game.crimeTimer = 9999;
    for (const [ox, oz] of [[9, 4], [14, -5]]) {
      const unit = createCar(game.scene, 'police', 0xffffff, car.x + ox, car.z + oz, -Math.PI / 2);
      unit.driver = 'police';
      unit.retire = 0;
      game.cars.push(unit);
      game.police.units.push(unit);
    }
    // The camera looks back down the avenue: the player's car in front, the
    // law behind it.
    rig.yaw = Math.PI / 2 - 0.3;
    rig.pitch = 0.3;
    rig.dist = 11;
    step(game, 2.6, () => { car.speed = 19; });
    game.wanted = 3;
  } else if (name === 'mission') {
    game.missions.storyIndex = 0;
    game.missions.stage = 'toWarehouse';
    placePlayer(game, POIS.warehouse.x - 28, POIS.warehouse.z + 20, Math.atan2(28, -20));
    rig.yaw = Math.atan2(28, -20);
    rig.pitch = 0.22;
    rig.dist = 9.5;
    step(game, 2);
  } else {
    // cover: on foot at the café corner, looking south-east down the avenue
    // toward the boardwalk and the sea, with traffic rolling through.
    placePlayer(game, -112, -102, 0.62);
    const traffic = game.cars.find((c) => c.traffic);
    if (traffic) {
      traffic.traffic.dirX = 1;
      traffic.traffic.dirZ = 0;
      traffic.traffic.line = -66;
      traffic.x = -152;
      traffic.z = -66 + 3.4;
      traffic.heading = Math.PI / 2;
      traffic.speed = 13;
    }
    const walkers = game.peds.slice(0, 2);
    walkers[0].x = -117;
    walkers[0].z = -90;
    walkers[0].target = null;
    walkers[1].x = -101;
    walkers[1].z = -78;
    walkers[1].target = null;
    rig.yaw = 0.62;
    rig.pitch = 0.24;
    rig.dist = 8;
    step(game, 2.4);
  }

  // Back to full size, settle the camera, and flag the finished frame.
  restore(game);
  game.snapCamera = true;
  game.update(1 / 30);
  game.update(0);
  window.__shotReady = true;
}
