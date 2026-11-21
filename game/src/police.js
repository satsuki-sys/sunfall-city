// Sunfall PD: a five-star wanted level, cruisers that hunt in packs, and
// the bust meter that fills while a cruiser has you slow and close. Stars
// fade when you stop committing crimes — faster when no cruiser can see
// you — and a full meter means a fine and a walk out of the station.

import { clamp, wrapAngle } from './config.js';
import { Car } from './vehicles.js';

export class Police {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.wanted = 0;          // 0..5, fractional while decaying
    this.lastCrimeT = 99;     // seconds since the last fresh crime
    this.cruisers = [];
    this.bust = 0;            // 0..1
    this.spawnT = 0;
  }

  stars() {
    return Math.ceil(this.wanted - 1e-6);
  }
  addCrime(amount, floor = 0) {
    this.wanted = clamp(Math.max(this.wanted + amount, floor), 0, 5);
    this.lastCrimeT = 0;
  }
  setWanted(n) {
    this.wanted = clamp(n, 0, 5);
    this.lastCrimeT = 0;
  }
  clear() {
    this.wanted = 0;
    this.bust = 0;
  }
  nearestDist() {
    const p = this.world.playerPos();
    let best = Infinity;
    for (const c of this.cruisers) {
      const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
      if (d < best) best = d;
    }
    return best;
  }

  spawnCruiser() {
    const p = this.world.playerPos();
    // Appear on a road 70–95 m away, never inside the player's view bubble.
    const avenues = [-192, -128, -64, 0, 64, 128, 192];
    const streets = [-192, -128, -64, 0, 64, 128];
    let x, z, angle;
    if (Math.random() < 0.5) {
      x = avenues[Math.floor(Math.random() * avenues.length)];
      z = clamp(p.z + (Math.random() < 0.5 ? -1 : 1) * (70 + Math.random() * 25), -230, 140);
      angle = z < p.z ? Math.PI : 0;
    } else {
      z = streets[Math.floor(Math.random() * streets.length)];
      x = clamp(p.x + (Math.random() < 0.5 ? -1 : 1) * (70 + Math.random() * 25), -230, 230);
      angle = x < p.x ? Math.PI / 2 : -Math.PI / 2;
    }
    const car = new Car(this.scene, {
      x, z, angle, color: 0xf2f4f6, police: true, maxSpeed: 31, accel: 14.5, occupant: 'police',
    });
    car.stuckT = 0;
    this.cruisers.push(car);
    return car;
  }

  update(dt) {
    const world = this.world;
    this.lastCrimeT += dt;
    // Decay: slow while cruisers are near, brisk once you've broken away.
    if (this.wanted > 0 && this.lastCrimeT > 10) {
      const near = this.nearestDist();
      const rate = near > 55 ? 1 / 7 : 1 / 26;
      this.wanted = Math.max(0, this.wanted - dt * rate);
    }
    const want = this.wanted <= 0 ? 0 : clamp(Math.ceil(this.wanted) + (this.wanted >= 3.5 ? 1 : 0), 1, 5);
    this.spawnT -= dt;
    if (this.cruisers.length < want && this.spawnT <= 0) {
      this.spawnCruiser();
      this.spawnT = 1.6;
    }
    if (this.cruisers.length > want) {
      // Dismiss the farthest cruiser once it is well away.
      let far = null, farD = 0;
      const p = world.playerPos();
      for (const c of this.cruisers) {
        const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
        if (d > farD) { farD = d; far = c; }
      }
      if (far && farD > 80) {
        far.dispose(this.scene);
        this.cruisers.splice(this.cruisers.indexOf(far), 1);
      }
    }

    const target = world.playerPos();
    const playerSpeed = world.playerSpeed();
    let busting = false;
    for (const c of this.cruisers) {
      const dx = target.x - c.pos.x, dz = target.z - c.pos.z;
      const dist = Math.hypot(dx, dz);
      let desired = Math.atan2(dx, -dz);
      // Building sense: if the straight line ahead is walled, bend the hunt.
      const aheadX = c.pos.x + Math.sin(c.angle) * 7, aheadZ = c.pos.z - Math.cos(c.angle) * 7;
      for (const b of world.colliders) {
        if (aheadX > b.minX - 1 && aheadX < b.maxX + 1 && aheadZ > b.minZ - 1 && aheadZ < b.maxZ + 1) {
          desired += 0.85;
          break;
        }
      }
      const steer = clamp(wrapAngle(desired - c.angle) * 1.7, -1, 1);
      let throttle = 1;
      if (dist < 6) throttle = playerSpeed > 1 ? 0.55 : 0.12;
      else if (Math.abs(wrapAngle(desired - c.angle)) > 1.9) throttle = -0.7; // turn around
      c.update(dt, { throttle, steer, handbrake: false }, world.colliders);
      // Unstick: a wedged cruiser is quietly replaced by a fresh one.
      if (Math.abs(c.speed) < 0.6 && dist > 16) {
        c.stuckT += dt;
        if (c.stuckT > 3) {
          c.dispose(this.scene);
          this.cruisers.splice(this.cruisers.indexOf(c), 1);
          this.spawnCruiser();
          continue;
        }
      } else c.stuckT = 0;
      if (dist < 9.5 && playerSpeed < 2.5) busting = true;
    }

    // The bust meter: fills under a cruiser's nose, drains when you run.
    if (busting && world.mode === 'playing') {
      this.bust = Math.min(1, this.bust + dt / 2.4);
      if (this.bust >= 1) world.onBusted();
    } else {
      this.bust = Math.max(0, this.bust - dt / 1.1);
    }
    // Siren wash follows the nearest cruiser.
    const near = this.nearestDist();
    world.audio.setSiren(this.wanted > 0 && near !== Infinity ? clamp(1 - near / 65, 0, 1) : 0);
  }

  disposeAll() {
    for (const c of this.cruisers) c.dispose(this.scene);
    this.cruisers = [];
  }
}
