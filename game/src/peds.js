// peds.js — the crowd. Thirty-six Sunfallers in sun hats and caps stroll
// the pavements in loops around their blocks, a few walk the boardwalk and
// the pier, all of them scatter from gunfire and dive from cars, and all of
// them cost the driver money and attention if they are run down.

import * as THREE from 'three';
import { BLOCK_CENTERS, clamp, mulberry32, turnToward, wrapAngle } from './config.js';
import { groundHeightAt, resolveCollisions } from './city.js';

const SHIRTS = [0xe8e0cc, 0xd94f30, 0x2f6fb2, 0xf2c14e, 0x3f9e63, 0xe07bc0, 0x37a6a0, 0xf2f2f2];
const SKINS = [0xe8b88a, 0xc68863, 0x8a5a3b, 0xf0c8a0, 0x6e4530];

export function makePedMesh(rng, guard = false) {
  const g = new THREE.Group();
  const shirt = guard ? 0x2c3440 : SHIRTS[(rng() * SHIRTS.length) | 0];
  const skin = SKINS[(rng() * SKINS.length) | 0];
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26),
    new THREE.MeshLambertMaterial({ color: shirt }));
  torso.position.y = 1.02; torso.castShadow = true;
  g.add(torso);
  const legs = [];
  for (const sx of [-0.11, 0.11]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, 0.2),
      new THREE.MeshLambertMaterial({ color: guard ? 0x22262b : 0x4a4238 }));
    leg.geometry.translate(0, -0.36, 0);
    leg.position.set(sx, 0.72, 0);
    g.add(leg); legs.push(leg);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10),
    new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.52; head.castShadow = true;
  g.add(head);
  if (guard) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.09, 10),
      new THREE.MeshLambertMaterial({ color: 0x1d2733 }));
    cap.position.y = 1.66; g.add(cap);
    const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.95),
      new THREE.MeshLambertMaterial({ color: 0x191d20 }));
    rifle.position.set(0.3, 1.12, 0.3); rifle.rotation.x = 0.25;
    g.add(rifle);
  } else if (rng() < 0.6) {
    // A wide-brimmed sun hat.
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.04, 12),
      new THREE.MeshLambertMaterial({ color: 0xe8d9a8 }));
    brim.position.y = 1.64; g.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.14, 10),
      new THREE.MeshLambertMaterial({ color: 0xe8d9a8 }));
    crown.position.y = 1.72; g.add(crown);
  } else {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.19, 0.1, 10),
      new THREE.MeshLambertMaterial({ color: SHIRTS[(rng() * SHIRTS.length) | 0] }));
    cap.position.y = 1.65; g.add(cap);
  }
  g.userData.legs = legs;
  return g;
}

class Ped {
  constructor(mesh, path, speed, phase) {
    this.mesh = mesh;
    this.path = path;              // [{x,z}, ...] looped waypoints
    this.wp = 0;
    this.speed = speed;
    this.pos = new THREE.Vector3(path[0].x, 0, path[0].z);
    this.heading = phase;
    this.hp = 100;
    this.down = false;
    this.fleeFor = 0;
    this.fleeFrom = null;
    this.walkPhase = phase * 7;
  }
}

export class Peds {
  constructor(scene, seed, colliders) {
    this.colliders = colliders;
    this.rng = mulberry32(seed * 101 + 3);
    this.list = [];
    const rng = this.rng;
    // Pavement loops: a ring around a block, just outside its slab.
    const ringFor = (bx, bz) => {
      const o = 23.5;
      return [
        { x: bx - o, z: bz - o }, { x: bx + o, z: bz - o },
        { x: bx + o, z: bz + o }, { x: bx - o, z: bz + o },
      ];
    };
    let made = 0;
    for (const bx of BLOCK_CENTERS) for (const bz of BLOCK_CENTERS) {
      const n = 2;
      for (let i = 0; i < n && made < 30; i++) {
        const mesh = makePedMesh(rng);
        scene.add(mesh);
        const path = ringFor(bx, bz);
        const ped = new Ped(mesh, path, 1.1 + rng() * 0.5, rng() * Math.PI * 2);
        ped.wp = (rng() * 4) | 0;
        ped.pos.set(
          path[ped.wp].x + (rng() - 0.5) * 8, 0,
          path[ped.wp].z + (rng() - 0.5) * 8,
        );
        this.list.push(ped); made++;
      }
    }
    // Boardwalk and pier strollers walk a straight line and turn at the end.
    for (let i = 0; i < 6; i++) {
      const mesh = makePedMesh(rng);
      scene.add(mesh);
      const onPier = i >= 4;
      const path = onPier
        ? [{ x: 1.8, z: 126 }, { x: 1.8, z: 182 }]
        : [{ x: -100 + i * 34, z: 119 + (i % 2) * 5 }, { x: -84 + i * 34, z: 119 + (i % 2) * 5 }];
      const ped = new Ped(mesh, path, 1 + rng() * 0.4, rng() * 3);
      this.list.push(ped);
    }
  }

