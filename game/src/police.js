// police.js — Sunfall PD and the wanted system. The world raises the wanted
// level (one to five stars) when crimes are committed in the open; this
// module turns stars into patrol cars. Each star fields a cruiser, up to
// four, spawned on streets near the player and driven by a pursuit steer
// that aims where the player is heading, not just where they are. Cruisers
// ram: contact at speed hurts. When the player is slow or on foot with a
// cruiser close, the bust meter fills; when the player breaks sight for
// long enough, the heat cools a star at a time. All of that state lives
// here; the world reads it to drive the HUD and the end screens.

import { Car } from './vehicles.js';
import { STREETS_X, AVENUES_Z, TUNE } from './config.js';

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

export class Police {
  constructor(world) {
    this.world = world;
    this.stars = 0;          // the wanted level, 0..5
    this.cruisers = [];      // live Car objects with the light bars
    this.bust = 0;           // 0..1, the bust meter
    this.sinceCrime = 0;     // seconds since the last witnessed crime
    this.sinceSeen = 0;      // seconds since a cruiser last had eyes on us
    this.nearest = Infinity; // distance of the closest cruiser this frame
  }

  get active() {
    return this.stars > 0;
  }

  // The world calls this when the player commits a crime in the open:
  // shooting, stealing, running someone down, ramming a cruiser.
  raise(amount) {
    this.stars = Math.min(5, this.stars + amount);
    this.sinceCrime = 0;
    this.sinceSeen = 0;
  }

  clear() {
    this.stars = 0;
    this.bust = 0;
    this.sinceCrime = 0;
    this.sinceSeen = 0;
  }

  // Put a cruiser on a street a little way from the player, facing them.
  spawnCruiser() {
    const p = this.world.player.pos;
    const car = new Car(this.world.scene, { police: true });
    const street = STREETS_X[Math.floor(Math.random() * STREETS_X.length)];
    const avenue = AVENUES_Z[Math.floor(Math.random() * AVENUES_Z.length)];
    const spots = [
      { x: street + 4, z: p.z - 55 }, { x: street - 4, z: p.z + 55 },
      { x: p.x - 55, z: avenue + 4 }, { x: p.x + 55, z: avenue - 4 },
    ];
    let spot = spots[Math.floor(Math.random() * spots.length)];
    spot.x = clamp(spot.x, -184, 184);
    spot.z = clamp(spot.z, -184, 126);
    const heading = Math.atan2(p.x - spot.x, p.z - spot.z);
    car.setPosition(spot.x, spot.z, heading);
    car.speed = 10;
    this.cruisers.push(car);
  }

  update(dt, elapsed) {
    const world = this.world;
    const target = world.playerCar || world.player;
    const tp = target.pos;
    const tvx = target === world.player ? 0 : target.forwardX() * target.speed;
    const tvz = target === world.player ? 0 : target.forwardZ() * target.speed;

    // Field as many cruisers as the stars demand (and never more than 4).
    const wanted = Math.min(4, this.stars);
    while (this.cruisers.length < wanted) this.spawnCruiser();
    while (this.cruisers.length > wanted) {
      const car = this.cruisers.pop();
      car.destroy(world.scene);
    }

    this.nearest = Infinity;
    let anyEyes = false;
    for (const car of this.cruisers) {
      const dx = tp.x - car.pos.x, dz = tp.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      this.nearest = Math.min(this.nearest, dist);
      if (dist < 70) anyEyes = true;
      // A cruiser hopelessly far behind is quietly replaced nearer by.
      if (dist > 240 && this.stars > 0) {
        const heading = Math.atan2(tp.x - car.pos.x, tp.z - car.pos.z);
        car.setPosition(
          clamp(tp.x - Math.sin(heading) * 60, -184, 184),
          clamp(tp.z - Math.cos(heading) * 60, -184, 126),
          heading);
      }
      // Pursuit: aim at the target's near-future position.
      const lead = clamp(dist * 0.04, 0, 0.9);
      const aimX = tp.x + tvx * lead, aimZ = tp.z + tvz * lead;
      const desired = Math.atan2(aimX - car.pos.x, aimZ - car.pos.z);
      const steer = clamp(angleDiff(desired, car.heading) * 1.9, -1, 1);
      const topSpeed = 24 + this.stars * 1.2;
      const throttle = car.speed < topSpeed ? 0.95 : 0;
      car.update(dt, { throttle, steer, handbrake: Math.abs(steer) > 0.9 && car.speed > 14 });
      car.updateVisual(elapsed);
    }

    // Heat bookkeeping: stars cool one at a time once the player has been
    // neither seen nor caught committing anything for a good while.
    this.sinceCrime += dt;
    if (anyEyes) this.sinceSeen = 0; else this.sinceSeen += dt;
    if (this.stars > 0 && this.sinceCrime > TUNE.wantedDecaySeconds && this.sinceSeen > 9) {
      this.stars -= 1;
      this.sinceCrime = TUNE.wantedDecaySeconds - 6; // next star a little sooner
      if (this.stars === 0) this.bust = 0;
      world.onHeatCooled?.();
    }

    // The bust meter: a cruiser on top of a slow or foot-bound player.
    const playerSpeed = world.playerCar ? Math.abs(world.playerCar.speed) : world.player.speedNow;
    const inReach = this.nearest < (world.playerCar ? 7.5 : 6);
    if (this.stars > 0 && inReach && playerSpeed < 2.2) {
      this.bust = Math.min(1, this.bust + dt / TUNE.bustFillSeconds);
    } else {
      this.bust = Math.max(0, this.bust - dt / (TUNE.bustFillSeconds * 0.8));
    }
    if (this.bust >= 1) world.onBusted?.();
  }
}
