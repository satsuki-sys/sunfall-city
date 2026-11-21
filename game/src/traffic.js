// Traffic: civilian cars that cruise the avenue grid on the correct side of the
// road, choose turns at intersections, keep their distance from the car ahead
// and honk when the player blocks them. Each driver is a small state machine
// steering toward a point a little ahead on its lane.

import { avenueLines } from './config.js';
import { angleDelta, clamp, dist2d } from './random.js';
import { stepCar } from './vehicles.js';

const AVENUES = avenueLines();
const LANE = 3.4; // offset from the avenue centreline, right-hand traffic

/** The lane point for a car heading (dx, dz) along the avenue at `line`. */
function lanePoint(line, dirX, dirZ, along) {
  // Right-hand traffic: heading +x keeps the lane at z = line + LANE, etc.
  if (dirX === 1) return { x: along, z: line + LANE };
  if (dirX === -1) return { x: along, z: line - LANE };
  if (dirZ === 1) return { x: line - LANE, z: along };
  return { x: line + LANE, z: along };
}

export class TrafficDriver {
  constructor(car, rng) {
    this.car = car;
    this.rng = rng;
    // Snap onto the nearest avenue and pick a direction along it.
    const onX = rng.chance(0.5);
    if (onX) {
      this.line = nearest(car.z);
      this.dirX = rng.chance(0.5) ? 1 : -1;
      this.dirZ = 0;
    } else {
      this.line = nearest(car.x);
      this.dirX = 0;
      this.dirZ = rng.chance(0.5) ? 1 : -1;
    }
    this.targetSpeed = rng.range(9, 14);
    this.blockedTime = 0;
    car.driver = 'traffic';
  }

  /** At an intersection, mostly go straight; sometimes turn onto the cross avenue. */
  #chooseTurn() {
    const r = this.rng.next();
    if (r < 0.55) return;
    const left = r < 0.78;
    const [ndx, ndz] = left
      ? [this.dirZ, -this.dirX]
      : [-this.dirZ, this.dirX];
    // The new avenue line is the cross street we are standing on.
    this.line = this.dirX !== 0 ? nearest(this.car.x) : nearest(this.car.z);
    this.dirX = ndx;
    this.dirZ = ndz;
  }

  update(dt, world) {
    const car = this.car;
    if (car.health <= 0) { stepCar(car, { throttle: 0, steer: 0, brake: true }, dt, world.colliders, world.cars); return; }
    const along = this.dirX !== 0 ? car.x : car.z;
    const cross = this.dirX !== 0 ? car.z : car.x;
    // Next intersection ahead on this avenue.
    const step = this.dirX + this.dirZ > 0 ? 1 : -1;
    const ahead = AVENUES.map((a) => a - along).filter((d) => d * step > 4).sort((a, b) => Math.abs(a) - Math.abs(b))[0];
    const toIntersection = ahead === undefined ? 999 : Math.abs(ahead);
    if (toIntersection < 6 && Math.abs(cross - this.line) < 8 && this.rng.chance(dt * 0.9)) this.#chooseTurn();

    const lookAhead = lanePoint(this.line, this.dirX, this.dirZ, along + step * 14);
    const want = Math.atan2(lookAhead.x - car.x, lookAhead.z - car.z);
    const steer = clamp(angleDelta(car.heading, want) * 2.2, -1, 1);

    // Keep distance: anything slow in front within 10 m means match its speed.
    let throttle = car.speed < this.targetSpeed ? 0.75 : 0;
    let brake = false;
    for (const other of world.cars) {
      if (other === car) continue;
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      const relX = other.x - car.x;
      const relZ = other.z - car.z;
      const aheadDist = relX * fx + relZ * fz;
      const sideDist = Math.abs(relX * fz - relZ * fx);
      if (aheadDist > 0 && aheadDist < 11 && sideDist < 2.4) {
        if (car.speed > other.speed + 1) { throttle = 0; brake = car.speed > other.speed + 4; }
        if (aheadDist < 6) { throttle = 0; brake = true; }
      }
    }
    if (brake || throttle === 0) {
      this.blockedTime += dt;
      if (this.blockedTime > 2.4 && car.honkCooldown <= 0) {
        world.onHonk(car);
        car.honkCooldown = 4;
        this.blockedTime = 0;
      }
    } else this.blockedTime = 0;
    stepCar(car, { throttle, steer, brake }, dt, world.colliders, world.cars);
    // Nudge back onto the lane centreline over time.
    const lp = lanePoint(this.line, this.dirX, this.dirZ, along);
    if (this.dirX !== 0) car.z += (lp.z - car.z) * Math.min(1, dt * 0.7);
    else car.x += (lp.x - car.x) * Math.min(1, dt * 0.7);
  }
}

function nearest(v) {
  let best = AVENUES[0];
  for (const a of AVENUES) if (Math.abs(a - v) < Math.abs(best - v)) best = a;
  return best;
}

export { nearest as nearestAvenue };
export const trafficDist = dist2d;
