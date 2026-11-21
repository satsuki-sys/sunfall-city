// The Sunfall PD: interceptors answering to the wanted level. Units spawn
// on avenues a block or two out from the player, hunt the player's
// position, ram a fleeing car and box in a runner on foot. Their light
// bars alternate red and blue — glow halos included — and the nearest
// unit's distance drives the siren in the audio mix.

import { WANTED } from './config.js';
import { angleDelta, clamp, dist2d } from './random.js';
import { createCar, stepCar } from './vehicles.js';
import { nearestAvenue } from './traffic.js';

export class PoliceForce {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.units = [];       // the cars whose driver is 'police'
    this.spawnCooldown = 0;
  }

  activeCount() {
    return this.units.filter((u) => u.health > 0).length;
  }

  nearestDistance(pos) {
    let best = Infinity;
    for (const u of this.units) {
      if (u.health <= 0) continue;
      best = Math.min(best, dist2d(u.x, u.z, pos.x, pos.z));
    }
    return best;
  }

  update(dt, t) {
    const world = this.world;
    const wanted = world.wanted;
    const desired = WANTED.policeByStars[wanted] ?? 0;
    this.spawnCooldown -= dt;

    // Keep the force at the strength the wanted level asks for.
    if (this.activeCount() < desired && this.spawnCooldown <= 0) this.#spawn();

    // Retire what the heat no longer needs: units out of sight once the
    // stars are gone, and hulks that have sat wrecked for a long while.
    for (const u of [...this.units]) {
      const farAndCalm = wanted === 0 && dist2d(u.x, u.z, world.playerPos.x, world.playerPos.z) > 95;
      const wreckedLongAgo = u.health <= 0 && u.retire > 25;
      if (farAndCalm || wreckedLongAgo) {
        this.scene.remove(u.mesh);
        world.cars.splice(world.cars.indexOf(u), 1);
        this.units.splice(this.units.indexOf(u), 1);
      }
    }

    // Drive every unit, strobe its light bar and halos, and set the siren
    // level from whichever unit is closest.
    let nearest = Infinity;
    for (const u of this.units) {
      this.#drive(u, dt);
      const flash = u.mesh.userData.flash;
      if (flash) {
        const phase = Math.floor(t * 3.2 + u.x) % 2;
        flash[0].emissiveIntensity = phase === 0 ? 2.4 : 0.15;
        flash[1].emissiveIntensity = phase === 0 ? 0.15 : 2.4;
        const glow = u.mesh.userData.flashGlow;
        if (glow) {
          glow[0].opacity = phase === 0 ? 0.55 : 0.05;
          glow[1].opacity = phase === 0 ? 0.05 : 0.55;
        }
      }
      if (u.health <= 0) u.retire = (u.retire ?? 0) + dt;
      nearest = Math.min(nearest, dist2d(u.x, u.z, world.playerPos.x, world.playerPos.z));
    }
    const sirenLevel = nearest === Infinity ? 0 : clamp(1 - nearest / 55, 0, 1) * (wanted > 0 ? 1 : 0.3);
    world.audio.siren(sirenLevel);
  }

  #spawn() {
    const world = this.world;
    const p = world.playerPos;
    const angle = world.rng.range(0, Math.PI * 2);
    const dist = world.rng.range(52, 72);
    const x = clamp(p.x + Math.sin(angle) * dist, -230, 230);
    const z = clamp(p.z + Math.cos(angle) * dist, -230, 230);
    // Snap onto the nearest avenue so the unit arrives by road.
    const sx = nearestAvenue(x);
    const car = createCar(this.scene, 'police', 0xffffff, sx, z, Math.atan2(p.x - sx, p.z - z));
    car.driver = 'police';
    car.retire = 0;
    world.cars.push(car);
    this.units.push(car);
    this.spawnCooldown = 2.5;
  }

  #drive(u, dt) {
    const world = this.world;
    if (u.health <= 0) {
      stepCar(u, { throttle: 0, steer: 0, brake: true }, dt, world.colliders, world.cars);
      return;
    }
    // Aim where the target is about to be, not where it stands now.
    const target = world.playerVehicle ?? world.playerPos;
    const lead = world.playerVehicle ? 0.35 : 0;
    const tx = target.x + Math.sin(target.heading ?? 0) * (target.speed ?? 0) * lead;
    const tz = target.z + Math.cos(target.heading ?? 0) * (target.speed ?? 0) * lead;
    const d = dist2d(u.x, u.z, tx, tz);
    const want = Math.atan2(tx - u.x, tz - u.z);
    const delta = angleDelta(u.heading, want);
    let steer = clamp(delta * 2.4, -1, 1);

    // A building dead ahead overrides the chase line: swerve around it.
    const aheadX = u.x + Math.sin(u.heading) * 7;
    const aheadZ = u.z + Math.cos(u.heading) * 7;
    for (const c of world.colliders) {
      if (aheadX > c.minX - 1 && aheadX < c.maxX + 1 && aheadZ > c.minZ - 1 && aheadZ < c.maxZ + 1) {
        steer = delta >= 0 ? -0.9 : 0.9;
        break;
      }
    }

    let throttle = 1;
    if (Math.abs(delta) > 2.2 && u.speed < 4) throttle = -1; // reverse to swing the nose round
    else if (Math.abs(delta) > 1.2) throttle = 0.45;
    if (!world.playerVehicle && d < 5) throttle = 0;         // on foot: pull up alongside
    if (!world.playerVehicle && d < 2.6) throttle = -0.4;
    stepCar(u, { throttle, steer, brake: false }, dt, world.colliders, world.cars);

    // A solid ram into the player's car does real damage.
    if (u.lastImpact > 8 && world.playerVehicle === target && target.driver === 'player') {
      world.damagePlayer(4, u);
    }
  }
}
