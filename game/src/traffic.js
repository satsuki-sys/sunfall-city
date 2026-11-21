// traffic.js — the civilian fleet. Each traffic car holds a lane on the
// grid (right-hand traffic: eastbound rides the south lane of its avenue,
// northbound the east lane of its street), follows it with a pure-pursuit
// steer, and turns at junctions when the mood takes it. Drivers keep a
// smooth gap to whatever is ahead — proportional throttle instead of brake
// slamming — ease off when cross traffic is inside a junction, and honk at
// anyone who blocks them past their patience, which each driver draws from
// the seeded generator like everything else in the city.

import { Car } from './vehicles.js';
import { STREETS_X, AVENUES_Z, CAR_COLORS, TUNE, makeRng } from './config.js';

const LANE_OFF = 4;

// The lane coordinate for a road line and a travel direction.
function laneCoord(line, axis, dir) {
  // axis 'x': travelling along an avenue (constant z). Eastbound (+x) keeps
  // right, which is the +z lane. axis 'z': northbound (-z) keeps right, +x.
  if (axis === 'x') return line + (dir > 0 ? LANE_OFF : -LANE_OFF);
  return line + (dir < 0 ? LANE_OFF : -LANE_OFF);
}

function headingFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

class TrafficDriver {
  constructor(world, rng) {
    this.world = world;
    this.rng = rng;
    const taxi = rng() < 0.14;
    this.car = new Car(world.scene, {
      color: CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)], taxi,
    });
    this.cruise = 8.5 + rng() * 4;
    this.patience = 1.6 + rng() * 2.6;  // seconds of blockage before the horn
    this.blockedFor = 0;
    this.turn = null;                    // {x, z, axis, dir, line, age}
    this.placeRandom(rng);
  }

  // Put the car on a random lane somewhere in the city, rolling.
  placeRandom(rng) {
    if (rng() < 0.5) {
      this.axis = 'x';
      this.line = AVENUES_Z[Math.floor(rng() * AVENUES_Z.length)];
      this.dir = rng() < 0.5 ? 1 : -1;
      const x = -170 + rng() * 340;
      this.car.setPosition(x, laneCoord(this.line, 'x', this.dir), headingFor('x', this.dir));
    } else {
      this.axis = 'z';
      this.line = STREETS_X[Math.floor(rng() * STREETS_X.length)];
      this.dir = rng() < 0.5 ? 1 : -1;
      const z = -170 + rng() * 290;
      this.car.setPosition(laneCoord(this.line, 'z', this.dir), z, headingFor('z', this.dir));
    }
    this.car.speed = this.cruise * 0.8;
    this.turn = null;
  }

  // The next junction line strictly ahead of the car on its current road.
  nextCrossing() {
    const lines = this.axis === 'x' ? STREETS_X : AVENUES_Z;
    const pos = this.axis === 'x' ? this.car.pos.x : this.car.pos.z;
    let best = null;
    for (const l of lines) {
      const d = (l - pos) * this.dir;
      if (d > 1 && (best === null || d < best.d)) best = { line: l, d };
    }
    return best;
  }

  // Begin a turn onto the crossing road: aim at a point down the new lane
  // and let the pursuit steer draw the arc.
  beginTurn(crossLine) {
    const options = [-1, 1];
    const newDir = options[Math.floor(this.rng() * 2)];
    const newAxis = this.axis === 'x' ? 'z' : 'x';
    const crossCoord = this.axis === 'x' ? this.car.pos.z : this.car.pos.x;
    const lane = laneCoord(crossLine, newAxis, newDir);
    const target = { axis: newAxis, dir: newDir, line: crossLine };
    if (newAxis === 'z') target.point = { x: lane, z: crossCoord + newDir * -16 };
    else target.point = { x: crossCoord + newDir * -16, z: lane };
    // For a z-road the travel direction is along z; the point must lie ahead
    // in the new direction from the junction centre.
    if (newAxis === 'z') target.point.z = this.line + newDir * 16;
    else target.point.x = this.line + newDir * 16;
    target.age = 0;
    this.turn = target;
  }

  // Nearest obstacle in this car's lane corridor, as {gap, speed, blocker}.
  scanAhead() {
    const c = this.car;
    const fx = c.forwardX(), fz = c.forwardZ();
    let best = null;
    const consider = (ox, oz, ospeed, blocker) => {
      const rx = ox - c.pos.x, rz = oz - c.pos.z;
      const ahead = rx * fx + rz * fz;
      const lateral = Math.abs(rx * fz - rz * fx);
      if (ahead > 0.5 && ahead < 15 && lateral < 2.3) {
        if (!best || ahead < best.gap) best = { gap: ahead, speed: ospeed, blocker };
      }
    };
    for (const other of this.world.allCars()) {
      if (other !== c) consider(other.pos.x, other.pos.z, other.speed, 'car');
    }
    for (const ped of this.world.peds.people) {
      if (!ped.down) consider(ped.pos.x, ped.pos.z, 0, 'ped');
    }
    const p = this.world.player;
    if (!this.world.playerCar) consider(p.pos.x, p.pos.z, 0, 'ped');
    return best;
  }

  // Is cross traffic inside the junction we are approaching?
  junctionBusy(cross) {
    const cx = this.axis === 'x' ? cross.line : this.car.pos.x;
    const cz = this.axis === 'x' ? this.car.pos.z : cross.line;
    for (const other of this.world.allCars()) {
      if (other === this.car) continue;
      if (Math.abs(other.pos.x - cx) < 10 && Math.abs(other.pos.z - cz) < 10) return true;
    }
    return false;
  }

  update(dt) {
    const c = this.car;
    let desired = this.cruise;
    let target;
    const cross = this.nextCrossing();

    if (this.turn) {
      this.turn.age += dt;
      target = this.turn.point;
      desired = Math.min(desired, 7.5);
      const dx = target.x - c.pos.x, dz = target.z - c.pos.z;
      const dist = Math.hypot(dx, dz);
      const aligned = Math.abs(angleDiff(headingFor(this.turn.axis, this.turn.dir), c.heading)) < 0.45;
      if ((dist < 4 && aligned) || this.turn.age > 4.5) {
        this.axis = this.turn.axis;
        this.dir = this.turn.dir;
        this.line = this.turn.line;
        this.turn = null;
      }
    } else {
      // Aim at a point well ahead on the lane line.
      if (this.axis === 'x') {
        target = { x: c.pos.x + this.dir * 12, z: laneCoord(this.line, 'x', this.dir) };
      } else {
        target = { x: laneCoord(this.line, 'z', this.dir), z: c.pos.z + this.dir * 12 };
      }
      if (cross) {
        const atEdge = (this.axis === 'x' &&
          (cross.line === STREETS_X[0] || cross.line === STREETS_X[STREETS_X.length - 1])) ||
          (this.axis === 'z' &&
          (cross.line === AVENUES_Z[0] || cross.line === AVENUES_Z[AVENUES_Z.length - 1]));
        if (cross.d < 10 && (atEdge || this.rng() < 0.011)) this.beginTurn(cross.line);
        else if (cross.d < 12 && this.junctionBusy(cross)) desired = Math.min(desired, 3);
      }
    }

    // Gap keeping: match the leader's pace, stop short of its bumper.
    const obstacle = this.scanAhead();
    let blocked = false;
    if (obstacle) {
      if (obstacle.gap < 6.5) desired = 0;
      else desired = Math.min(desired, obstacle.speed + (obstacle.gap - 8) * 0.55);
      blocked = desired <= 0.5 && c.speed < 1;
    }
    if (blocked) {
      this.blockedFor += dt;
      if (this.blockedFor > this.patience && (obstacle.blocker !== 'car' || this.rng() < 0.5)) {
        this.world.audio.horn();
        this.blockedFor = this.patience * 0.4; // grumble again later if still stuck
      }
    } else {
      this.blockedFor = Math.max(0, this.blockedFor - dt * 2);
    }

    const desiredHeading = Math.atan2(target.x - c.pos.x, target.z - c.pos.z);
    const steer = THREE_clamp(angleDiff(desiredHeading, c.heading) * 1.7, -1, 1);
    const throttle = c.speed < desired - 0.4 ? 0.8 : (c.speed > desired + 0.6 ? -0.8 : 0);
    c.update(dt, { throttle, steer, handbrake: false });
  }
}

function THREE_clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

export class Traffic {
  constructor(world) {
    this.world = world;
    const rng = makeRng(world.seed * 7 + 11);
    this.drivers = [];
    for (let i = 0; i < TUNE.trafficCount; i++) {
      this.drivers.push(new TrafficDriver(world, rng));
    }
  }

  get cars() {
    return this.drivers.map((d) => d.car);
  }

  update(dt) {
    const p = this.world.player.pos;
    for (const d of this.drivers) {
      d.update(dt);
      // Keep the fleet near the action: a car that has wandered to the far
      // side of town quietly re-enters on a lane nearer the player.
      const far = Math.hypot(d.car.pos.x - p.x, d.car.pos.z - p.z) > 300;
      if (far) d.placeRandom(d.rng);
    }
  }
}
