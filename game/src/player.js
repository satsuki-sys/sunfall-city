// The player: a courier in a teal shirt. On foot they walk and sprint with a
// swing of the arms, turn with the camera, and collide with walls and cars;
// F gets into the nearest car (hot-wiring a stranger's ride is a crime when
// someone sees it) and F again gets out. The camera is a soft orbit rig that
// follows behind, pulls in rather than clipping into roofs, leans into a
// drive with a speed FOV kick and a look-ahead, and aims the gun.

import * as THREE from 'three';
import { CITY, PLAYER } from './config.js';
import { angleDelta, clamp, dist2d } from './random.js';
import { makePerson } from './pedestrians.js';
import { groundHeightAt } from './city.js';
import { resolveCircle, stepCar } from './vehicles.js';

export class Player {
  constructor(scene, rng) {
    this.mesh = makePerson(rng, { skin: 0xd99e6a, shirt: 0x1f8a8c, pants: 0x2f3542 });
    scene.add(this.mesh);
    this.x = -120;
    this.z = -108;
    this.heading = Math.PI * 0.75;
    this.phase = 0;
    this.speedNow = 0;
    this.car = null;
  }

  get pos() { return { x: this.x, z: this.z }; }

  enterCar(car, world) {
    this.car = car;
    car.driver = 'player';
    this.mesh.visible = false;
    world.audio.door();
  }

  exitCar(world) {
    const car = this.car;
    if (!car) return;
    // Step out on the car's left side, pushed clear of any wall there.
    const sideX = Math.cos(car.heading);
    const sideZ = -Math.sin(car.heading);
    this.x = car.x + sideX * 1.8;
    this.z = car.z + sideZ * 1.8;
    [this.x, this.z] = resolveCircle(this.x, this.z, PLAYER.radius, world.colliders);
    this.heading = car.heading;
    car.driver = 'parked';
    car.speed = 0;
    this.car = null;
    this.mesh.visible = true;
    world.audio.screech(0);
    world.audio.door();
  }

  update(dt, world) {
    const input = world.input;
    if (this.car) {
      this.#drive(dt, world, input);
      return;
    }
    this.#walk(dt, world, input);
  }

