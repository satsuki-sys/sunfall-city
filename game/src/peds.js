// The crowd: thirty-six Sunfallers in sun hats and caps, each strolling the
// pavement loop around one block. They scatter from gunfire and fast cars,
// and going down under somebody's bumper is reported to the world, which
// handles the fine and the police attention.

import * as THREE from 'three';
import { BLOCK, ROAD_HALF, clamp, wrapAngle, angleLerp } from './config.js';
import { groundHeightAt } from './city.js';

const SHIRTS = [0xf2f0e6, 0xe2703a, 0x3d7bd9, 0xf2b13d, 0x53b06a, 0xe58bb1, 0x63c7c0, 0xd94f3d];
const SKINS = [0xf2c79b, 0xc98a5a, 0x8a5a34, 0x6e4226, 0xffdbb8];
const HALF = BLOCK / 2 - ROAD_HALF - 2.4; // pavement loop half-extent: 21.6

function makePedMesh(rng) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: rng.pick(SKINS) });
  const shirt = new THREE.MeshLambertMaterial({ color: rng.pick(SHIRTS) });
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.78, 0.26),
    new THREE.MeshLambertMaterial({ color: rng.pick([0x37414f, 0x70543a, 0xd8d2c4, 0x4a6741]) }),
  );
  legs.position.y = 0.39;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.3), shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.66;
  g.add(head);
  if (rng.chance(0.55)) {
    // A wide straw sun hat.
    const hatMat = new THREE.MeshLambertMaterial({ color: 0xe8cf8f });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.05, 10), hatMat);
    brim.position.y = 1.78;
    g.add(brim);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.17, 10), hatMat);
    top.position.y = 1.87;
    g.add(top);
  } else {
    // A baseball cap.
    const capMat = new THREE.MeshLambertMaterial({ color: rng.pick(SHIRTS) });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    dome.position.y = 1.7;
    g.add(dome);
    const peak = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.24), capMat);
    peak.position.set(0, 1.7, -0.28);
    g.add(peak);
  }
  g.userData.tag = 'ped';
  return g;
}

// Point at distance s along the pavement loop of a cell (perimeter walk).
function loopPoint(cx, cz, s, out) {
  const edge = (HALF * 2);
  const per = edge * 4;
  let d = ((s % per) + per) % per;
  if (d < edge) out.set(cx - HALF + d, 0, cz - HALF);
  else if (d < edge * 2) out.set(cx + HALF, 0, cz - HALF + (d - edge));
  else if (d < edge * 3) out.set(cx + HALF - (d - edge * 2), 0, cz + HALF);
  else out.set(cx - HALF, 0, cz + HALF - (d - edge * 3));
  return out;
}

const _v = new THREE.Vector3();

export class Peds {
  constructor(scene, rng, count = 36) {
    this.scene = scene;
    this.list = [];
    const cellsX = [-160, -96, -32, 32, 96, 160];
    const cellsZ = [-160, -96, -32, 32, 96];
    for (let i = 0; i < count; i++) {
      const mesh = makePedMesh(rng);
      scene.add(mesh);
      const ped = {
        mesh,
        cx: rng.pick(cellsX), cz: rng.pick(cellsZ),
        s: rng.range(0, HALF * 8),
        speed: rng.range(0.9, 1.5),
        state: 'walk',
        stateT: 0,
        fleeX: 0, fleeZ: 0,
        angle: 0,
        phase: rng.range(0, 9),
        downFor: 0,
      };
      mesh.userData.pedRef = ped;
      loopPoint(ped.cx, ped.cz, ped.s, mesh.position);
      mesh.position.y = groundHeightAt(mesh.position.x, mesh.position.z);
      this.list.push(ped);
    }
  }

  scatterFrom(x, z, radius = 15) {
    for (const ped of this.list) {
      if (ped.state === 'down') continue;
      const dx = ped.mesh.position.x - x, dz = ped.mesh.position.z - z;
      const d = Math.hypot(dx, dz);
      if (d < radius && d > 0.01) {
        ped.state = 'scatter';
        ped.stateT = 2.1;
        ped.fleeX = dx / d;
        ped.fleeZ = dz / d;
      }
    }
  }

  update(dt, t) {
    for (const ped of this.list) {
      const p = ped.mesh.position;
      if (ped.state === 'down') {
        ped.downFor += dt;
        if (ped.downFor > 40) {
          // Quietly back on their feet at the kerb, as if nothing happened.
          ped.state = 'walk';
          ped.downFor = 0;
          ped.mesh.rotation.set(0, ped.angle, 0);
          loopPoint(ped.cx, ped.cz, ped.s, p);
          p.y = groundHeightAt(p.x, p.z);
        }
        continue;
      }
      let mx = 0, mz = 0, moving = 0;
      if (ped.state === 'scatter') {
        ped.stateT -= dt;
        mx = ped.fleeX;
        mz = ped.fleeZ;
        moving = 3.6;
        if (ped.stateT <= 0) {
          ped.state = 'walk';
          // Rejoin the nearest pavement loop of the home cell from here.
          ped.s = Math.max(0, (p.x - (ped.cx - HALF)) + (p.z - (ped.cz - HALF)));
        }
      } else {
        ped.s += ped.speed * dt;
        loopPoint(ped.cx, ped.cz, ped.s, _v);
        mx = _v.x - p.x;
        mz = _v.z - p.z;
        const d = Math.hypot(mx, mz);
        if (d > 0.001) {
          mx /= d;
          mz /= d;
        }
        moving = ped.speed;
        p.x = _v.x;
        p.z = _v.z;
      }
      if (ped.state === 'scatter') {
        p.x += mx * moving * dt;
        p.z += mz * moving * dt;
      }
      if (moving > 0 && (mx !== 0 || mz !== 0)) {
        const target = Math.atan2(mx, -mz);
        ped.angle = angleLerp(ped.angle, target, Math.min(1, dt * 8));
      }
      ped.mesh.rotation.y = ped.angle;
      p.y = groundHeightAt(p.x, p.z) + Math.abs(Math.sin(t * 7 * (moving / 1.2) + ped.phase)) * 0.045;
      ped.mesh.rotation.z = Math.sin(t * 7 * (moving / 1.2) + ped.phase) * 0.04;
    }
  }

  // Put one pedestrian on the ground (a bumper or a bullet did it).
  knockDown(ped) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.downFor = 0;
    ped.mesh.rotation.set(-Math.PI / 2, 0, 0);
    ped.mesh.position.y = groundHeightAt(ped.mesh.position.x, ped.mesh.position.z) + 0.25;
  }

  // Cars call this through the world: a ped under a moving car goes down.
  checkCarHits(cars, onPedHit) {
    for (const ped of this.list) {
      if (ped.state === 'down') continue;
      const p = ped.mesh.position;
      for (const car of cars) {
        if (Math.abs(car.speed) < 3) continue;
        const dx = p.x - car.pos.x, dz = p.z - car.pos.z;
        if (dx * dx + dz * dz < 2.6 * 2.6) {
          ped.state = 'down';
          ped.downFor = 0;
          ped.mesh.rotation.set(-Math.PI / 2, 0, 0);
          ped.mesh.position.y = groundHeightAt(p.x, p.z) + 0.25;
          onPedHit(ped, car);
          break;
        }
      }
    }
  }
}
