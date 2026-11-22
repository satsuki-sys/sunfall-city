// combat.js — the consequences of violence: what Nico's shots do to the
// people and cars they hit, and the one man in Sunfall City who shoots
// back — the pier guard, who watches the case at the pier head and opens
// fire on anyone who comes for it or draws down on him first.

import * as THREE from 'three';
import { mulberry32 } from './config.js';
import { makePedMesh } from './peds.js';
import { Pistol } from './weapons.js';

export class Combat {
  constructor(scene) {
    this.pistol = new Pistol(scene);
    this.guardMesh = makePedMesh(mulberry32(4242), true);
    this.guardMesh.position.set(2.2, 0.55, 186);
    this.guardMesh.rotation.y = Math.PI;
    scene.add(this.guardMesh);
    this.guard = {
      pos: new THREE.Vector3(2.2, 0.55, 186),
      hp: 60, down: false, aggro: false, shotTimer: 1.2,
    };
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
    this.guardTracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff9a7a, transparent: true, opacity: 0 }));
    this.guardTracer.frustumCulled = false;
    scene.add(this.guardTracer);
    this.tracerFor = 0;
  }

  // The player pulls the trigger. The world passes itself so the fallout —
  // wanted stars, scattering crowds, a very angry guard — lands where it
  // belongs.
  playerShoot(world) {
    const player = world.player;
    if (player.driving || this.pistol.cooldown > 0) return;
    const targets = [];
    for (const ped of world.peds.list) {
      if (ped.down) continue;
      targets.push({ kind: 'ped', obj: ped, x: ped.pos.x, y: ped.pos.y + 1.05, z: ped.pos.z, r: 0.62 });
    }
    if (!this.guard.down) {
      targets.push({ kind: 'guard', obj: this.guard, x: this.guard.pos.x, y: 1.6, z: this.guard.pos.z, r: 0.66 });
    }
    for (const car of world.allCars()) {
      targets.push({ kind: 'car', obj: car, x: car.pos.x, y: 0.75, z: car.pos.z, r: 2.0 });
    }
    const hit = this.pistol.fire(player.eye(), player.aimDir(), targets, world.audio);
    world.peds.scatter(player.pos.x, player.pos.z, 15);
    world.commitCrime(1, 'shots fired');
    if (!hit) return;
    const t = hit.target;
    if (t.kind === 'ped') {
      t.obj.hp -= 55;
      if (t.obj.hp <= 0) { world.peds.knockDown(t.obj); world.commitCrime(1, 'a pedestrian shot'); }
      else { t.obj.fleeFor = 3; t.obj.fleeFrom = { x: player.pos.x, z: player.pos.z }; }
    } else if (t.kind === 'guard') {
      this.guard.hp -= 34;
      this.guard.aggro = true;
      if (this.guard.hp <= 0 && !this.guard.down) {
        this.guard.down = true;
        this.guardMesh.rotation.x = -Math.PI / 2;
        this.guardMesh.position.y = 0.75;
        world.commitCrime(2, 'the pier guard is down');
      }
    } else if (t.kind === 'car') {
      t.obj.damage = Math.min(100, t.obj.damage + 7);
      if (t.obj.driver === 'traffic') world.commitCrime(1, 'a car shot up');
    }
  }

  damagePlayer(world, amount) {
    const player = world.player;
    if (player.dead) return;
    player.hp -= amount;
    world.hud.flashDamage();
    if (player.hp <= 0) { player.hp = 0; world.onDowned(); }
  }

  update(dt, world) {
    this.pistol.update(dt);
    if (this.tracerFor > 0) { this.tracerFor -= dt; if (this.tracerFor <= 0) this.guardTracer.material.opacity = 0; }
    const g = this.guard;
    if (g.down) return;
    const player = world.player;
    const d = Math.hypot(player.pos.x - g.pos.x, player.pos.z - g.pos.z);
    // He watches the pier. Come close with the case in hand — or open fire —
    // and he stops watching.
    if (d < 15 && player.pos.z > 168) g.aggro = true;
    if (!g.aggro) return;
    this.guardMesh.rotation.y = Math.atan2(player.pos.x - g.pos.x, player.pos.z - g.pos.z);
    if (d > 34 || player.dead) return;
    g.shotTimer -= dt;
    if (g.shotTimer <= 0) {
      g.shotTimer = 1.05 + Math.random() * 0.5;
      world.audio.distantShot();
      const from = new THREE.Vector3(g.pos.x, 1.65, g.pos.z);
      const to = player.driving
        ? new THREE.Vector3(player.pos.x, 1, player.pos.z)
        : new THREE.Vector3(player.pos.x, 1.3, player.pos.z);
      const pos = this.guardTracer.geometry.attributes.position;
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, to.x, to.y, to.z);
      pos.needsUpdate = true;
      this.guardTracer.material.opacity = 0.8;
      this.tracerFor = 0.06;
      const hitChance = d < 12 ? 0.6 : d < 22 ? 0.42 : 0.26;
      if (Math.random() < hitChance) this.damagePlayer(world, 6 + Math.random() * 6);
    }
  }
}
