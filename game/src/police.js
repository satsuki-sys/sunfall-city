// police.js — Sunfall PD. Cruisers are spawned by the world as the wanted
// level rises; this system drives them: pursuit steering that aims where
// the player is going, not just where they are, a willingness to ram, and
// the patience to give up a chase that has gone cold and far away.

import { clamp, wrapAngle } from './config.js';
import { Car } from './vehicles.js';

export class Police {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.cruisers = [];
  }

  // Keep the fleet sized to the wanted level: one cruiser a star, plus the
  // one that is always somewhere in the city once trouble starts.
  setWanted(stars, playerPos) {
    const want = stars <= 0 ? 0 : Math.min(5, stars);
    while (this.cruisers.length < want) {
      const car = new Car('cruiser', 0xf2f2f2);
      car.driver = 'police';
      // Enter from a road a good distance away, never on top of the player.
      const ang = (this.cruisers.length * 2.4) + 0.7;
      const x = clamp(playerPos.x + Math.cos(ang) * 62, -108, 108);
      const z = clamp(playerPos.z + Math.sin(ang) * 62, -108, 108);
      car.place(Math.round(x / 52) * 52 + 3.6, Math.round(z / 52) * 52, ang);
      this.scene.add(car.mesh);
      this.cruisers.push(car);
    }
    while (this.cruisers.length > want) {
      const car = this.cruisers.pop();
      this.scene.remove(car.mesh);
    }
  }

  nearestDist(pos) {
    let best = null;
    for (const c of this.cruisers) {
      const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
      if (best === null || d < best) best = d;
    }
    return best;
  }

  update(dt, world) {
    const p = world.player;
    const target = p.driving ? p.car.pos : p.pos;
    const tv = p.driving ? p.car.vel : null;
    const all = world.allCars();
    for (const car of this.cruisers) {
      // Aim at where the target will be a moment from now.
      const lead = tv ? clamp(Math.hypot(tv.x, tv.y) * 0.045, 0, 0.7) : 0;
      const tx = target.x + (tv ? tv.x * lead * 10 : 0);
      const tz = target.z + (tv ? tv.y * lead * 10 : 0);
      const wantHeading = Math.atan2(tx - car.pos.x, tz - car.pos.z);
      const steer = clamp(wrapAngle(wantHeading - car.heading) * 1.8, -1, 1);
      const dist = Math.hypot(target.x - car.pos.x, target.z - car.pos.z);
      // Full speed in pursuit; back off a touch when alongside so the ram
      // reads as a nudge, not a teleport.
      let throttle = 1;
      if (dist < 4 && Math.abs(car.speed) > Math.abs(p.driving ? p.car.speed : 0) + 4) throttle = 0.2;
      car.update(dt, { throttle, steer, handbrake: dist < 9 && Math.abs(wrapAngle(wantHeading - car.heading)) > 1.6 }, this.colliders, all);
      // A cruiser left far behind re-enters from a nearer road.
      if (dist > 150) {
        const ang = Math.atan2(car.pos.z - target.z, car.pos.x - target.x) + 0.9;
        car.place(
          clamp(target.x + Math.sin(ang) * 58, -108, 108),
          clamp(target.z + Math.cos(ang) * 58, -108, 104),
          ang,
        );
      }
    }
  }

  clear() { this.setWanted(0, { x: 0, z: 0 }); }
}
