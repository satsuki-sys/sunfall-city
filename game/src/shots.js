// shots.js — the deterministic scenes behind the screenshots. Each one
// poses the live game — the same systems, the same HUD — at a moment worth
// showing: the city on foot with the first job waiting, a drive along the
// shore road, a three-star chase, and a delivery rolling in. Nothing here
// is faked for the camera; the frame loop runs the game as usual.

import { PLACES } from './config.js';

function settleCamera(world, x, y, z) {
  world.player.camPos.set(x, y, z);
  world.camera.position.set(x, y, z);
}

function putPlayerInCar(world, car, x, z, heading, speed) {
  car.place(x, z, heading);
  car.speed = speed;
  car.update(0.016, { throttle: 0, steer: 0, handbrake: false }, world.city.colliders, []);
  car.driver = 'player';
  world.player.driving = car;
  world.player.pos.copy(car.pos);
}

export function stageShot(world, name) {
  const p = world.player;
  world.state = 'playing';
  if (name === 'cover') {
    // On foot on the boardwalk, a Sun Disc at his shoulder, the whole city
    // and the first job in front of him.
    p.pos.set(11, 0, 125);
    p.yaw = Math.PI + 0.25;
    p.heading = Math.PI + 0.25;
    settleCamera(world, 14.5, 2.6, 131);
  } else if (name === 'drive') {
    const car = world.parkedCars[2];
    putPlayerInCar(world, car, 2, 107.6, Math.PI / 2, 13);
    settleCamera(world, -8, 3.4, 107);
  } else if (name === 'chase') {
    const gt = world.missions.gt;
    putPlayerInCar(world, gt, 44, 107.6, Math.PI / 2, 16);
    world.setWanted(3);
    world.police.setWanted(3, gt.pos);
    // One cruiser alongside in the far lane, one trailing in frame behind,
    // one further back: all three read as pursuit in a single frame.
    const spots = [[40, 103.6, 16], [28, 110.6, 17], [17, 107.6, 17]];
    world.police.cruisers.forEach((c, i) => {
      const [x, z, s] = spots[i % spots.length];
      c.place(x, z, Math.PI / 2);
      c.speed = s;
      c.update(0.016, { throttle: 0, steer: 0, handbrake: false }, world.city.colliders, []);
    });
    world.missions.objective = { text: 'Lose the heat', x: null, z: null };
    settleCamera(world, 34, 3.8, 106.4);
  } else if (name === 'mission') {
    const car = world.parkedCars[0];
    // Rolling toward the warehouse's south face, beacon in frame ahead.
    putPlayerInCar(world, car, 64, -38, 2.48, 8);
    world.missions.phase = 'carry';
    world.missions.timer = 74;
    world.missions.objective = { text: 'Deliver the cooler to Dockside Cold Storage', x: PLACES.storage.x, z: PLACES.storage.z };
    settleCamera(world, 58.5, 3.4, -31);
  }
}
