// weapons.js — the pistol: a hitscan gun with a 220 ms cadence, a muzzle
// flash at the barrel and a bright impact flash where the round lands. The
// world hands it a list of target groups (pedestrians, the pier guard, cars)
// tagged through userData; the gun raycasts, reports what it hit, and lets
// combat decide what the hit means. There is no magazine to manage — Rook's
// problems in Sunfall City are never a shortage of bullets.

import * as THREE from 'three';
import { makeGlowTexture } from './city.js';

const CADENCE = 0.22;
const RANGE = 90;

function flashSprite(color, scale) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), color, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.scale.setScalar(scale);
  return s;
}

export class Gun {
  constructor(scene, audio) {
    this.audio = audio;
    this.cooldown = 0;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = RANGE;
    this.muzzle = flashSprite(0xffd9a0, 0.7);
    this.impact = flashSprite(0xffe9b0, 1.1);
    this.impactLight = new THREE.PointLight(0xffc873, 0, 12);
    scene.add(this.muzzle, this.impact, this.impactLight);
    this.muzzleLife = 0;
    this.impactLife = 0;
  }

  get ready() {
    return this.cooldown <= 0;
  }

  // Fire from origin along dir (both Vector3). targets is an array of
  // groups whose userData carries {kind, ref}. Returns the hit record
  // {kind, ref, point} or null for a clean miss into the skyline.
  fire(world, origin, dir, targets) {
    if (!this.ready) return null;
    this.cooldown = CADENCE;
    this.audio.shot();
    this.muzzle.position.copy(origin);
    this.muzzleLife = 0.06;
    this.muzzle.material.opacity = 0.95;

    this.raycaster.set(origin, dir);
    const hits = this.raycaster.intersectObjects(targets, true);
    let result = null;
    for (const hit of hits) {
      let node = hit.object;
      while (node && !node.userData.kind) node = node.parent;
      if (!node) continue;
      result = { kind: node.userData.kind, ref: node.userData.ref, point: hit.point };
      break;
    }
    const flashAt = result ? result.point : origin.clone().add(dir.clone().multiplyScalar(24));
    this.impact.position.copy(flashAt);
    this.impactLife = 0.11;
    this.impact.material.opacity = 0.9;
    this.impactLight.position.copy(flashAt);
    this.impactLight.intensity = 14;
    if (result) world.combat.onHit(result);
    return result;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.muzzleLife > 0) {
      this.muzzleLife -= dt;
      if (this.muzzleLife <= 0) this.muzzle.material.opacity = 0;
    }
    if (this.impactLife > 0) {
      this.impactLife -= dt;
      const k = Math.max(0, this.impactLife / 0.11);
      this.impact.material.opacity = 0.9 * k;
      this.impactLight.intensity = 14 * k;
      if (this.impactLife <= 0) this.impactLight.intensity = 0;
    }
  }
}
