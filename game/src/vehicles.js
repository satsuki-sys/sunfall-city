// Cars: one mesh factory and one arcade driving model, shared by the
// player's ride, the traffic and the Sunfall PD. The model is deliberately
// simple — throttle, steering that bites harder with speed, a handbrake
// that breaks the rear loose — because three different drivers use it and
// all of them have to feel like the same city.

import * as THREE from 'three';
import { clamp, forwardOf } from './config.js';
import { groundHeightAt, collideCircle, glowSprite } from './city.js';

const glassMat = new THREE.MeshLambertMaterial({ color: 0x1d2733 });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x17181c });
const chromeMat = new THREE.MeshLambertMaterial({ color: 0xb9c0c7 });
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c4 });

export function makeCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 4.2), paint);
  body.position.y = 0.58;
  body.castShadow = true;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 0.7), paint);
  nose.position.set(0, 0.45, -2.2);
  g.add(nose);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.52, opts.sport ? 1.7 : 2.0), glassMat);
  cabin.position.set(0, 1.08, opts.sport ? 0.15 : -0.1);
  cabin.castShadow = true;
  g.add(cabin);
  if (opts.sport) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.4), new THREE.MeshLambertMaterial({ color: 0x22242a }));
    spoiler.position.set(0, 1.0, 2.0);
    g.add(spoiler);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const wheelPos = [[-0.85, -1.35], [0.85, -1.35], [-0.85, 1.35], [0.85, 1.35]];
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(wheelGeo, tyreMat);
    w.position.set(wheelPos[i][0], 0.34, wheelPos[i][1]);
    g.add(w);
    wheels.push(w);
  }
  // Headlights and their glow.
  for (const sx of [-0.58, 0.58]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), headMat);
    lamp.position.set(sx, 0.62, -2.52);
    g.add(lamp);
    const glow = glowSprite(0xffeec2, 1.15, 0.5);
    glow.position.set(sx, 0.62, -2.62);
    g.add(glow);
  }
  // Taillights: a red strip plus a glow that flares under braking.
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd92b20 });
  for (const sx of [-0.58, 0.58]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), tailMat);
    lamp.position.set(sx, 0.68, 2.12);
    g.add(lamp);
  }
  const brakeGlow = glowSprite(0xff3524, 1.5, 0.3);
  brakeGlow.position.set(0, 0.68, 2.3);
  g.add(brakeGlow);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.18, 0.2), chromeMat);
  bumper.position.set(0, 0.32, 2.12);
  g.add(bumper);

  let barRed = null, barBlue = null, barGlowR = null, barGlowB = null;
  if (opts.police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.16, 0.5), new THREE.MeshLambertMaterial({ color: 0x22242a }));
    bar.position.set(0, 1.42, -0.1);
    g.add(bar);
    barRed = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.44), new THREE.MeshBasicMaterial({ color: 0xff2a22 }));
    barRed.position.set(-0.33, 1.44, -0.1);
    g.add(barRed);
    barBlue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.44), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    barBlue.position.set(0.33, 1.44, -0.1);
    g.add(barBlue);
    barGlowR = glowSprite(0xff3524, 3.4, 0.0);
    barGlowR.position.set(-0.4, 1.6, -0.1);
    g.add(barGlowR);
    barGlowB = glowSprite(0x3a76ff, 3.4, 0.0);
    barGlowB.position.set(0.4, 1.6, -0.1);
    g.add(barGlowB);
    // PD door roundel: a pale disc on each side.
    const discMat = new THREE.MeshBasicMaterial({ color: 0xf2f4f6 });
    for (const sx of [-0.92, 0.92]) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.34, 12), discMat);
      disc.position.set(sx, 0.62, -0.1);
      disc.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(disc);
    }
  }
  g.userData = { wheels, brakeGlow, barRed, barBlue, barGlowR, barGlowB };
  return g;
}

const _fwd = new THREE.Vector3();
const _p = new THREE.Vector3();

export class Car {
  constructor(scene, opts) {
    this.mesh = makeCarMesh(opts.color, opts);
    this.mesh.position.set(opts.x, groundHeightAt(opts.x, opts.z), opts.z);
    this.mesh.rotation.y = opts.angle ?? 0;
    scene.add(this.mesh);
    this.angle = opts.angle ?? 0;
    this.speed = 0;
    this.maxSpeed = opts.maxSpeed ?? 30;
    this.accel = opts.accel ?? 13;
    this.police = !!opts.police;
    this.sport = !!opts.sport;
    this.occupant = opts.occupant ?? null; // 'traffic' | 'police' | 'player' | null
    this.steerVis = 0;
    this.braking = false;
    this.onCrash = null; // (strength) => void, set by the world
    this.strobeT = Math.random() * 10;
  }

