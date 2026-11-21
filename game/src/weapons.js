// The pistol and its dressing: a hitscan ray from the camera's eye, a muzzle
// flash that lights the street for a frame, a tracer that lives for a
// blink, and an impact flash wherever the round lands. The consequences of
// a hit belong to combat and the world; this file only answers "what did
// the bullet reach first".

import * as THREE from 'three';
import { glowSprite } from './city.js';

export class WeaponFX {
  constructor(scene) {
    this.scene = scene;
    this.light = new THREE.PointLight(0xffc873, 0, 20, 1.6);
    scene.add(this.light);
    this.impacts = [];
    for (let i = 0; i < 6; i++) {
      const s = glowSprite(0xffb35c, 1, 0);
      s.visible = false;
      scene.add(s);
      this.impacts.push({ sprite: s, t: 0 });
    }
    this.impactIdx = 0;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffe2ae, transparent: true, opacity: 0,
    }));
    this.tracer.frustumCulled = false;
    scene.add(this.tracer);
    this.tracerT = 0;
  }

  muzzle(pos) {
    this.light.position.copy(pos);
    this.light.intensity = 3.2;
  }
  impact(pos) {
    const slot = this.impacts[this.impactIdx++ % this.impacts.length];
    slot.sprite.position.copy(pos);
    slot.sprite.visible = true;
    slot.t = 0.16;
  }
  trace(from, to) {
    const attr = this.tracer.geometry.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    this.tracer.material.opacity = 0.85;
    this.tracerT = 0.07;
  }
  update(dt) {
    this.light.intensity = Math.max(0, this.light.intensity - dt * 26);
    for (const slot of this.impacts) {
      if (slot.t <= 0) continue;
      slot.t -= dt;
      const k = Math.max(0, slot.t / 0.16);
      slot.sprite.material.opacity = k * 0.9;
      const s = 0.5 + (1 - k) * 0.9;
      slot.sprite.scale.set(s, s, 1);
      if (slot.t <= 0) slot.sprite.visible = false;
    }
    if (this.tracerT > 0) {
      this.tracerT -= dt;
      if (this.tracerT <= 0) this.tracer.material.opacity = 0;
    }
  }
}

const _origin = new THREE.Vector3();
const _hand = new THREE.Vector3();

export class Pistol {
  constructor(scene, camera, fx) {
    this.camera = camera;
    this.fx = fx;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 75;
    this.cooldown = 0;
  }

  // Fire once. `targets` are the scene subtrees a bullet may meet; the world
  // interprets the hit. Returns the THREE intersection or null.
  fire(world, shooterPos) {
    if (this.cooldown > 0) return null;
    this.cooldown = 0.24;
    this.camera.getWorldPosition(_origin);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.raycaster.set(_origin, dir);
    const hits = this.raycaster.intersectObjects(world.shootables(), true);
    // The hand the muzzle flash hangs from: just ahead of the shooter.
    _hand.copy(shooterPos).addScaledVector(dir, 0.55);
    _hand.y = shooterPos.y + 1.38;
    this.fx.muzzle(_hand);
    let hit = null;
    for (const h of hits) {
      if (h.distance < 1.2) continue; // never the shooter's own body
      hit = h;
      break;
    }
    const end = hit ? hit.point : _origin.clone().addScaledVector(dir, 75);
    this.fx.trace(_hand, end);
    if (hit) this.fx.impact(hit.point);
    world.audio.shoot();
    return hit;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
  }
}

// Walk up from a hit mesh to the tagged ancestor the world registered.
export function tagOf(object) {
  let o = object;
  while (o) {
    if (o.userData && o.userData.tag) return o;
    o = o.parent;
  }
  return null;
}
