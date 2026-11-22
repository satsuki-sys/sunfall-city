// vehicles.js — the car: its mesh and its driving model, shared by the
// player, the traffic and the police. An arcade model with real feel: the
// front wheels steer, grip fades under the handbrake so the back steps out,
// brake lights flare before a car slows, and every panel keeps a damage
// score the story's second job cares about.

import * as THREE from 'three';
import { clamp, wrapAngle } from './config.js';
import { glowTexture, resolveCollisions } from './city.js';

const glowTex = glowTexture();

const PROFILES = {
  sedan: { len: 4.4, wid: 1.9, top: 0.62, accel: 11, maxSpeed: 26, grip: 9 },
  gt: { len: 4.5, wid: 1.95, top: 0.5, accel: 15, maxSpeed: 34, grip: 10 },
  cruiser: { len: 4.7, wid: 2.0, top: 0.66, accel: 13.5, maxSpeed: 31, grip: 10 },
  taxi: { len: 4.4, wid: 1.9, top: 0.62, accel: 11, maxSpeed: 26, grip: 9 },
  hatch: { len: 3.8, wid: 1.8, top: 0.72, accel: 10, maxSpeed: 23, grip: 9 },
};

let carId = 0;

export class Car {
  constructor(kind, color) {
    this.id = carId++;
    this.kind = kind;
    const p = PROFILES[kind] || PROFILES.sedan;
    this.profile = p;
    this.len = p.len; this.wid = p.wid;
    this.pos = new THREE.Vector3();
    this.heading = 0;              // forward = (sin h, 0, cos h)
    this.speed = 0;                // signed, along the heading
    this.steer = 0;                // current front-wheel angle
    this.damage = 0;               // 0..100, dents the payout of job two
    this.driver = null;            // 'player' | 'traffic' | 'police' | null
    this.brakeLight = 0;           // 0..1 flare
    this.hornTimer = 0;

    this.mesh = this.buildMesh(kind, color);
    this.wheels = this.mesh.userData.wheels;
    this.brakeMats = this.mesh.userData.brakeMats;
    this.barMats = this.mesh.userData.barMats || null;
    this.barPhase = Math.random() * Math.PI * 2;
  }

