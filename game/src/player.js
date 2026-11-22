// player.js — Nico Vale on foot, and the camera that follows him whether he
// is walking or driving. On foot: WASD moves relative to the camera, the
// mouse looks, Shift runs. Driving: the camera settles behind the car,
// looks ahead into its velocity and widens its lens as speed builds.

import * as THREE from 'three';
import { clamp, lerp, turnToward } from './config.js';
import { groundHeightAt, resolveCollisions } from './city.js';
import { makePedMesh, } from './peds.js';
import { mulberry32 } from './config.js';

export class Player {
  constructor(scene, spawn) {
    this.mesh = makePedMesh(mulberry32(99));
    // Nico dresses like he means it: a teal shirt whatever the rng said.
    this.mesh.children[0].material = new THREE.MeshLambertMaterial({ color: 0x1f7a72 });
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.heading = spawn.heading;   // body facing
    this.yaw = spawn.heading;       // camera facing
    this.pitch = 0.18;
    this.hp = 100;
    this.driving = null;            // a Car, when at the wheel
    this.walkPhase = 0;
    this.camPos = new THREE.Vector3(spawn.x, 3, spawn.z - 6);
    this.fov = 62;
    this.dead = false;
  }

  get car() { return this.driving; }

  update(dt, world) {
    const input = world.input;
    if (this.driving) { this.updateDriving(dt, world); return; }

    // Mouse look.
    this.yaw -= input.mouseDX * 0.0026;
    this.pitch = clamp(this.pitch + input.mouseDY * 0.0022, -0.5, 0.9);

    let mx = 0, mz = 0;
    if (input.down('KeyW')) mz += 1;
    if (input.down('KeyS')) mz -= 1;
    if (input.down('KeyA')) mx -= 1;
    if (input.down('KeyD')) mx += 1;
    const running = input.down('ShiftLeft') || input.down('ShiftRight');
    const moving = (mx !== 0 || mz !== 0);
    if (moving) {
      const len = Math.hypot(mx, mz);
      const speed = running ? 8.2 : 4.6;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const vx = (sin * mz + cos * mx) / len, vz = (cos * mz - sin * mx) / len;
      this.pos.x += vx * speed * dt;
      this.pos.z += vz * speed * dt;
      this.heading = turnToward(this.heading, Math.atan2(vx, vz), dt * 12);
      this.walkPhase += dt * speed * 1.9;
    }
    resolveCollisions(this.pos, 0.42, world.city.colliders);
    // The sea is not a road: keep him on the sand and the pier.
    if (this.pos.z > 156 && !(this.pos.x >= -5 && this.pos.x <= 5)) this.pos.z = 156;
    this.pos.x = clamp(this.pos.x, -130, 130);
    this.pos.z = clamp(this.pos.z, -130, 196);

    const y = groundHeightAt(this.pos.x, this.pos.z);
    this.mesh.visible = true;
    this.mesh.position.set(this.pos.x, y + (moving ? Math.abs(Math.sin(this.walkPhase)) * 0.05 : 0), this.pos.z);
    this.mesh.rotation.y = this.heading;
    const legs = this.mesh.userData.legs;
    const swing = moving ? Math.sin(this.walkPhase) * 0.6 : 0;
    legs[0].rotation.x = swing; legs[1].rotation.x = -swing;

    // Third-person camera: behind the look direction, a little above.
    const dist = 6.2, height = 2.4;
    const cx = this.pos.x - Math.sin(this.yaw) * Math.cos(this.pitch) * dist;
    const cz = this.pos.z - Math.cos(this.yaw) * Math.cos(this.pitch) * dist;
    const cy = y + height + Math.sin(this.pitch) * dist;
    this.camPos.x = lerp(this.camPos.x, cx, 1 - Math.pow(0.0001, dt));
    this.camPos.y = lerp(this.camPos.y, Math.max(cy, 0.7), 1 - Math.pow(0.0001, dt));
    this.camPos.z = lerp(this.camPos.z, cz, 1 - Math.pow(0.0001, dt));
    world.camera.position.copy(this.camPos);
    world.camera.lookAt(
      this.pos.x + Math.sin(this.yaw) * 8,
      y + 1.6 - Math.sin(this.pitch) * 4,
      this.pos.z + Math.cos(this.yaw) * 8,
    );
    this.setFov(world, 62, dt);
  }

  updateDriving(dt, world) {
    const car = this.driving;
    this.pos.copy(car.pos);
    this.heading = car.heading;
    this.mesh.visible = false;
    // The camera trails the car, biased toward where its velocity points,
    // and the lens breathes out from 62 to 71 degrees with speed.
    const speed = Math.abs(car.speed);
    const back = 8.4 + speed * 0.06;
    const vx = car.vel ? car.vel.x : 0, vz = car.vel ? car.vel.y : 0;
    const tx = car.pos.x - Math.sin(car.heading) * back + vx * 0.22;
    const tz = car.pos.z - Math.cos(car.heading) * back + vz * 0.22;
    const k = 1 - Math.pow(0.001, dt);
    this.camPos.x = lerp(this.camPos.x, tx, k);
    this.camPos.y = lerp(this.camPos.y, 3.1 + speed * 0.012, k);
    this.camPos.z = lerp(this.camPos.z, tz, k);
    world.camera.position.copy(this.camPos);
    world.camera.lookAt(
      car.pos.x + Math.sin(car.heading) * 10 + vx * 0.3,
      1.2,
      car.pos.z + Math.cos(car.heading) * 10 + vz * 0.3,
    );
    this.setFov(world, 62 + clamp(speed / car.profile.maxSpeed, 0, 1) * 9, dt);
  }

  setFov(world, target, dt) {
    this.fov = lerp(this.fov, target, 1 - Math.pow(0.001, dt));
    if (Math.abs(world.camera.fov - this.fov) > 0.05) {
      world.camera.fov = this.fov;
      world.camera.updateProjectionMatrix();
    }
  }

  // Eye position and aim direction, for the pistol.
  eye() {
    const y = groundHeightAt(this.pos.x, this.pos.z);
    return new THREE.Vector3(this.pos.x, y + 1.55, this.pos.z);
  }
  aimDir() {
    return new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      -Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
  }
}