  scatter(x, z, radius = 16) {
    for (const ped of this.list) {
      if (ped.down) continue;
      if (Math.hypot(ped.pos.x - x, ped.pos.z - z) < radius) {
        ped.fleeFor = 2.5 + this.rng() * 1.5;
        ped.fleeFrom = { x, z };
      }
    }
  }

  update(dt, world) {
    const cars = world.allCars();
    for (const ped of this.list) {
      if (ped.down) continue;
      let speed = ped.speed;
      let target;
      if (ped.fleeFor > 0 && ped.fleeFrom) {
        ped.fleeFor -= dt;
        const dx = ped.pos.x - ped.fleeFrom.x, dz = ped.pos.z - ped.fleeFrom.z;
        const d = Math.hypot(dx, dz) || 1;
        target = { x: ped.pos.x + (dx / d) * 6, z: ped.pos.z + (dz / d) * 6 };
        speed = 3.6;
      } else {
        target = ped.path[ped.wp];
        if (Math.hypot(target.x - ped.pos.x, target.z - ped.pos.z) < 0.8) {
          ped.wp = (ped.wp + 1) % ped.path.length;
          target = ped.path[ped.wp];
        }
      }
      // Dive away from a car bearing down on them.
      for (const car of cars) {
        if (Math.abs(car.speed) < 2) continue;
        const dx = ped.pos.x - car.pos.x, dz = ped.pos.z - car.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 3.2) {
          target = { x: ped.pos.x + dx * 2, z: ped.pos.z + dz * 2 };
          speed = 4.2;
        }
      }
      const want = Math.atan2(target.x - ped.pos.x, target.z - ped.pos.z);
      ped.heading = turnToward(ped.heading, want, dt * 6);
      ped.pos.x += Math.sin(ped.heading) * speed * dt;
      ped.pos.z += Math.cos(ped.heading) * speed * dt;
      resolveCollisions(ped.pos, 0.35, this.colliders);
      ped.walkPhase += dt * speed * 3.4;
      const y = groundHeightAt(ped.pos.x, ped.pos.z);
      ped.mesh.position.set(ped.pos.x, y + Math.abs(Math.sin(ped.walkPhase)) * 0.04, ped.pos.z);
      ped.mesh.rotation.y = ped.heading;
      const legs = ped.mesh.userData.legs;
      legs[0].rotation.x = Math.sin(ped.walkPhase) * 0.55;
      legs[1].rotation.x = -Math.sin(ped.walkPhase) * 0.55;

      // Run down: a car moving at any real speed puts a pedestrian down.
      for (const car of cars) {
        if (Math.abs(car.speed) < 3.5) continue;
        if (Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z) < 1.25) {
          this.knockDown(ped);
          world.onPedRunOver(car);
          break;
        }
      }
    }
  }

  knockDown(ped) {
    if (ped.down) return;
    ped.down = true;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.25;
  }

  // The nearest standing pedestrian to a point, for the taxi rank and the
  // weapons code to share.
  nearestStanding(x, z, maxDist) {
    let best = null, bestD = maxDist;
    for (const ped of this.list) {
      if (ped.down) continue;
      const d = Math.hypot(ped.pos.x - x, ped.pos.z - z);
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best;
  }
}
