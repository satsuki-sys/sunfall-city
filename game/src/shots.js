// Screenshot staging: the deterministic `?shot=` scenes the entry's four
// screenshots are rendered from. Each one poses the city mid-moment — the
// first objective on foot, a drive in the flow of traffic, a three-star
// chase, a delivery rolling in — with the HUD live, so a screenshot shows
// the game exactly as it plays. The world keeps simulating around the
// posed actors; the staged cars carry a little speed on their clocks so
// the speedometer tells the same story as the frame.

import * as THREE from 'three';

function setCam(game, x, y, z, lx, ly, lz, fov = 62) {
  game.camera.position.set(x, y, z);
  game.camera.lookAt(lx, ly, lz);
  if (Math.abs(game.camera.fov - fov) > 0.1) {
    game.camera.fov = fov;
    game.camera.updateProjectionMatrix();
  }
}

function putPlayerInCar(game, car, speed) {
  game.playerCar = car;
  car.occupant = 'player';
  car.speed = speed;
  game.player.mesh.visible = false;
}

export function stageShot(game, name) {
  game.hud.setCash(game.profile.cash);
  game.hud.setDiscs(game.profile.discs.length);

  if (name === 'drive') {
    // Avenue 64's northbound lane, in the flow: a car queued behind in the
    // same lane, the southbound stream coming the other way.
    const car = game.parkedCars[0];
    car.mesh.position.set(67.6, 0, -16);
    car.angle = 0;
    putPlayerInCar(game, car, 12);
    game.missions.stage = 0;
    setCam(game, 73.5, 3.4, -4.5, 63, 1.2, -30, 68);
    return;
  }
  if (name === 'chase') {
    // Three stars on Street 128: the Solstice GT fleeing east along the
    // sunlit shore road, two cruisers staggered on its tail with strobes
    // lit, objective "lose the heat". (The shore road stays in the sun —
    // every building's shadow falls away from it, to the north-east.)
    const car = game.gtCar;
    car.mesh.position.set(104, 0, 131.6);
    car.angle = Math.PI / 2;
    putPlayerInCar(game, car, 14);
    const c1 = game.police.spawnCruiser();
    c1.mesh.position.set(88, 0, 131.0);
    c1.angle = Math.PI / 2;
    c1.speed = 13;
    const c2 = game.police.spawnCruiser();
    c2.mesh.position.set(81, 0, 124.8);
    c2.angle = Math.PI / 2;
    c2.speed = 13;
    // One still update each so the light bars catch their strobe phase.
    c1.update(0.05, { throttle: 0, steer: 0, handbrake: false }, game.colliders);
    c2.update(0.24, { throttle: 0, steer: 0, handbrake: false }, game.colliders);
    game.police.wanted = 3;
    game.missions.stage = 3;
    game.missions.caseTaken = true;
    setCam(game, 72, 5.0, 110, 106, 1.2, 129, 66);
    return;
  }
  if (name === 'mission') {
    // The delivery run: swinging off Street 128 onto the warehouse yard,
    // timer on the HUD, beacon over Dockside Cold Storage.
    const car = game.parkedCars[1] ?? game.parkedCars[0];
    car.mesh.position.set(126, 0, 119);
    car.angle = 1.35;
    putPlayerInCar(game, car, 9);
    game.missions.stage = 1;
    game.missions.stageTimer = 74;
    setCam(game, 110, 4.4, 133, 152, 2, 110, 64);
    return;
  }
  // cover (default): on foot at the Café Brisa corner — Nico three-quarter
  // to the camera, a sun disc glinting beside him, the café, its sign and
  // the objective beacon all in the frame behind.
  game.missions.stage = 0;
  game.player.placeAt(52, 47, 2.7);
  game.camYaw = 2.7;
  setCam(game, 60.5, 2.0, 54.5, 37, 2.0, 37, 58);
}

export function frameShot(game, name, t) {
  // Only the cover breathes: a very slow push-in. The rest hold their frame
  // so the render is deterministic.
  if (name === 'cover' || !name) {
    const drift = Math.sin(t * 0.11) * 0.7;
    setCam(game, 60.5 + drift, 2.0, 54.5, 37, 2.0, 37, 58);
  }
}
