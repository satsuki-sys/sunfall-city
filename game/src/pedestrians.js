// Pedestrians: low-poly townsfolk ambling around the sidewalk loop of
// each block, crossing streets at the corners, flagging down taxis, and
// bolting whenever the city turns dangerous nearby. A person is a small
// assembly of boxes — some topped with wide sun hats, some with flat
// caps — and the walking is done by swinging legs and arms over a bob.

import * as THREE from 'three';
import { blockCentres } from './config.js';
import { angleDelta, clamp, dist2d } from './random.js';
import { groundHeightAt } from './city.js';

const SKIN = [0xf2c9a0, 0xd99e6a, 0xa06844, 0x7a4a2c, 0xffe0bd];
const SHIRTS = [0xe8836b, 0x63b3a6, 0xf2c14e, 0xf7f3ea, 0xd96c85, 0x7fb2d9, 0x9bc53d, 0xff8c42];
const PANTS = [0x39434f, 0x5b4a3f, 0x2f4858, 0x746a5a, 0x864343];
const HATS = [0xf2e3c6, 0xe4572e, 0x2a9d8f, 0xf7f3ea, 0x39434f];

/** Assemble one person. `fixed` pins skin/shirt/pants instead of rolling them. */
export function makePerson(rng, fixed = null) {
  const g = new THREE.Group();
  const skin = fixed?.skin ?? rng.pick(SKIN);
  const shirt = fixed?.shirt ?? rng.pick(SHIRTS);
  const pants = fixed?.pants ?? rng.pick(PANTS);
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });

  // Legs pivot at the hip: shift the geometry down so rotation swings them.
  const legGeo = new THREE.BoxGeometry(0.16, 0.78, 0.18);
  legGeo.translate(0, -0.39, 0);
  const legL = new THREE.Mesh(legGeo, mat(pants));
  legL.position.set(-0.11, 0.78, 0);
  const legR = new THREE.Mesh(legGeo, mat(pants));
  legR.position.set(0.11, 0.78, 0);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.24), mat(shirt));
  torso.position.y = 1.09;
  torso.castShadow = true;

  const armGeo = new THREE.BoxGeometry(0.11, 0.62, 0.13);
  armGeo.translate(0, -0.28, 0);
  const armL = new THREE.Mesh(armGeo, mat(shirt));
  armL.position.set(-0.3, 1.36, 0);
  const armR = new THREE.Mesh(armGeo, mat(shirt));
  armR.position.set(0.3, 1.36, 0);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(skin));
  head.position.y = 1.58;
  head.castShadow = true;
  g.add(legL, legR, torso, armL, armR, head);

  // About half the city shades itself from the sun: either a wide-brimmed
  // hat or a flat cap, in a colour that argues with the shirt.
  const hatRoll = fixed?.hat ?? rng.next();
  if (hatRoll < 0.3) {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 10), mat(rng.pick(HATS)));
    brim.position.y = 1.7;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.12, 10), brim.material);
    crown.position.y = 1.77;
    g.add(brim, crown);
  } else if (hatRoll < 0.55) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(rng.pick(HATS)));
    cap.position.y = 1.6;
    cap.scale.y = 0.7;
    g.add(cap);
  }

  g.userData.parts = { legL, legR, armL, armR, torso, head };
  return g;
}

const CENTRES = blockCentres();
const LOOP = 15.5; // how far the sidewalk loop sits from a block centre

export class Pedestrian {
  constructor(scene, rng, player = false) {
    this.mesh = makePerson(rng, player ? { skin: 0xd99e6a, shirt: 0x1f8a8c, pants: 0x2f3542, hat: 1 } : null);
    scene.add(this.mesh);
    this.rng = rng;
    this.x = 0;
    this.z = 0;
    this.heading = 0;
    this.speed = 0;
    this.phase = rng.range(0, 6);
    this.state = 'walk'; // walk | flee | down | waiting | toCar | riding
    this.block = rng.int(0, CENTRES.length - 1);
    this.blockZ = rng.int(0, CENTRES.length - 1);
    this.corner = rng.int(0, 3);
    this.fleeTime = 0;
    this.fleeFrom = { x: 0, z: 0 };
    this.downTime = 0;
    this.target = null;
    this.walkSpeed = rng.range(1.1, 1.7);
    this.#placeAtCorner();
  }

