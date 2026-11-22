// traffic.js — the city's moving cars. Each one holds a lane on the grid,
// keeps a smooth gap to the car ahead instead of slamming its brakes, eases
// off when cross traffic is near a junction, stops for a pedestrian in the
// road and honks when blocked past that driver's patience.

import { AVENUES, STREETS, CAR_COLORS, clamp, wrapAngle, mulberry32 } from './config.js';
import { Car } from './vehicles.js';

const LANE = 3.6;
const CRUISE = 11;

export class Traffic {
  constructor(scene, seed, colliders) {
    this.colliders = colliders;
    this.rng = mulberry32(seed * 31 + 7);
    this.cars = [];
    const kinds = ['sedan', 'hatch', 'sedan', 'taxi', 'sedan', 'hatch', 'sedan', 'sedan', 'hatch', 'sedan'];
    for (let i = 0; i < 10; i++) {
      const car = new Car(kinds[i], CAR_COLORS[(this.rng() * CAR_COLORS.length) | 0]);
      car.driver = 'traffic';
      this.placeOnGrid(car, true);
      scene.add(car.mesh);
      this.cars.push(car);
    }
  }

  // Put a car on a random avenue or street, in the right-hand lane.
  placeOnGrid(car, anywhere = false) {
    const rng = this.rng;
    const onAvenue = rng() < 0.5;
    const dir = rng() < 0.5 ? 1 : -1;
    if (onAvenue) {
      const a = AVENUES[(rng() * AVENUES.length) | 0];
      const z = anywhere ? -100 + rng() * 200 : (dir > 0 ? -108 : 108);
      car.place(a - dir * LANE, z, dir > 0 ? 0 : Math.PI);
      car.road = { axis: 'z', at: a, dir };
    } else {
      const s = STREETS[(rng() * STREETS.length) | 0];
      const x = anywhere ? -100 + rng() * 200 : (dir > 0 ? -108 : 108);
      car.place(x, s + dir * LANE, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      car.road = { axis: 'x', at: s, dir };
    }
    car.stuckFor = 0;
    car.honkPatience = 2 + rng() * 4;
    car.blockedFor = 0;
    car.junctionAt = undefined;
  }

  // The lane centre for the car's current road and direction.
  laneTarget(car) {
    const r = car.road;
    if (r.axis === 'z') return { x: r.at - r.dir * LANE, z: car.pos.z + r.dir * 16 };
    return { x: car.pos.x + r.dir * 16, z: r.at + r.dir * LANE };
  }

  // The next junction along the direction of travel, as a distance.
  junctionAhead(car) {
    const c = this.nextJunctionCoord(car);
    if (c === null) return Infinity;
    const along = car.road.axis === 'z' ? car.pos.z : car.pos.x;
    return (c - along) * car.road.dir;
  }

  // The coordinate of the next cross road ahead of the car, or null.
  nextJunctionCoord(car) {
    const r = car.road;
    const along = r.axis === 'z' ? car.pos.z : car.pos.x;
    const roads = r.axis === 'z' ? STREETS : AVENUES;
    let best = null, bestD = Infinity;
    for (const c of roads) {
      const d = (c - along) * r.dir;
      if (d > 1 && d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  update(dt, world) {
    const all = world.allCars();
    for (const car of this.cars) {
      if (car.driver === 'player') continue;   // stolen: the player drives it now
      const r = car.road;
      const target = this.laneTarget(car);
      const wantHeading = Math.atan2(target.x - car.pos.x, target.z - car.pos.z);
      const steer = clamp(wrapAngle(wantHeading - car.heading) * 1.6, -1, 1);

      let desired = CRUISE;
      let blocked = false;

      // Gap-keeping: match the car ahead, with room to spare.
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      for (const other of all) {
        if (other === car) continue;
        const dx = other.pos.x - car.pos.x, dz = other.pos.z - car.pos.z;
        const ahead = dx * fx + dz * fz;
        const lateral = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < 15 && lateral < 2.3) {
          desired = Math.min(desired, other.speed + (ahead - 7) * 0.55);
          if (ahead < 5) desired = Math.min(desired, other.speed * 0.5);
        }
      }
      // A person in the road: stop, then lean on the horn.
      const p = world.player;
      if (!p.driving) {
        const dx = p.pos.x - car.pos.x, dz = p.pos.z - car.pos.z;
        const ahead = dx * fx + dz * fz;
        const lateral = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < 8 && lateral < 1.9) { desired = 0; blocked = true; }
      }
      // Junction caution: cross traffic near the box means a gentle slow.
      const j = this.junctionAhead(car);
      if (j < 11) {
        const jc = r.axis === 'z'
          ? { x: r.at, z: car.pos.z + r.dir * j }
          : { x: car.pos.x + r.dir * j, z: r.at };
        for (const other of all) {
          if (other === car) continue;
          if (Math.abs(other.pos.x - jc.x) < 9 && Math.abs(other.pos.z - jc.z) < 9
              && Math.abs(Math.sin(other.heading - car.heading)) > 0.7 && Math.abs(other.speed) > 1) {
            desired = Math.min(desired, 4.5);
          }
        }
      }

      car.blockedFor = blocked ? car.blockedFor + dt : 0;
      if (blocked && car.blockedFor > car.honkPatience) {
        car.blockedFor = 0;
        car.honkPatience = 2 + this.rng() * 4;
        if (world.audio) world.audio.horn();
      }

      const throttle = clamp((desired - car.speed) * 0.3, -1, 1);
      car.update(dt, { throttle, steer, handbrake: false }, this.colliders, all);

      // Crossing a junction: sometimes turn onto the cross road. The lane
      // target then swings the car around the corner on its own.
      const along = r.axis === 'z' ? car.pos.z : car.pos.x;
      if (car.junctionAt === undefined) car.junctionAt = this.nextJunctionCoord(car);
      if (car.junctionAt !== null && (along - car.junctionAt) * r.dir > 0.5) {
        const cross = car.junctionAt;
        car.junctionAt = undefined;
        if (this.rng() < 0.42) {
          const dir = this.rng() < 0.5 ? 1 : -1;
          car.road = r.axis === 'z' ? { axis: 'x', at: cross, dir } : { axis: 'z', at: cross, dir };
        }
      }

      // Off the map or wedged: quietly re-enter at an edge.
      if (Math.abs(car.pos.x) > 130 || Math.abs(car.pos.z) > 150 || car.pos.z > 112) this.placeOnGrid(car);
      if (Math.abs(car.speed) < 0.2 && desired > 2) {
        car.stuckFor += dt;
        if (car.stuckFor > 9) this.placeOnGrid(car);
      } else car.stuckFor = 0;
    }
  }
}
