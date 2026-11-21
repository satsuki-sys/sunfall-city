// Combat: the player's handgun — hitscan down the camera's aim, with a
// tracer and a dust puff wherever the round lands — and the armed guards
// who shoot back during the story. Every shot is a crime the city can
// hear, and every hit lands somewhere specific: a pedestrian, a guard, a
// car, or a wall.

import * as THREE from 'three';
import { dist2d } from './random.js';
import { makePerson } from './pedestrians.js';
import { groundHeightAt } from './city.js';

export class Guard {
  constructor(scene, rng, x, z, heading = 0) {
    this.mesh = makePerson(rng, { skin: 0xa06844, shirt: 0x2b2f36, pants: 0x1e2126, hat: 1 });
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.12, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.5 }),
    );
    gun.position.set(0.3, 1.22, 0.3);
    this.mesh.add(gun);
    this.mesh.position.set(x, groundHeightAt(x, z), z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.health = 60;
    this.active = false;   // the story stage that needs him switches this on
    this.dead = false;
    this.cooldown = 1.2;
  }

  damage(n) {
    this.health -= n;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = groundHeightAt(this.x, this.z) + 0.18;
    }
  }

  update(dt, world) {
    if (!this.active || this.dead) return;
    const p = world.playerPos;
    const d = dist2d(this.x, this.z, p.x, p.z);
    this.heading = Math.atan2(p.x - this.x, p.z - this.z);
    this.mesh.rotation.y = this.heading;
    if (d > 30 || world.state !== 'playing') return;
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      this.cooldown = world.rng.range(1.0, 1.7);
      const from = new THREE.Vector3(this.x, groundHeightAt(this.x, this.z) + 1.35, this.z);
      const baseY = world.playerVehicle ? world.playerVehicle.mesh.position.y : groundHeightAt(p.x, p.z);
      const to = new THREE.Vector3(p.x, (world.playerVehicle ? 0.9 : 1.1) + baseY, p.z);
      world.spawnTracer(from, to, 0xffa04d);
      world.audio.shot();
      // Range degrades his aim, and a moving car is harder to hit still.
      const hitChance = Math.max(0.12, 0.62 - d * 0.014 - (world.playerVehicle ? 0.18 : 0));
      if (world.rng.next() < hitChance) world.damagePlayer(world.rng.range(4, 9), this);
    }
  }
}

/** Ray against sphere: the distance along the ray, or Infinity on a miss. */
function raySphere(origin, dir, centre, radius) {
  const ox = centre.x - origin.x;
  const oy = centre.y - origin.y;
  const oz = centre.z - origin.z;
  const tca = ox * dir.x + oy * dir.y + oz * dir.z;
  if (tca < 0) return Infinity;
  const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
  if (d2 > radius * radius) return Infinity;
  return tca - Math.sqrt(radius * radius - d2);
}

export class Combat {
  constructor(world) {
    this.world = world;
    this.cooldown = 0;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
  }

  /** Fire one shot toward the camera's aim. True if a shot went off. */
  playerShoot(origin, dir) {
    const world = this.world;
    if (this.cooldown > 0) return false;
    this.cooldown = 0.24;
    world.audio.shot();
    world.reportCrime('shot', world.playerPos);

    // Walk every candidate and keep the nearest thing the ray touches:
    // pedestrians, guards, cars and buildings, in that scan order.
    let bestT = 90;
    let hit = null;
    const consider = (t, what) => { if (t < bestT) { bestT = t; hit = what; } };
    for (const ped of world.peds) {
      if (ped.state === 'down' || ped.state === 'riding') continue;
      const centre = new THREE.Vector3(ped.x, groundHeightAt(ped.x, ped.z) + 1.0, ped.z);
      consider(raySphere(origin, dir, centre, 0.62), { kind: 'ped', ped });
    }
    for (const guard of world.guards) {
      if (guard.dead) continue;
      const centre = new THREE.Vector3(guard.x, groundHeightAt(guard.x, guard.z) + 1.0, guard.z);
      consider(raySphere(origin, dir, centre, 0.62), { kind: 'guard', guard });
    }
    for (const car of world.cars) {
      const centre = new THREE.Vector3(car.x, car.mesh.position.y + 0.8, car.z);
      consider(raySphere(origin, dir, centre, car.spec.len * 0.52), { kind: 'car', car });
    }
    for (const box of world.colliders) {
      // A cheap building stop: a sphere parked at the AABB's centre.
      const cx = (box.minX + box.maxX) / 2;
      const cz = (box.minZ + box.maxZ) / 2;
      const r = Math.max(box.maxX - box.minX, box.maxZ - box.minZ) / 2;
      consider(raySphere(origin, dir, new THREE.Vector3(cx, 6, cz), r), { kind: 'wall' });
    }

    // Tracer and a bright impact flash, hit or miss.
    const end = origin.clone().addScaledVector(dir, bestT);
    const muzzle = origin.clone().addScaledVector(dir, 0.7);
    muzzle.y -= 0.12;
    world.spawnTracer(muzzle, end, 0xffe9a0);
    world.spawnPuff(end, 0xffe2a8, 2, 0.7);
    world.spawnPuff(end, 0xd8cfc0);

    if (!hit) return true;
    if (hit.kind === 'ped') {
      hit.ped.knockDown();
      world.reportCrime('hitPed', world.playerPos);
      world.hud.message('You shot a bystander!', '#ff7a6b');
    } else if (hit.kind === 'guard') {
      hit.guard.damage(34);
      if (hit.guard.dead) world.hud.message('Guard down.', '#ffd98f');
    } else if (hit.kind === 'car') {
      hit.car.health -= 13;
      if (hit.car.driver === 'police') world.reportCrime('hitPolice', world.playerPos);
      world.spawnPuff(end, 0x9aa2ad);
    }
    return true;
  }
}
