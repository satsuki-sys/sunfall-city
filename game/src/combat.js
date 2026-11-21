// Combat's other half: the harbour guard at the pier head — the one man in
// Sunfall who carries a rifle — and what happens when bullets start
// landing. He stands his post until provoked (a shot fired near him, a hand
// on the case, Nico too close with intent), then he shoots back with
// distance-scaled accuracy until he goes down or the moment passes.

import * as THREE from 'three';
import { angleLerp, clamp } from './config.js';
import { groundHeightAt } from './city.js';
import { makeFigure } from './player.js';

export class Guard {
  constructor(scene, pos) {
    this.mesh = makeFigure({ shirt: 0x27354a, trousers: 0x1d2733, skin: 0x8a5a34, cap: 0xc8452c });
    this.mesh.userData.tag = 'guard';
    // The rifle: a long dark box carried across the body.
    const rifle = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.09, 1.05),
      new THREE.MeshLambertMaterial({ color: 0x191b1f }),
    );
    rifle.position.set(0.18, 1.18, -0.25);
    rifle.rotation.x = 0.12;
    this.mesh.add(rifle);
    this.mesh.position.copy(pos);
    this.mesh.position.y = groundHeightAt(pos.x, pos.z);
    scene.add(this.mesh);
    this.hp = 42;
    this.hostile = false;
    this.dead = false;
    this.angle = 0; // face back down the pier, toward the city
    this.mesh.rotation.y = this.angle;
    this.shotT = 0;
    this.calmT = 0;
  }

  get pos() {
    return this.mesh.position;
  }

  provoke() {
    if (!this.dead) this.hostile = true;
  }

  takeHit(dmg) {
    if (this.dead) return false;
    this.hp -= dmg;
    this.hostile = true;
    if (this.hp <= 0) {
      this.dead = true;
      this.mesh.rotation.set(-Math.PI / 2, 0, 0);
      this.mesh.position.y = groundHeightAt(this.pos.x, this.pos.z) + 0.25;
      return true;
    }
    return false;
  }

  update(dt, world) {
    if (this.dead) return;
    const player = world.playerPos();
    const dx = player.x - this.pos.x, dz = player.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (!this.hostile) {
      // Idle watch: turn slowly toward anyone strolling the pier head.
      if (dist < 12) {
        this.angle = angleLerp(this.angle, Math.atan2(dx, -dz), Math.min(1, dt * 2));
        this.mesh.rotation.y = this.angle;
      }
      return;
    }
    this.angle = angleLerp(this.angle, Math.atan2(dx, -dz), Math.min(1, dt * 6));
    this.mesh.rotation.y = this.angle;
    this.calmT += dt;
    if (dist > 46) {
      // Out of his world: after a while he lowers the rifle.
      if (this.calmT > 9) {
        this.hostile = false;
        this.calmT = 0;
      }
      return;
    }
    this.shotT -= dt;
    if (this.shotT <= 0 && dist < 34) {
      this.shotT = 0.85 + Math.random() * 0.3;
      world.guardShoot(this, clamp(0.62 - dist * 0.011, 0.18, 0.6));
    }
  }
}