  /** Driving: the shared stepCar physics, fed by the driving keys. */
  #drive(dt, world, input) {
    const car = this.car;
    const throttle = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    const steer = input.axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
    const handbrake = input.down('Space');
    stepCar(car, { throttle, steer, brake: handbrake }, dt, world.colliders, world.cars);
    this.x = car.x;
    this.z = car.z;
    this.heading = car.heading;
    this.speedNow = Math.abs(car.speed);
    world.audio.engine(clamp(Math.abs(car.speed) / car.spec.maxSpeed, 0, 1));
    // Tires protest when the handbrake is yanked at speed.
    const sliding = handbrake && Math.abs(car.speed) > 8;
    world.audio.screech(sliding ? clamp(Math.abs(car.speed) / car.spec.maxSpeed, 0, 1) : 0);
    if (input.justPressed('KeyH')) world.audio.horn();
    if (car.lastImpact > 9 && Math.abs(car.speed) < 4) {
      world.shake(0.25);
      world.audio.bump();
    }
  }

  /** On foot: move relative to the camera's ground-projected facing. */
  #walk(dt, world, input) {
    world.audio.engine(null);
    world.audio.screech(0);
    const camYaw = world.cameraRig.yaw;
    const fwd = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    const strafe = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    let mx = 0;
    let mz = 0;
    if (fwd !== 0 || strafe !== 0) {
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      mx = sin * fwd - cos * strafe;
      mz = cos * fwd + sin * strafe;
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
    }
    const sprint = input.down('ShiftLeft', 'ShiftRight');
    const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const moving = mx !== 0 || mz !== 0;
    this.speedNow = moving ? speed : 0;
    if (moving) {
      this.x += mx * speed * dt;
      this.z += mz * speed * dt;
      // Face the way we move — or the camera's way, while the mouse aims.
      const want = input.mouseDown ? camYaw : Math.atan2(mx, mz);
      this.heading += clamp(angleDelta(this.heading, want), -10 * dt, 10 * dt);
      this.phase += dt * (sprint ? 11 : 8);
    }
    [this.x, this.z] = resolveCircle(this.x, this.z, PLAYER.radius, world.colliders);
    // Cars are solid too: slide out of any we overlap.
    for (const car of world.cars) {
      const d = dist2d(this.x, this.z, car.x, car.z);
      const min = car.spec.len * 0.42;
      if (d > 0.01 && d < min) {
        this.x += ((this.x - car.x) / d) * (min - d);
        this.z += ((this.z - car.z) / d) * (min - d);
      }
    }
    // The pier is walkable deck over the water; everywhere else the sand ends play.
    const onPier = Math.abs(this.x - (-88)) < 6 && this.z > CITY.waterZ - 6;
    this.x = clamp(this.x, -256, 256);
    this.z = clamp(this.z, -256, onPier ? 336 : 300);
    const parts = this.mesh.userData.parts;
    const swing = moving ? Math.sin(this.phase) * 0.55 : 0;
    parts.legL.rotation.x = swing;
    parts.legR.rotation.x = -swing;
    parts.armL.rotation.x = -swing * 0.8;
    parts.armR.rotation.x = input.mouseDown ? -1.35 : swing * 0.8; // raised, aiming, while firing
    const bob = moving ? Math.abs(Math.sin(this.phase)) * 0.04 : 0;
    this.mesh.position.set(this.x, groundHeightAt(this.x, this.z) + bob, this.z);
    this.mesh.rotation.y = this.heading;
  }
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI * 0.75;
    this.pitch = 0.32;
    this.dist = 8;
    this.shakeTime = 0;
    this.forward = new THREE.Vector3(0, 0, 1);
    this.baseFov = camera.fov;
  }

  shake(t) { this.shakeTime = Math.max(this.shakeTime, t); }

  update(dt, world) {
    const input = world.input;
    if (world.state === 'playing') {
      this.yaw -= input.mouseDX * 0.0032;
      this.pitch = clamp(this.pitch + input.mouseDY * 0.0028, 0.04, 1.25);
      this.dist = clamp(this.dist + input.wheel * 1.2, 5, 14);
    }
    const driving = !!world.playerVehicle;
    const target = new THREE.Vector3(
      world.playerPos.x,
      (world.playerVehicle ? world.playerVehicle.mesh.position.y + 1.3 : groundHeightAt(world.playerPos.x, world.playerPos.z) + 1.6),
      world.playerPos.z,
    );
    // While driving, the camera looks a little way up the road the car is
    // actually travelling — the frame leads the car instead of chasing it.
    if (driving) {
      const car = world.playerVehicle;
      target.x += Math.sin(car.heading) * car.speed * 0.16;
      target.z += Math.cos(car.heading) * car.speed * 0.16;
    }
    // Speed opens the lens a touch: 62° at a crawl, up to ~71° flat out.
    const speedRatio = driving ? clamp(Math.abs(world.playerVehicle.speed) / world.playerVehicle.spec.maxSpeed, 0, 1) : 0;
    const wantFov = this.baseFov + speedRatio * 9;
    if (Math.abs(this.camera.fov - wantFov) > 0.02) {
      this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, dt * 3.5 + 0.02);
      this.camera.updateProjectionMatrix();
    }
    const wantDist = driving ? Math.max(this.dist, 9.5) : this.dist;
    const back = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    // If the full orbit distance lands inside a building, pull the camera in.
    let used = wantDist;
    for (const scale of [1, 0.62, 0.35]) {
      used = wantDist * scale;
      const cx = target.x + back.x * used;
      const cz = target.z + back.z * used;
      const inside = world.colliders.some((c) => cx > c.minX - 0.4 && cx < c.maxX + 0.4 && cz > c.minZ - 0.4 && cz < c.maxZ + 0.4);
      if (!inside) break;
    }
    const pos = target.clone().addScaledVector(back, used);
    pos.y = Math.max(pos.y, groundHeightAt(pos.x, pos.z) + 0.55);
    const k = dt <= 0 ? 0 : Math.min(1, 1 - Math.pow(0.0001, dt)); // fast, smooth follow
    this.camera.position.lerp(pos, world.snapCamera ? 1 : k);
    world.snapCamera = false;
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      this.camera.position.x += (Math.random() - 0.5) * 0.14;
      this.camera.position.y += (Math.random() - 0.5) * 0.1;
    }
    this.camera.lookAt(target);
    this.forward = target.clone().sub(this.camera.position).normalize();
  }
}
