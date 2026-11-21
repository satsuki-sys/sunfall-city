// Missions: a three-job story for Rook, a courier who owes the city a favour,
// the repeatable Taxi Dash on the side, and a trail of twelve golden sun
// discs hidden around the city for anyone who explores. Marisol at Café
// Solano hands out the work by phone banner; a gold beacon marks the way,
// and the minimap target follows it.
//
//   1. First Run         — pick up a package at the café, deliver it dockside.
//   2. Borrowed Sunshine — steal the coral Vireo GT from Shoreline Motors and
//                          deliver it to Tito's Garage while the heat rises.
//   3. The Sunset Score  — take the cash case off Palms Pier under a guard's
//                          nose, then lose the police to bank it.

import * as THREE from 'three';
import { POIS, groundHeightAt } from './city.js';
import { PACKAGES } from './config.js';
import { dist2d } from './random.js';
import { Guard } from './combat.js';
import { glowTexture } from './city.js';

const CASE_POS = { x: -88, z: 330 }; // the cash case, at the end of the pier

/** Where the twelve sun discs wait: pier, shore, forecourts and medians. */
const DISC_SPOTS = [
  { x: -88, z: 330 },   // the end of Palms Pier, beside the cash case
  { x: -220, z: 252 },  // the boardwalk's west end
  { x: 220, z: 252 },   // the boardwalk's east end
  { x: 60, z: 272 },    // out on the sand
  { x: 108, z: 198 },   // the Shoreline Motors lot
  { x: 150, z: -70 },   // Tito's forecourt
  { x: -115, z: -115 }, // the café corner
  { x: -20, z: -158 },  // Sunfall General's steps
  { x: 18, z: 18 },     // the station forecourt
  { x: 158, z: 196 },   // the warehouse yard
  { x: 0, z: -88 },     // an avenue median, for drivers
  { x: -40, z: 50 },    // a downtown sidewalk corner
];

