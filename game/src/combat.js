// combat.js — violence and its consequences. This module owns the pier
// guard (the one armed man in Sunfall City besides Rook), decides what a
// bullet does to whatever it struck, and turns gunfire into police
// attention: a shot fired in the open raises the wanted level, knocks
// pedestrians down when it finds them, and wakes the guard. The guard
// shoots back in slow, deliberate rounds once he is hostile — when Rook
// fires at him, or when Rook lifts the case he is paid to watch.

import * as THREE from 'three';
import { PLACES } from './config.js';

const SHOT_WANTED_COOLDOWN = 4;

// The guard's figure: dark clothes, a cap, a rifle held across the body.
function buildGuardFigure() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.95 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.8 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.74, 0.26), dark);
  legs.position.y = 0.37;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.64, 0.32), dark);
  torso.position.y = 1.05;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.58;
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, 1.25),
    new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.9 }));
  cap.position.y = 1.6;
  const rifle = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.1, 0.95),
    new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.4, metalness: 0.5 }));
  rifle.position.set(0.18, 1.12, 0.3);
  rifle.rotation.x = 0.25;
  g.add(legs, torso, head, cap, rifle);
  return g;
}

export class Guard {
  constructor(scene) {
    this.group = buildGuardFigure();
    this.group.position.set(PLACES.pierCase.x + 2.5, 0.25, PLACES.pierCase.z - 3);
    this.group.rotation.y = Math.PI; // watching the pier approach
    scene.add(this.group);
    this.health = 100;
    this.hostile = false;
    this.dead = false;
    this.fireTimer = 1.4;
  }

  get pos() { return this.group.position; }

  takeHit(damage) {
    if (this.dead) return;
    this.health -= damage;
    this.hostile = true;
    if (this.health <= 0) {
      this.dead = true;
      this.group.rotation.x = -Math.PI / 2;
      this.group.position.y = 0.3;
    }
  }

  // Once hostile, the guard fires a round every second or so; closer
  // targets are easier to hit, and every hit costs the player health.
  update(dt, world) {
    if (this.dead || !this.hostile) return;
    const p = world.playerCar ? world.playerCar.pos : world.player.pos;
    const dist = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    if (dist > 46) return;
    this.group.rotation.y = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = 0.9 + Math.random() * 0.5;
      world.audio.shot();
      const hitChance = Math.max(0.15, 0.75 - dist * 0.014);
      if (Math.random() < hitChance) world.damagePlayer(7, 'The pier guard got you.');
    }
  }
}

export class Combat {
  constructor(world) {
    this.world = world;
    this.guard = new Guard(world.scene);
    this.shotCrimeCooldown = 0;
  }

  // The gun reports every hit here; consequences follow the kind of target.
  onHit({ kind, ref }) {
    const world = this.world;
    if (kind === 'ped') {
      ref.knockDown();
      world.onPedHit('shot');
    } else if (kind === 'guard') {
      ref.takeHit(34);
      if (ref.dead) world.onGuardDown();
    } else if (kind === 'car') {
      ref.health -= 12;
      world.audio.bump(0.5);
      if (ref.isPolice) world.police.raise(1);
    }
  }

  // A trigger pull in the open: the crowd scatters and, if the cooldown has
  // run out, the police take an interest.
  onShotFired(x, z) {
    const world = this.world;
    world.peds.startleAll(x, z);
    if (this.shotCrimeCooldown <= 0) {
      world.police.raise(1);
      this.shotCrimeCooldown = SHOT_WANTED_COOLDOWN;
    }
  }

  update(dt) {
    this.shotCrimeCooldown = Math.max(0, this.shotCrimeCooldown - dt);
    this.guard.update(dt, this.world);
  }
}
