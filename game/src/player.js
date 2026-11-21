// player.js — Rook, the player character: a low-poly figure in a teal shirt
// and a straw sun hat, moved on foot by the world each frame. This module
// owns the figure, its walk cycle, and the circle-versus-building collision
// the whole game shares (cars use the same push-out). The camera lives in
// world.js; the player only walks, turns to face the walk, and stays out of
// the walls.

import * as THREE from 'three';
import { TUNE, CITY } from './config.js';

// Push a circle at pos (a Vector3, y ignored) out of every building box it
// overlaps. Returns true if it touched anything, which callers use for
// impact sounds and damage.
export function resolveCircleCollisions(pos, radius, colliders) {
  let touched = false;
  for (const b of colliders) {
    const nx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const nz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    touched = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * radius;
      pos.z = nz + (dz / d) * radius;
    } else {
      // Centre inside the box: leave by the nearest face.
      const left = pos.x - b.minX, right = b.maxX - pos.x;
      const top = pos.z - b.minZ, bottom = b.maxZ - pos.z;
      const m = Math.min(left, right, top, bottom);
      if (m === left) pos.x = b.minX - radius;
      else if (m === right) pos.x = b.maxX + radius;
      else if (m === top) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    }
  }
  return touched;
}

// Keep a position inside the playable ground: the city, the beach, and the
// pier deck — but not the open sea.
export function clampToWorld(pos, radius) {
  const onPier = Math.abs(pos.x - CITY.pierX) < 5.4 && pos.z > CITY.beachZ;
  pos.x = Math.max(CITY.minX - 60, Math.min(CITY.maxX + 60, pos.x));
  pos.z = Math.max(CITY.minZ - 10, pos.z);
  const zMax = onPier ? CITY.pierEndZ - 1 : CITY.waterZ + 3;
  pos.z = Math.min(zMax, pos.z);
  if (!onPier && pos.z > CITY.waterZ) pos.z = CITY.waterZ; // the shoreline
  pos.x = Math.max(-268, Math.min(268, pos.x));
  return pos;
}

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xc98a5e, roughness: 0.8 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x1f7a72, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 1 });
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.74, 0.21), dark);
    this.legL.position.set(-0.12, 0.37, 0);
    this.legR = this.legL.clone();
    this.legR.position.x = 0.12;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.64, 0.32), shirt);
    torso.position.y = 1.05;
    torso.castShadow = true;
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.17), shirt);
    armR.position.set(0.37, 1.02, 0.05);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin);
    head.position.y = 1.6;
    head.castShadow = true;
    const hatMat = new THREE.MeshStandardMaterial({ color: 0xe8d9ae, roughness: 1 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.05, 14), hatMat);
    brim.position.y = 1.74;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.17, 14), hatMat);
    top.position.y = 1.83;
    // The pistol, carried low in the right hand.
    const pistol = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.12, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.4, metalness: 0.6 }));
    pistol.position.set(0.37, 0.78, 0.22);
    this.group.add(this.legL, this.legR, torso, armR, head, brim, top, pistol);
    scene.add(this.group);

    this.heading = Math.PI; // facing north at the spawn
    this.speedNow = 0;
    this.walkPhase = 0;
  }

  get pos() { return this.group.position; }

  setPosition(x, z, heading) {
    this.group.position.set(x, 0, z);
    if (heading !== undefined) this.heading = heading;
    this.group.rotation.y = this.heading;
  }

  // Turn the figure to look along a world-space direction.
  faceTowards(x, z) {
    this.heading = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.group.rotation.y = this.heading;
  }

  // Walk one step. moveX/moveZ is a normalized wish direction in world
  // space (already camera-relative); sprint picks the faster pace. Building
  // push-out and the world clamp are applied here.
  update(dt, moveX, moveZ, sprint, colliders) {
    const moving = Math.abs(moveX) > 0.01 || Math.abs(moveZ) > 0.01;
    const speed = sprint ? TUNE.sprintSpeed : TUNE.walkSpeed;
    this.speedNow = moving ? speed : 0;
    if (moving) {
      const target = Math.atan2(moveX, moveZ);
      let diff = target - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, dt * 12);
      this.group.position.x += moveX * speed * dt;
      this.group.position.z += moveZ * speed * dt;
      this.walkPhase += dt * speed * 2.6;
    }
    resolveCircleCollisions(this.group.position, TUNE.playerRadius, colliders);
    clampToWorld(this.group.position, TUNE.playerRadius);
    this.group.rotation.y = this.heading;
    const swing = moving ? Math.sin(this.walkPhase) * 0.55 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.group.position.y = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.05 : 0;
  }

  setVisible(v) {
    this.group.visible = v;
  }
}