  get pos() {
    return this.mesh.position;
  }
  forward(out) {
    return forwardOf(this.angle, out ?? _fwd);
  }
  speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  update(dt, ctl, colliders) {
    const throttle = clamp(ctl.throttle ?? 0, -1, 1);
    const steer = clamp(ctl.steer ?? 0, -1, 1);
    const handbrake = !!ctl.handbrake;

    // Longitudinal: engine, brakes, drag.
    let force = 0;
    if (throttle > 0) force = throttle * this.accel * (this.speed < -0.5 ? 2.4 : 1);
    else if (throttle < 0) force = throttle * (this.speed > 0.5 ? 24 : this.accel * 0.8);
    let drag = this.speed * 0.32 + Math.sign(this.speed) * 0.5;
    if (Math.abs(this.speed) < 0.6 && throttle === 0) drag = this.speed * 2.2;
    this.speed += (force - drag) * dt;
    if (handbrake) {
      const drop = 17 * dt;
      this.speed = Math.abs(this.speed) <= drop ? 0 : this.speed - Math.sign(this.speed) * drop;
    }
    this.speed = clamp(this.speed, -9, this.maxSpeed);

    // Steering: authority grows with speed, the handbrake doubles it.
    const authority = clamp(this.speed / 7, -1, 1) * (handbrake ? 1.65 : 1);
    this.angle += steer * authority * 1.55 * dt;
    this.steerVis = steer;

    // Advance.
    const f = this.forward();
    this.mesh.position.x += f.x * this.speed * dt;
    this.mesh.position.z += f.z * this.speed * dt;

    // Building collision on two body circles; a hard hit reports a crash.
    if (colliders) {
      let hit = 0;
      for (const off of [1.35, -1.35]) {
        _p.copy(this.mesh.position).addScaledVector(f, off);
        const beforeX = _p.x, beforeZ = _p.z;
        collideCircle(_p, 1.02, colliders);
        const moved = Math.hypot(_p.x - beforeX, _p.z - beforeZ);
        if (moved > 0.02) {
          this.mesh.position.x += _p.x - beforeX;
          this.mesh.position.z += _p.z - beforeZ;
          hit = Math.max(hit, moved);
        }
      }
      if (hit > 0.05) {
        if (Math.abs(this.speed) > 11 && this.onCrash) this.onCrash(Math.abs(this.speed) / this.maxSpeed);
        this.speed *= 0.42;
      }
    }

    // Sit on the ground (the pier deck is a step up), aim the mesh, dress it.
    const gy = groundHeightAt(this.mesh.position.x, this.mesh.position.z);
    this.mesh.position.y += (gy - this.mesh.position.y) * Math.min(1, dt * 10);
    this.mesh.rotation.y = this.angle;
    this.mesh.rotation.z = -steer * clamp(Math.abs(this.speed) / this.maxSpeed, 0, 1) * 0.045 * Math.sign(this.speed);
    const ud = this.mesh.userData;
    const spin = (this.speed * dt) / 0.34;
    for (let i = 0; i < 4; i++) {
      ud.wheels[i].rotation.x += spin;
      if (i < 2) ud.wheels[i].rotation.y = steer * 0.42;
    }
    this.braking = (throttle < 0 && this.speed > 0.5) || handbrake;
    ud.brakeGlow.material.opacity = this.braking ? 0.95 : 0.3;
    const bs = this.braking ? 2.3 : 1.5;
    ud.brakeGlow.scale.set(bs, bs, 1);

    // Police strobes alternate red/blue.
    if (this.police && ud.barRed) {
      this.strobeT += dt * 5.2;
      const phase = Math.floor(this.strobeT) % 2 === 0;
      ud.barRed.visible = phase;
      ud.barBlue.visible = !phase;
      ud.barGlowR.material.opacity = phase ? 0.65 : 0;
      ud.barGlowB.material.opacity = phase ? 0 : 0.65;
    }
  }

  dispose(scene) {
    scene.remove(this.mesh);
  }
}

// Pairwise car-vs-car: soft circles that push apart and trade a little speed.
export function collideCarPair(a, b) {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const d2 = dx * dx + dz * dz;
  const min = 3.3;
  if (d2 >= min * min || d2 < 1e-6) return 0;
  const d = Math.sqrt(d2);
  const push = (min - d) / 2;
  const nx = dx / d, nz = dz / d;
  a.pos.x -= nx * push;
  a.pos.z -= nz * push;
  b.pos.x += nx * push;
  b.pos.z += nz * push;
  const rel = Math.abs(a.speed - b.speed);
  const avg = (a.speed + b.speed) / 2;
  a.speed = avg + (a.speed - avg) * 0.4;
  b.speed = avg + (b.speed - avg) * 0.4;
  return rel;
}
