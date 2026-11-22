// weapons.js — Nico's pistol: a hitscan shot with a muzzle flash, a tracer
// that hangs in the air for a frame, and an impact flash where the round
// lands. What a hit means — for pedestrians, for the pier guard, for cars —
// is combat.js's business; this file only answers "what did the shot hit?"

import * as THREE from 'three';

export class Pistol {
  constructor(scene) {
    this.scene = scene;
    this.cooldown = 0;
    this.flash = null;
    this.flashFor = 0;
    this.tracer = null;
    this.tracerFor = 0;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
    this.tracerLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    this.tracerLine.frustumCulled = false;
    scene.add(this.tracerLine);
    this.impact = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0xffcf7a, transparent: true, opacity: 0, depthWrite: false,
    }));
    this.impact.scale.setScalar(0.7);
    scene.add(this.impact);
    this.impactFor = 0;
  }

  // Cast from the eye along the aim; targets is a list of
  // {kind:'ped'|'car'|'guard', obj, x, y, z, r} spheres. Returns the nearest
  // hit or null, and plays the effects either way.
  fire(eye, dir, targets, audio) {
    if (this.cooldown > 0) return null;
    this.cooldown = 0.24;
    if (audio) audio.shot();
    let best = null, bestT = 90;
    for (const t of targets) {
      const ox = t.x - eye.x, oy = t.y - eye.y, oz = t.z - eye.z;
      const along = ox * dir.x + oy * dir.y + oz * dir.z;
      if (along < 0.5) continue;
      const px = eye.x + dir.x * along, py = eye.y + dir.y * along, pz = eye.z + dir.z * along;
      const d = Math.hypot(t.x - px, t.y - py, t.z - pz);
      if (d < t.r && along < bestT) { bestT = along; best = t; }
    }
    const end = new THREE.Vector3(
      eye.x + dir.x * bestT, eye.y + dir.y * bestT, eye.z + dir.z * bestT,
    );
    const muzzle = new THREE.Vector3(eye.x + dir.x * 0.7, eye.y - 0.12 + dir.y * 0.7, eye.z + dir.z * 0.7);
    const pos = this.tracerLine.geometry.attributes.position;
    pos.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
    pos.setXYZ(1, end.x, end.y, end.z);
    pos.needsUpdate = true;
    this.tracerLine.material.opacity = 0.85;
    this.tracerFor = 0.05;
    if (best) {
      this.impact.position.copy(end);
      this.impact.material.opacity = 0.95;
      this.impactFor = 0.07;
    }
    return best ? { target: best, point: end } : null;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.tracerFor > 0) { this.tracerFor -= dt; if (this.tracerFor <= 0) this.tracerLine.material.opacity = 0; }
    if (this.impactFor > 0) { this.impactFor -= dt; if (this.impactFor <= 0) this.impact.material.opacity = 0; }
  }
}
