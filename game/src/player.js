// Nico Vale on foot: WASD movement relative to the camera, a sprint, and a
// body that turns into its stride. Collision is a circle against the city's
// building boxes; the sea is fenced off by a wading limit, and the pier is
// the one way out over the water.

import * as THREE from 'three';
import { clamp, angleLerp, CITY_MIN, CITY_MAX_X, PIER_Z0, PIER_Z1 } from './config.js';
import { groundHeightAt, collideCircle } from './city.js';

export function makeFigure({ shirt, trousers, skin, cap }) {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.78, 0.26),
    new THREE.MeshLambertMaterial({ color: trousers }),
  );
  legs.position.y = 0.39;
  g.add(legs);
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.68, 0.3),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  torso.position.y = 1.12;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 10, 8),
    new THREE.MeshLambertMaterial({ color: skin }),
  );
  head.position.y = 1.66;
  g.add(head);
  if (cap) {
    const capMat = new THREE.MeshLambertMaterial({ color: cap });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    dome.position.y = 1.7;
    g.add(dome);
    const peak = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.24), capMat);
    peak.position.set(0, 1.7, -0.28);
    g.add(peak);
  }
  return g;
}

export class Player {
  constructor(scene) {
    this.mesh = makeFigure({ shirt: 0xe2703a, trousers: 0x2e3a46, skin: 0xc98a5a, cap: 0x27354a });
    this.mesh.userData.tag = 'player';
    scene.add(this.mesh);
    this.angle = Math.PI; // face south, toward the café and the sea
    this.speedNow = 0;
    this.radius = 0.55;
    this.walkCycle = 0;
  }

  get pos() {
    return this.mesh.position;
  }
  placeAt(x, z, angle) {
    this.mesh.position.set(x, groundHeightAt(x, z), z);
    if (angle !== undefined) this.angle = angle;
    this.mesh.rotation.y = this.angle;
  }

  update(dt, input, camYaw, colliders) {
    const wish = input.moveWish();
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = sprint ? 8.6 : 5.2;
    // Camera-relative movement: W walks where the camera looks.
    const fx = Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = Math.sin(camYaw);
    let mx = fx * wish.z + rx * wish.x;
    let mz = fz * wish.z + rz * wish.x;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len;
      mz /= len;
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
      this.speedNow = speed;
      const target = Math.atan2(mx, -mz);
      this.angle = angleLerp(this.angle, target, Math.min(1, dt * 10));
      this.walkCycle += dt * (sprint ? 11 : 8);
    } else {
      this.speedNow = 0;
    }
    collideCircle(this.pos, this.radius, colliders);
    // World fence: wade no deeper than the shore, except along the pier.
    this.pos.x = clamp(this.pos.x, CITY_MIN, CITY_MAX_X);
    const onPier = Math.abs(this.pos.x) < 4.6 && this.pos.z > PIER_Z0 - 4;
    this.pos.z = clamp(this.pos.z, CITY_MIN, onPier ? PIER_Z1 - 1.2 : 208);
    const gy = groundHeightAt(this.pos.x, this.pos.z);
    const bob = this.speedNow > 0 ? Math.abs(Math.sin(this.walkCycle)) * 0.06 : 0;
    this.pos.y = gy + bob;
    this.mesh.rotation.y = this.angle;
    this.mesh.rotation.z = this.speedNow > 0 ? Math.sin(this.walkCycle) * 0.035 : 0;
  }
}