export class Missions {
  constructor(world) {
    this.world = world;
    this.storyIndex = 0;      // 0,1,2 = the three jobs; 3 = story done
    this.stage = 'toCafe';
    this.target = null;       // {x, z, color} for the minimap
    this.taxi = { phase: 'none', ped: null, dest: null, timer: 0, offerIn: 14 };
    this.lastObjective = '';

    // The objective beacon: a translucent gold column at the target.
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xffd23e, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide,
    });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 34, 18, 1, true), beaconMat);
    this.beacon.position.y = 17;
    this.beacon.visible = false;
    world.scene.add(this.beacon);

    // The cash case waits at the end of the pier from the very start, with
    // its guard posted nearby (inactive until the story arms him).
    const caseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.3, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.7, emissive: 0x664d00, emissiveIntensity: 0.4 }),
    );
    caseMesh.position.set(CASE_POS.x, 0.9, CASE_POS.z);
    world.scene.add(caseMesh);
    this.caseMesh = caseMesh;
    this.guard = new Guard(world.scene, world.rng, CASE_POS.x + 4.5, CASE_POS.z - 9, Math.PI);
    world.guards.push(this.guard);

    // The sun discs: flat gold coins hovering over their spots, each with a
    // halo so a sharp eye can spot one down an avenue.
    this.discs = DISC_SPOTS.map((spot) => {
      const group = new THREE.Group();
      const coin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 0.12, 20),
        new THREE.MeshStandardMaterial({
          color: 0xffc93e, roughness: 0.25, metalness: 0.75,
          emissive: 0xa86e00, emissiveIntensity: 0.55,
        }),
      );
      coin.rotation.x = Math.PI / 2.4;
      group.add(coin);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: 0xffbe4d, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      halo.scale.setScalar(2.4);
      group.add(halo);
      group.position.set(spot.x, groundHeightAt(spot.x, spot.z) + 1.05, spot.z);
      world.scene.add(group);
      return { x: spot.x, z: spot.z, mesh: group, taken: false };
    });

    world.onPedArrived = (ped) => this.#pedArrived(ped);
  }

  /** How many sun discs the player has picked up so far. */
  get discsFound() {
    return this.discs.filter((d) => d.taken).length;
  }

  /** Restore story progress from a save: jump straight to that job's first stage. */
  restore(index) {
    this.storyIndex = Math.min(3, index);
    this.stage = ['toCafe', 'toLot', 'toPier', 'free'][this.storyIndex];
    this.guard.active = false;
  }

  /** Restore the collected discs from a save (a list of spot indices). */
  restoreDiscs(indices) {
    for (const disc of this.discs) {
      disc.taken = false;
      disc.mesh.visible = true;
    }
    for (const i of indices ?? []) {
      const disc = this.discs[i];
      if (disc) {
        disc.taken = true;
        disc.mesh.visible = false;
      }
    }
  }

  #setTarget(x, z, color = '#ffd23e') {
    this.target = { x, z, color };
    this.beacon.visible = true;
    this.beacon.position.x = x;
    this.beacon.position.z = z;
  }

  #clearTarget() {
    this.target = null;
    this.beacon.visible = false;
  }

  /** Push an objective to the HUD, throttled so the text only changes when it should. */
  #objective(title, text, dist) {
    const key = `${title}|${text}|${dist === null ? '' : Math.round(dist / 5)}`;
    if (key === this.lastObjective) return;
    this.lastObjective = key;
    this.world.hud.setObjective(title, text, dist);
  }

  #arrived(x, z, r) {
    const p = this.world.playerPos;
    return dist2d(p.x, p.z, x, z) < r;
  }

  /** Distance from the player to a point, for objective readouts. */
  #distTo(x, z) {
    const p = this.world.playerPos;
    return dist2d(p.x, p.z, x, z);
  }

  update(dt, t) {
    // The beacon breathes and slowly turns, playing or not.
    this.beacon.material.opacity = 0.2 + Math.sin(t * 3) * 0.07;
    this.beacon.rotation.y += dt * 0.4;
    // The discs spin and bob over their spots, waiting to be found.
    for (const disc of this.discs) {
      if (disc.taken) continue;
      disc.mesh.rotation.y += dt * 1.6;
      disc.mesh.position.y = groundHeightAt(disc.x, disc.z) + 1.05 + Math.sin(t * 2.2 + disc.x) * 0.14;
    }
    if (this.world.state === 'playing') {
      this.#updateStory();
      this.#updateTaxi(dt);
      this.#updateDiscs();
    }
  }

  /** Pick up any disc the player has just walked or driven over. */
  #updateDiscs() {
    const world = this.world;
    const p = world.playerPos;
    for (const disc of this.discs) {
      if (disc.taken) continue;
      if (dist2d(p.x, p.z, disc.x, disc.z) > PACKAGES.radius) continue;
      disc.taken = true;
      disc.mesh.visible = false;
      const found = this.discsFound;
      world.addCash(PACKAGES.reward);
      world.audio.collect();
      if (found >= PACKAGES.count) {
        world.addCash(PACKAGES.fullBonus);
        world.hud.toast('ALL SUN DISCS', `The full set · +$${PACKAGES.reward + PACKAGES.fullBonus}`);
        world.hud.message('Marisol: "Every last one. The city really is yours, Rook."', '#ffd98f');
      } else {
        world.hud.message(`Sun disc found — ${found}/${PACKAGES.count} · +$${PACKAGES.reward}`, '#ffd98f');
      }
      world.saveGame();
    }
  }

  #updateStory() {
    const world = this.world;
    const hud = world.hud;
    switch (this.stage) {
      case 'toCafe': {
        this.#setTarget(POIS.cafe.x, POIS.cafe.z);
        this.#objective('FIRST RUN', 'Meet Marisol at Café Solano', this.#distTo(POIS.cafe.x, POIS.cafe.z));
        if (this.#arrived(POIS.cafe.x, POIS.cafe.z, 7)) {
          hud.message('Marisol: "Rook. Take this to the Dockside Warehouse — no detours."', '#ffd98f');
          world.audio.pickup();
          this.stage = 'toWarehouse';
        }
        break;
      }
      case 'toWarehouse': {
        this.#setTarget(POIS.warehouse.x, POIS.warehouse.z);
        this.#objective('FIRST RUN', 'Deliver the package to the Dockside Warehouse', this.#distTo(POIS.warehouse.x, POIS.warehouse.z));
        if (this.#arrived(POIS.warehouse.x, POIS.warehouse.z, 8)) {
          world.addCash(150);
          hud.toast('JOB DONE', 'First Run · +$150');
          hud.message('Marisol: "Clean work. Tito has something louder for you."', '#ffd98f');
          this.storyIndex = 1;
          this.stage = 'toLot';
          hud.toast('NEW JOB', 'Borrowed Sunshine');
          world.saveGame();
        }
        break;
      }
      case 'toLot': {
        this.#setTarget(POIS.carLot.x, POIS.carLot.z);
        this.#objective('BORROWED SUNSHINE', 'Go to Shoreline Motors on the beachfront', this.#distTo(POIS.carLot.x, POIS.carLot.z));
        if (this.#arrived(POIS.carLot.x, POIS.carLot.z, 16)) {
          hud.message('Tito: "The coral Vireo GT, back row. She\'s yours — just take her."', '#ffd98f');
          this.stage = 'steal';
        }
        break;
      }
      case 'steal': {
        const car = world.markedCar;
        this.#setTarget(car.x, car.z);
        this.#objective('BORROWED SUNSHINE', 'Steal the coral Vireo GT', this.#distTo(car.x, car.z));
        this.beacon.position.x = car.x;
        this.beacon.position.z = car.z;
        if (world.playerVehicle === car) {
          world.reportCrime('grandTheft', world.playerPos, true);
          hud.message('Tito: "GO. Garage. Now — and lose any company first."', '#ffd98f');
          this.stage = 'toGarage';
        }
        break;
      }
      case 'toGarage': {
        this.#setTarget(POIS.garage.x, POIS.garage.z);
        const inCar = world.playerVehicle === world.markedCar;
        this.#objective('BORROWED SUNSHINE', inCar ? "Deliver the Vireo GT to Tito's Garage" : 'Get back in the Vireo GT', this.#distTo(POIS.garage.x, POIS.garage.z));
        if (inCar && this.#arrived(POIS.garage.x, POIS.garage.z, 10)) {
          world.player.exitCar(world);
          world.markedCar.driver = 'parked';
          world.addCash(300);
          hud.toast('JOB DONE', 'Borrowed Sunshine · +$300');
          hud.message('Marisol: "One last thing, Rook. The pier. Sunset. Come hungry."', '#ffd98f');
          this.storyIndex = 2;
          this.stage = 'toPier';
          hud.toast('NEW JOB', 'The Sunset Score');
          world.saveGame();
        }
        break;
      }
      case 'toPier': {
        this.#setTarget(POIS.pier.x, POIS.pier.z + 30);
        this.#objective('THE SUNSET SCORE', 'Head to the end of Palms Pier', this.#distTo(POIS.pier.x, POIS.pier.z + 30));
        if (this.#arrived(CASE_POS.x, CASE_POS.z, 16)) {
          this.guard.active = true;
          hud.message('A guard watches the case. Take it — fast, or quiet and quicker.', '#ff9d8a');
          this.stage = 'grab';
        }
        break;
      }
      case 'grab': {
        this.#setTarget(CASE_POS.x, CASE_POS.z);
        this.#objective('THE SUNSET SCORE', 'Grab the cash case', this.#distTo(CASE_POS.x, CASE_POS.z));
        if (this.#arrived(CASE_POS.x, CASE_POS.z, 2.6)) {
          this.caseMesh.visible = false;
          world.reportCrime('score', world.playerPos, true);
          world.audio.pickup();
          hud.message('Case in hand. Now vanish — lose the heat to bank it.', '#ffd98f');
          this.stage = 'escape';
        }
        break;
      }
      case 'escape': {
        this.#clearTarget();
        this.#objective('THE SUNSET SCORE', `Lose the heat — wanted level ${world.wanted} must reach zero`, null);
        if (world.wanted === 0) {
          world.addCash(600);
          hud.toast('STORY COMPLETE', 'The Sunset Score · +$600');
          hud.message('Marisol: "Sunfall is yours now, Rook. Keep the meter running."', '#ffd98f');
          this.storyIndex = 3;
          this.stage = 'free';
          world.saveGame();
        }
        break;
      }
      default: {
        // Story finished: with no taxi running either, there is no objective.
        if (this.taxi.phase === 'none') {
          this.#clearTarget();
          hud.clearObjective();
        }
      }
    }
  }

  // --- Taxi Dash: the repeatable side job -------------------------------------

  #updateTaxi(dt) {
    const world = this.world;
    const taxi = this.taxi;
    if (this.storyIndex < 1) return; // no fares until the first job is done

    if (taxi.phase === 'none') {
      // Count down to the next hail; then find a walker to raise a hand.
      taxi.offerIn -= dt;
      if (taxi.offerIn <= 0) {
        const ped = world.peds.find((p) => p.state === 'walk' && dist2d(p.x, p.z, world.playerPos.x, world.playerPos.z) > 25);
        if (ped) {
          ped.state = 'waiting';
          taxi.ped = ped;
          taxi.phase = 'offer';
          world.hud.message('Someone is hailing a ride nearby — check the green blip.', '#9fe8a9');
        } else taxi.offerIn = 6;
      }
      return;
    }

    if (taxi.phase === 'offer') {
      // While a story job is running it keeps the marker; the hail just waits.
      if (this.stage === 'free') {
        this.#setTarget(taxi.ped.x, taxi.ped.z, '#7be382');
        this.#objective('TAXI DASH', 'Pick up the passenger', this.#distTo(taxi.ped.x, taxi.ped.z));
      }
      const car = world.playerVehicle;
      const stoppedBeside = car && Math.abs(car.speed) < 1.2 && dist2d(car.x, car.z, taxi.ped.x, taxi.ped.z) < 4.5;
      if (stoppedBeside) {
        taxi.ped.state = 'toCar';
        taxi.ped.target = { x: car.x, z: car.z };
        taxi.phase = 'pickup';
      }
      if (dist2d(taxi.ped.x, taxi.ped.z, world.playerPos.x, world.playerPos.z) > 130) this.#dropTaxi();
      return;
    }

    if (taxi.phase === 'pickup') {
      const car = world.playerVehicle;
      if (!car) { this.#dropTaxi(); return; }
      taxi.ped.target = { x: car.x, z: car.z };
      return;
    }

    if (taxi.phase === 'ride') {
      taxi.timer += dt;
      if (this.stage === 'free') {
        this.#setTarget(taxi.dest.x, taxi.dest.z, '#7be382');
        this.#objective('TAXI DASH', 'Drive your passenger to the green marker', this.#distTo(taxi.dest.x, taxi.dest.z));
      }
      const car = world.playerVehicle;
      if (!car) { this.#dropTaxi(true); return; }
      const arrivedStopped = dist2d(car.x, car.z, taxi.dest.x, taxi.dest.z) < 6.5 && Math.abs(car.speed) < 1.2;
      if (arrivedStopped) {
        // The fare: a base, plus distance, plus a tip for a quick ride.
        const fare = Math.round(30 + taxi.distance * 0.4 + Math.max(0, 40 - taxi.timer * 0.4));
        world.addCash(fare);
        world.hud.toast('FARE PAID', `Taxi Dash · +$${fare}`);
        world.stats.taxiFares += 1;
        taxi.ped.state = 'walk';
        taxi.ped.target = null;
        taxi.ped.x = taxi.dest.x + 2;
        taxi.ped.z = taxi.dest.z + 2;
        taxi.phase = 'none';
        taxi.ped = null;
        taxi.offerIn = world.rng.range(16, 30);
        world.saveGame();
      }
    }
  }

  /** A passenger reached the car: choose their destination and start the ride. */
  #pedArrived(ped) {
    const taxi = this.taxi;
    if (taxi.phase !== 'pickup' || taxi.ped !== ped) return;
    ped.state = 'riding';
    const poi = this.world.rng.pick(Object.values(POIS));
    taxi.dest = { x: poi.x + this.world.rng.range(-8, 8), z: poi.z + this.world.rng.range(-8, 8) };
    taxi.distance = dist2d(ped.x, ped.z, taxi.dest.x, taxi.dest.z);
    taxi.timer = 0;
    taxi.phase = 'ride';
    this.world.hud.message(`Passenger: "Take me to ${poi.name} — step on it."`, '#9fe8a9');
  }

  /** Abandon the current hail or fare, and schedule the next one. */
  #dropTaxi(stranded = false) {
    const taxi = this.taxi;
    if (taxi.ped) {
      taxi.ped.state = 'walk';
      taxi.ped.target = null;
      if (stranded) {
        taxi.ped.x = this.world.playerPos.x + 2;
        taxi.ped.z = this.world.playerPos.z + 2;
      }
    }
    taxi.ped = null;
    taxi.phase = 'none';
    taxi.offerIn = this.world.rng.range(14, 24);
    if (this.stage === 'free') this.#clearTarget();
  }
}