  buildMesh(kind, color) {
    const p = PROFILES[kind] || PROFILES.sedan;
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1c2126 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x18242e, roughness: 0.1, metalness: 0.6 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(p.wid, 0.55, p.len), paint);
    body.position.y = 0.55; body.castShadow = true;
    g.add(body);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(p.wid * 0.92, 0.34, 0.9), paint);
    nose.position.set(0, 0.48, p.len / 2 + 0.18); nose.castShadow = true;
    g.add(nose);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(p.wid * 0.84, p.top, p.len * 0.46), glass);
    cabin.position.set(0, 0.82 + p.top / 2, -0.15); cabin.castShadow = true;
    g.add(cabin);
    if (kind === 'taxi') {
      const signBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3),
        new THREE.MeshBasicMaterial({ color: 0xffd94e }));
      signBox.position.set(0, 1.62, -0.15); g.add(signBox);
    }

    // Wheels: cylinders turned on their side; the front pair steers visibly.
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12);
    const wheels = [];
    const wheelPos = [
      [-p.wid / 2, p.len / 2 - 0.85, true], [p.wid / 2, p.len / 2 - 0.85, true],
      [-p.wid / 2, -p.len / 2 + 0.85, false], [p.wid / 2, -p.len / 2 + 0.85, false],
    ];
    for (const [wx, wz, front] of wheelPos) {
      const pivot = new THREE.Group();
      pivot.position.set(wx, 0.34, wz);
      const w = new THREE.Mesh(wheelGeo, dark);
      w.rotation.z = Math.PI / 2;
      w.castShadow = true;
      pivot.add(w);
      g.add(pivot);
      wheels.push({ pivot, front });
    }

    // Headlights: two small emissive discs and a shared glow sprite; tail
    // lights flare with braking.
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8 });
    for (const sx of [-0.6, 0.6]) {
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.13, 10), headMat);
      lamp.position.set(sx * p.wid * 0.55, 0.58, p.len / 2 + 0.64);
      g.add(lamp);
    }
    const glare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffe9b0, transparent: true, opacity: 0.35, depthWrite: false,
    }));
    glare.position.set(0, 0.58, p.len / 2 + 0.8); glare.scale.set(1.8, 0.8, 1);
    g.add(glare);
    const brakeMats = [];
    for (const sx of [-0.6, 0.6]) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x7a1610 });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.05), mat);
      lamp.position.set(sx * p.wid * 0.55, 0.66, -p.len / 2 - 0.03);
      g.add(lamp);
      brakeMats.push(mat);
    }

    // A cruiser's light bar: two halves that strobe against each other.
    let barMats = null;
    if (kind === 'cruiser') {
      barMats = [];
      const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.09, 0.4), dark);
      barBase.position.set(0, 1.62, -0.15); g.add(barBase);
      const cols = [0xff2a20, 0x2a6bff];
      for (let i = 0; i < 2; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: cols[i] });
        const half = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.34), mat);
        half.position.set(i === 0 ? -0.33 : 0.33, 1.74, -0.15);
        g.add(half);
        barMats.push(mat);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTex, color: cols[i], transparent: true, opacity: 0.65, depthWrite: false,
        }));
        halo.position.copy(half.position); halo.scale.setScalar(3.2);
        g.add(halo);
        barMats.push(halo.material);
      }
    }

    g.userData = { wheels, brakeMats, barMats };
    return g;
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }
  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  place(x, z, heading) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.syncMesh(0);
  }

  // controls: {throttle -1..1, steer -1..1, handbrake bool}
  update(dt, controls, colliders, others) {
    const p = this.profile;
    const targetSteer = (controls.steer || 0) * 0.52;
    this.steer += clamp(targetSteer - this.steer, -dt * 3.2, dt * 3.2);

    const throttle = controls.throttle || 0;
    if (throttle > 0) this.speed += p.accel * throttle * dt * (1 - Math.max(0, this.speed) / (p.maxSpeed * 1.15));
    else if (throttle < 0) {
      if (this.speed > 0.4) this.speed -= 26 * dt;                    // braking
      else this.speed = Math.max(this.speed + p.accel * 0.55 * throttle * dt, -9); // reverse
    }
    // Rolling drag and engine braking settle the car to a stop.
    this.speed -= this.speed * (controls.handbrake ? 1.4 : 0.22) * dt;
    if (!throttle && Math.abs(this.speed) < 0.12) this.speed = 0;
    this.speed = clamp(this.speed, -9, p.maxSpeed);

    // Steering authority fades with speed; the handbrake breaks rear grip
    // and lets the heading run ahead of the velocity (a slide).
    const speedFactor = clamp(Math.abs(this.speed) / 6, 0, 1) * (1 - clamp(Math.abs(this.speed) / 60, 0, 0.45));
    const yawRate = this.steer * 1.9 * speedFactor * Math.sign(this.speed);
    this.heading += yawRate * dt * (controls.handbrake ? 1.5 : 1);

    const grip = controls.handbrake ? 2.2 : p.grip;
    if (!this.vel) this.vel = new THREE.Vector2();
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.vel.x += (fx * this.speed - this.vel.x) * Math.min(1, grip * dt);
    this.vel.y += (fz * this.speed - this.vel.y) * Math.min(1, grip * dt);
    const prevX = this.pos.x, prevZ = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    // The scalar speed tracks the velocity's forward component after slides.
    this.speed = this.vel.x * fx + this.vel.y * fz;

    // World collision: buildings stop the car and dent it; other cars are
    // soft circles that shove both parties.
    const before = Math.abs(this.speed);
    resolveCollisions(this.pos, 1.35, colliders);
    if (others) {
      for (const other of others) {
        if (other === this) continue;
        const dx = this.pos.x - other.pos.x, dz = this.pos.z - other.pos.z;
        const d = Math.hypot(dx, dz), min = 2.5;
        if (d > 0.01 && d < min) {
          const push = (min - d) / 2;
          this.pos.x += (dx / d) * push; this.pos.z += (dz / d) * push;
          other.pos.x -= (dx / d) * push; other.pos.z -= (dz / d) * push;
          const impact = Math.abs(this.speed - other.speed);
          if (impact > 4) { this.damage = Math.min(100, this.damage + impact * 1.6); other.damage = Math.min(100, other.damage + impact); }
          this.speed *= 0.55; other.speed *= 0.7;
          if (this.onBump && impact > 3) this.onBump(impact);
        }
      }
    }
    if ((Math.abs(prevX - this.pos.x) + Math.abs(prevZ - this.pos.z)) < Math.abs(this.vel.length()) * dt * 0.25 && before > 6) {
      this.damage = Math.min(100, this.damage + before * 0.7);
      if (this.onBump) this.onBump(before);
      this.vel.multiplyScalar(0.25);
      this.speed *= 0.25;
    }

    this.brakeLight = clamp(this.brakeLight + ((throttle < 0 || controls.handbrake ? 1 : 0) - this.brakeLight) * dt * 8, 0, 1);
    this.syncMesh(dt);
  }

  syncMesh(dt) {
    this.mesh.position.copy(this.pos);
    // The mesh is modelled facing +z, and the heading measures from +z,
    // so the mesh yaw is the heading itself.
    this.mesh.rotation.y = this.heading;
    const roll = this.vel ? clamp((this.vel.x * Math.cos(this.heading) - this.vel.y * Math.sin(this.heading)) * 0.006, -0.05, 0.05) : 0;
    this.mesh.rotation.z = roll;
    for (const w of this.wheels) {
      if (w.front) w.pivot.rotation.y = this.steer;
      w.pivot.children[0].rotation.x += (this.speed * (dt || 0)) / 0.34;
    }
    const brakeCol = new THREE.Color(0x7a1610).lerp(new THREE.Color(0xff2a1a), this.brakeLight);
    for (const m of this.brakeMats) m.color.copy(brakeCol);
    if (this.barMats) {
      const t = performance.now() / 130 + this.barPhase;
      const a = (Math.sin(t) > 0) ? 1 : 0.12;
      this.barMats[0].color.setHex(0xff2a20).multiplyScalar(a > 0.5 ? 1 : 0.25);
      this.barMats[1].opacity = a > 0.5 ? 0.15 : 0.6;
      this.barMats[2].color.setHex(0x2a6bff).multiplyScalar(a > 0.5 ? 0.25 : 1);
      this.barMats[3].opacity = a > 0.5 ? 0.6 : 0.15;
    }
  }

  // Engine note for the audio engine: 0..1 across the rev range.
  rpm01() {
    const p = this.profile;
    return clamp(Math.abs(this.speed) / p.maxSpeed, 0, 1);
  }

  headingWrap() { this.heading = wrapAngle(this.heading); }
}
