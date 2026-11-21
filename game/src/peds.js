// peds.js — the crowd. Thirty-six Sunfall pedestrians, low-poly figures in
// sun hats and caps, stroll the sidewalks on the same grid logic the traffic
// uses, one pavement over. They keep to the kerb lines, turn corners at
// junctions, scatter in panic when a shot cracks nearby or a car mounts the
// pavement at them, and fall when a car actually hits them — the world hears
// about that and answers with a fine and the police. Each figure is a small
// group of boxes: legs, torso in a bright shirt, head, and a hat.

import * as THREE from 'three';
import { STREETS_X, AVENUES_Z, TUNE, makeRng } from './config.js';

const SHIRTS = [0xd95f4b, 0x3f7fbf, 0xe0a83c, 0x4da167, 0xd4698b, 0xeeeee2, 0x2f9e97, 0x8e5ea2];
const SKIN = [0xe8b98d, 0xc98a5e, 0x8a5a34, 0xf0c8a0];
const WALK_OFF = 10.6; // kerb line: road half (8) + a pavement stride

// One shared low-poly person, tinted per instance. Returns the group plus
// the parts the animator swings.
function buildFigure(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: SHIRTS[(rng() * SHIRTS.length) | 0], roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: SKIN[(rng() * SKIN.length) | 0], roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 1 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.2), dark);
  legL.position.set(-0.11, 0.36, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirt);
  torso.position.y = 1.03;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.56;
  head.castShadow = true;
  g.add(legL, legR, torso, head);
  if (rng() < 0.55) { // a wide-brimmed sun hat
    const hatMat = new THREE.MeshStandardMaterial({ color: 0xe8d9ae, roughness: 1 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.05, 12), hatMat);
    brim.position.y = 1.7;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.16, 12), hatMat);
    top.position.y = 1.78;
    g.add(brim, top);
  } else { // a baseball cap
    const capMat = new THREE.MeshStandardMaterial({ color: SHIRTS[(rng() * SHIRTS.length) | 0], roughness: 0.9 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, 1.25), capMat);
    cap.position.y = 1.58;
    const peak = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.24), capMat);
    peak.position.set(0, 1.62, 0.26);
    g.add(cap, peak);
  }
  return { group: g, legL, legR };
}

class Pedestrian {
  constructor(scene, rng) {
    const fig = buildFigure(rng);
    this.group = fig.group;
    this.legL = fig.legL;
    this.legR = fig.legR;
    scene.add(this.group);
    this.heading = 0;
    this.speed = 1.1 + rng() * 0.7;
    this.panic = 0;      // seconds of fleeing left
    this.down = false;   // knocked down by a car
    this.downTimer = 0;
    this.walkPhase = rng() * Math.PI * 2;
    // Start on a random kerb, walking a random way.
    if (rng() < 0.5) {
      this.axis = 'x';
      this.line = AVENUES_Z[(rng() * AVENUES_Z.length) | 0];
      this.dir = rng() < 0.5 ? 1 : -1;
      this.side = rng() < 0.5 ? 1 : -1;
      this.group.position.set(-180 + rng() * 360, 0, this.line + this.side * WALK_OFF);
    } else {
      this.axis = 'z';
      this.line = STREETS_X[(rng() * STREETS_X.length) | 0];
      this.dir = rng() < 0.5 ? 1 : -1;
      this.side = rng() < 0.5 ? 1 : -1;
      this.group.position.set(this.line + this.side * WALK_OFF, 0, -180 + rng() * 300);
    }
  }

  get pos() { return this.group.position; }

  // Something frightening happened nearby: run from it for a few seconds.
  startle(fromX, fromZ) {
    if (this.down) return;
    const dx = this.pos.x - fromX, dz = this.pos.z - fromZ;
    if (Math.hypot(dx, dz) < 16) {
      this.panic = 2.2;
      this.fleeHeading = Math.atan2(dx, dz);
    }
  }

  knockDown() {
    if (this.down) return;
    this.down = true;
    this.downTimer = 7;
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.y = 0.25;
  }

  update(dt, rng) {
    if (this.down) {
      this.downTimer -= dt;
      if (this.downTimer <= 0) { // bruised, furious, but upright again
        this.down = false;
        this.group.rotation.x = 0;
        this.group.position.y = 0;
      }
      return;
    }
    let speed = this.speed;
    if (this.panic > 0) {
      this.panic -= dt;
      speed = 4.6;
      this.heading += (((this.fleeHeading - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 6);
    } else {
      // Stroll the kerb: hold the line, and at a junction sometimes turn.
      const targetHeading = this.axis === 'x'
        ? (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
        : (this.dir > 0 ? 0 : Math.PI);
      this.heading = targetHeading;
      if (this.axis === 'x') this.group.position.z = this.line + this.side * WALK_OFF;
      else this.group.position.x = this.line + this.side * WALK_OFF;
      const lines = this.axis === 'x' ? STREETS_X : AVENUES_Z;
      const pos = this.axis === 'x' ? this.pos.x : this.pos.z;
      for (const l of lines) {
        if (Math.abs(l - pos) < 0.6 && rng() < 0.006) {
          // Turn the corner onto the crossing pavement.
          const oldAxis = this.axis;
          this.axis = oldAxis === 'x' ? 'z' : 'x';
          this.line = l;
          this.dir = rng() < 0.5 ? 1 : -1;
          this.side = rng() < 0.5 ? 1 : -1;
          if (this.axis === 'z') this.group.position.x = this.line + this.side * WALK_OFF;
          else this.group.position.z = this.line + this.side * WALK_OFF;
          break;
        }
      }
      // Turn back at the edges of the world.
      if (this.pos.x > 186 || this.pos.x < -186 || this.pos.z > 130 || this.pos.z < -186) {
        this.dir *= -1;
        if (this.axis === 'x') this.heading = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        else this.heading = this.dir > 0 ? 0 : Math.PI;
      }
    }
    this.group.position.x += Math.sin(this.heading) * speed * dt;
    this.group.position.z += Math.cos(this.heading) * speed * dt;
    this.group.rotation.y = this.heading;
    // A little walk cycle: legs swing, body bobs.
    this.walkPhase += dt * speed * 3.4;
    const swing = Math.sin(this.walkPhase) * 0.5;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.group.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.04;
  }
}

export class Peds {
  constructor(world) {
    const rng = makeRng(world.seed * 13 + 5);
    this.rng = rng;
    this.people = [];
    for (let i = 0; i < TUNE.pedCount; i++) {
      this.people.push(new Pedestrian(world.scene, rng));
    }
  }

  // A gunshot or a near miss: everyone in earshot runs.
  startleAll(x, z) {
    for (const ped of this.people) ped.startle(x, z);
  }

  update(dt) {
    for (const ped of this.people) ped.update(dt, this.rng);
  }
}