  /** The world position of the corner this pedestrian is currently using. */
  #cornerPos() {
    const cx = CENTRES[this.block];
    const cz = CENTRES[this.blockZ];
    const sx = this.corner === 0 || this.corner === 3 ? -LOOP : LOOP;
    const sz = this.corner < 2 ? -LOOP : LOOP;
    return { x: cx + sx, z: cz + sz };
  }

  #placeAtCorner() {
    const p = this.#cornerPos();
    this.x = p.x;
    this.z = p.z;
    this.target = null;
  }

  /** Pick the next waypoint: on around the loop, or across at a corner. */
  #nextTarget() {
    if (this.target) return this.target;
    if (this.rng.next() < 0.22) {
      // Cross into the neighbouring block, the way this corner faces.
      const east = this.corner === 1 || this.corner === 2;
      const south = this.corner >= 2;
      if (this.rng.chance(0.5)) {
        this.block = clamp(this.block + (east ? 1 : -1), 0, CENTRES.length - 1);
        this.corner = east ? (south ? 3 : 0) : (south ? 2 : 1);
      } else {
        this.blockZ = clamp(this.blockZ + (south ? 1 : -1), 0, CENTRES.length - 1);
        this.corner = south ? (east ? 0 : 1) : (east ? 3 : 2);
      }
      this.target = { ...this.#cornerPos(), crossing: true };
    } else {
      this.corner = (this.corner + 1) % 4;
      this.target = this.#cornerPos();
    }
    return this.target;
  }

  /** Fright nearby: run from it for a few seconds. */
  scare(x, z, radius = 26) {
    if (this.state !== 'walk') return;
    if (dist2d(this.x, this.z, x, z) < radius) {
      this.state = 'flee';
      this.fleeTime = this.rng.range(2.5, 4.5);
      this.fleeFrom = { x, z };
    }
  }

  knockDown() {
    if (this.state === 'down') return;
    this.state = 'down';
    this.downTime = 16;
    this.mesh.rotation.x = -Math.PI / 2;
  }

  update(dt, world) {
    const parts = this.mesh.userData.parts;
    if (this.state === 'down') {
      // Lie there until the timer expires with the player well away, then
      // quietly respawn at a fresh corner.
      this.downTime -= dt;
      this.mesh.position.set(this.x, groundHeightAt(this.x, this.z) + 0.18, this.z);
      if (this.downTime <= 0 && dist2d(this.x, this.z, world.playerPos.x, world.playerPos.z) > 60) {
        this.mesh.rotation.x = 0;
        this.state = 'walk';
        this.block = this.rng.int(0, CENTRES.length - 1);
        this.blockZ = this.rng.int(0, CENTRES.length - 1);
        this.target = null;
        this.#placeAtCorner();
      }
      return;
    }
    if (this.state === 'riding') { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    if (this.state === 'waiting') {
      // Taxi hailer: planted at the kerb, waving one arm.
      parts.armR.rotation.x = Math.PI * 0.85 + Math.sin(performance.now() * 0.012) * 0.25;
      this.#stand();
      return;
    }
    parts.armR.rotation.x = Math.sin(this.phase) * 0.5;

    // Decide where the current state is headed, and at what pace.
    let speed = this.walkSpeed;
    let tx;
    let tz;
    if (this.state === 'flee') {
      this.fleeTime -= dt;
      const dx = this.x - this.fleeFrom.x;
      const dz = this.z - this.fleeFrom.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = this.x + (dx / d) * 10;
      tz = this.z + (dz / d) * 10;
      speed = 6.4;
      if (this.fleeTime <= 0) { this.state = 'walk'; this.target = null; }
    } else if (this.state === 'toCar' && this.target) {
      tx = this.target.x;
      tz = this.target.z;
      speed = 3.4;
      if (dist2d(this.x, this.z, tx, tz) < 0.8 && world.onPedArrived) world.onPedArrived(this);
    } else {
      const t = this.#nextTarget();
      tx = t.x;
      tz = t.z;
      if (dist2d(this.x, this.z, tx, tz) < 0.7) {
        this.target = null;
        this.#animate(dt, 0, parts);
        this.#stand();
        return;
      }
    }

    // Steer toward the heading point, advance, and pose the mesh.
    const want = Math.atan2(tx - this.x, tz - this.z);
    this.heading += clamp(angleDelta(this.heading, want), -4.4 * dt, 4.4 * dt);
    this.x += Math.sin(this.heading) * speed * dt;
    this.z += Math.cos(this.heading) * speed * dt;
    this.x = clamp(this.x, -256, 256);
    this.z = clamp(this.z, -256, 300);
    this.speed = speed;
    this.#animate(dt, speed, parts);
    this.mesh.position.set(this.x, groundHeightAt(this.x, this.z) + Math.abs(Math.sin(this.phase)) * 0.05, this.z);
    this.mesh.rotation.y = this.heading;
  }

  /** Leave the mesh standing where it is, upright, facing the heading. */
  #stand() {
    this.mesh.position.set(this.x, groundHeightAt(this.x, this.z), this.z);
    this.mesh.rotation.y = this.heading;
  }

  #animate(dt, speed, parts) {
    this.phase += dt * (2 + speed * 2.4);
    const swing = Math.sin(this.phase) * clamp(speed * 0.22, 0, 0.65);
    parts.legL.rotation.x = swing;
    parts.legR.rotation.x = -swing;
    parts.armL.rotation.x = -swing * 0.8;
    if (this.state !== 'waiting') parts.armR.rotation.x = swing * 0.8;
  }
}
