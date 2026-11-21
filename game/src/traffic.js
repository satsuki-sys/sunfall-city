// Traffic: civilian cars cruising the avenue grid on the correct side of
// the road. They choose turns at intersections, follow the car ahead at a
// smooth distance instead of slamming between the pedals, ease off early
// when cross traffic is moving through the junction ahead, and honk when
// the player blocks them beyond their patience. Each driver is a small
// state machine steering at a point a little way ahead on its lane, with
// a personal patience for being stuck.

import { avenueLines } from './config.js';
import { angleDelta, clamp, dist2d } from './random.js';
import { stepCar } from './vehicles.js';

const AVENUES = avenueLines();
const LANE = 3.4; // lane offset from the avenue centreline, right-hand traffic

/** The point on the driving lane, `along` metres along the avenue at `line`. */
function lanePoint(line, dirX, dirZ, along) {
  // Right-hand traffic: heading +x keeps the lane at z = line + LANE, and so on.
  if (dirX === 1) return { x: along, z: line + LANE };
  if (dirX === -1) return { x: along, z: line - LANE };
  if (dirZ === 1) return { x: line - LANE, z: along };
  return { x: line + LANE, z: along };
}

export class TrafficDriver {
  constructor(car, rng) {
    this.car = car;
    this.rng = rng;
    // Settle onto the nearest avenue and pick a direction along it.
    if (rng.chance(0.5)) {
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
    this.patience = rng.range(2.2, 3.8); // seconds stuck before the horn comes out
    car.driver = 'traffic';
  }

  /** At an intersection: mostly straight on, sometimes a turn onto the cross avenue. */
  #chooseTurn() {
    const r = this.rng.next();
    if (r < 0.55) return;
    const turningLeft = r < 0.78;
    const [ndx, ndz] = turningLeft
      ? [this.dirZ, -this.dirX]
      : [-this.dirZ, this.dirX];
    // The avenue turned onto is the cross street the car is standing on.
    this.line = this.dirX !== 0 ? nearest(this.car.x) : nearest(this.car.z);
    this.dirX = ndx;
    this.dirZ = ndz;
  }

  update(dt, world) {
    const car = this.car;
    if (car.health <= 0) {
      stepCar(car, { throttle: 0, steer: 0, brake: true }, dt, world.colliders, world.cars);
      return;
    }
    const along = this.dirX !== 0 ? car.x : car.z;
    const cross = this.dirX !== 0 ? car.z : car.x;

    // The next intersection ahead on this avenue, and a chance to turn there.
    const step = this.dirX + this.dirZ > 0 ? 1 : -1;
    const ahead = AVENUES.map((a) => a - along).filter((d) => d * step > 4).sort((a, b) => Math.abs(a) - Math.abs(b))[0];
    const toIntersection = ahead === undefined ? 999 : Math.abs(ahead);
    if (toIntersection < 6 && Math.abs(cross - this.line) < 8 && this.rng.chance(dt * 0.9)) this.#chooseTurn();

    // Steer at a look-ahead point riding on the lane.
    const lookAhead = lanePoint(this.line, this.dirX, this.dirZ, along + step * 14);
    const want = Math.atan2(lookAhead.x - car.x, lookAhead.z - car.z);
    const steer = clamp(angleDelta(car.heading, want) * 2.2, -1, 1);

    // Car-following: settle toward the speed that holds roughly a 7 m gap
    // to whatever runs slow ahead, instead of alternating full throttle and
    // full brake. A gap that is genuinely closing still earns the brake.
    const fwdX = Math.sin(car.heading);
    const fwdZ = Math.cos(car.heading);
    let desired = this.targetSpeed;
    let brake = false;
    for (const other of world.cars) {
      if (other === car) continue;
      const relX = other.x - car.x;
      const relZ = other.z - car.z;
      const aheadDist = relX * fwdX + relZ * fwdZ;
      const sideDist = Math.abs(relX * fwdZ - relZ * fwdX);
      if (aheadDist > 0 && aheadDist < 16 && sideDist < 2.4) {
        const follow = other.speed + Math.max(0, (aheadDist - 7) * 0.55);
        if (follow < desired) desired = follow;
        if (aheadDist < 5.5 || (aheadDist < 10 && car.speed > other.speed + 4.5)) brake = true;
      }
    }

    // Junction caution: cross traffic moving through the intersection just
    // ahead means lifting off early instead of arriving at full speed.
    if (toIntersection < 13) {
      const ix = this.dirX !== 0 ? along + ahead : this.line;
      const iz = this.dirX !== 0 ? this.line : along + ahead;
      for (const other of world.cars) {
        if (other === car) continue;
        if (Math.abs(other.speed) > 1 && dist2d(other.x, other.z, ix, iz) < 10) {
          if (desired > 5.5) desired = 5.5;
          break;
        }
      }
    }

    const throttle = brake ? 0 : clamp((desired - car.speed) * 0.45, 0, 0.8);

    // Stuck longer than this driver's patience runs? The horn says so.
    if (brake || throttle <= 0.01) {
      this.blockedTime += dt;
      if (this.blockedTime > this.patience && car.honkCooldown <= 0) {
        world.onHonk(car);
        car.honkCooldown = 4;
        this.blockedTime = 0;
      }
    } else this.blockedTime = 0;

    stepCar(car, { throttle, steer, brake }, dt, world.colliders, world.cars);

    // Over time, drift gently back onto the lane centreline.
    const lp = lanePoint(this.line, this.dirX, this.dirZ, along);
    if (this.dirX !== 0) car.z += (lp.z - car.z) * Math.min(1, dt * 0.7);
    else car.x += (lp.x - car.x) * Math.min(1, dt * 0.7);
  }
}

/** The avenue coordinate nearest to v. */
function nearest(v) {
  let best = AVENUES[0];
  for (const a of AVENUES) if (Math.abs(a - v) < Math.abs(best - v)) best = a;
  return best;
}

export { nearest as nearestAvenue };
export const trafficDist = dist2d;
