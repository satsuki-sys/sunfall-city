// Traffic: ordinary Sunfall drivers circling their blocks on the correct
// lanes. Each follows the four far-side lane corners around one block with
// pure-pursuit steering, keeps a smooth gap to whatever is ahead instead of
// slamming the brakes, eases off at corners when cross traffic is close,
// and honks at the player when blocked past that driver's patience.

import * as THREE from 'three';
import { BLOCK, LANE_OFF, PALETTE, clamp, wrapAngle } from './config.js';
import { Car } from './vehicles.js';

// The four lane corners around a block, in driving order (block on the right).
export function blockLoop(cx, cz) {
  const x0 = cx - BLOCK / 2, x1 = cx + BLOCK / 2;
  const z0 = cz - BLOCK / 2, z1 = cz + BLOCK / 2;
  return [
    new THREE.Vector3(x1 + LANE_OFF, 0, z1 + LANE_OFF),
    new THREE.Vector3(x1 + LANE_OFF, 0, z0 - LANE_OFF),
    new THREE.Vector3(x0 - LANE_OFF, 0, z0 - LANE_OFF),
    new THREE.Vector3(x0 - LANE_OFF, 0, z1 + LANE_OFF),
  ];
}

const CELLS_X = [-160, -96, -32, 32, 96, 160];
const CELLS_Z = [-160, -96, -32, 32, 96];

export class Traffic {
  constructor(scene, rng, count = 10) {
    this.scene = scene;
    this.drivers = [];
    for (let i = 0; i < count; i++) {
      const cx = rng.pick(CELLS_X), cz = rng.pick(CELLS_Z);
      const wp = blockLoop(cx, cz);
      const seg = rng.int(0, 3);
      const a = wp[seg], b = wp[(seg + 1) % 4];
      const t = rng.range(0.15, 0.85);
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const angle = Math.atan2(b.x - a.x, -(b.z - a.z));
      const car = new Car(scene, {
        x, z, angle,
        color: rng.pick(PALETTE.carPaints),
        maxSpeed: 13, accel: 8, occupant: 'traffic',
      });
      car.driver = {
        wp, i: (seg + 1) % 4, corner: { x: cx, z: cz },
        cruise: rng.range(7.5, 11.5),
        patience: rng.range(2, 5.5),
        blockedTime: 0,
      };
      this.drivers.push(car);
    }
  }

  cars() {
    return this.drivers;
  }

  // The player took this car: it stops being traffic.
  release(car) {
    const i = this.drivers.indexOf(car);
    if (i >= 0) this.drivers.splice(i, 1);
    car.driver = null;
  }

  update(dt, world) {
    const obstacles = world.allCars();
    for (const car of this.drivers) {
      const d = car.driver;
      const target = d.wp[d.i];
      const dx = target.x - car.pos.x, dz = target.z - car.pos.z;
      const distToWp = Math.hypot(dx, dz);
      if (distToWp < 7) d.i = (d.i + 1) % 4;

      const desired = Math.atan2(dx, -dz);
      const steer = clamp(wrapAngle(desired - car.angle) * 2.0, -1, 1);

      // Gap keeping: the nearest thing ahead in my lane sets my speed.
      const fx = Math.sin(car.angle), fz = -Math.cos(car.angle);
      const rx = -fz, rz = fx;
      let want = d.cruise;
      let blocker = null;
      for (const other of obstacles) {
        if (other === car) continue;
        const ox = other.pos.x - car.pos.x, oz = other.pos.z - car.pos.z;
        const lon = ox * fx + oz * fz;
        const lat = ox * rx + oz * rz;
        if (lon > 0.5 && lon < 14 && Math.abs(lat) < 2.0) {
          const follow = lon < 5 ? 0 : other.speed + (lon - 5) * 0.55;
          if (follow < want) {
            want = Math.max(0, follow);
            blocker = other;
          }
        }
      }
      // Junction caution: slow for anything crossing near my corner.
      if (distToWp < 11) {
        for (const other of obstacles) {
          if (other === car) continue;
          const cd = Math.hypot(other.pos.x - target.x, other.pos.z - target.z);
          if (cd < 8.5 && Math.abs(other.speed) > 0.5) {
            want = Math.min(want, 3.2);
            break;
          }
        }
      }
      // Honking: blocked by the player's car past my patience.
      if (blocker && blocker.occupant === 'player' && want < 0.6) {
        d.blockedTime += dt;
        if (d.blockedTime > d.patience) {
          world.audio.horn(0.3 + Math.random() * 0.25);
          d.blockedTime = -1.5;
          d.patience = 2 + Math.random() * 3.5;
        }
      } else {
        d.blockedTime = Math.max(0, d.blockedTime - dt * 0.5);
      }

      const throttle = car.speed < want ? 0.75 : car.speed > want + 0.8 ? -0.55 : 0;
      car.update(dt, { throttle, steer, handbrake: false }, world.colliders);
    }
  }
}
