// Missions: a three-job story for Rook, a courier who owes the city a favour,
// plus the repeatable Taxi Dash. Marisol at Café Solano hands out the work by
// phone banner; gold beacons mark the way, and the minimap target follows.
//
//   1. First Run         — pick up a package at the café, deliver it dockside.
//   2. Borrowed Sunshine — steal the coral Vireo GT from Shoreline Motors and
//                          deliver it to Tito's Garage while the heat rises.
//   3. The Sunset Score  — take the cash case off Palms Pier under a guard's
//                          nose, then lose the police to bank it.

import * as THREE from 'three';
import { POIS } from './city.js';
import { dist2d } from './random.js';
import { Guard } from './combat.js';

const CASE_POS = { x: -88, z: 330 };

export class Missions {
  constructor(world) {
    this.world = world;
    this.storyIndex = 0;      // 0,1,2 = the three jobs; 3 = story done
    this.stage = 'toCafe';
    this.target = null;       // {x, z, color} for the minimap
    this.taxi = { phase: 'none', ped: null, dest: null, timer: 0, offerIn: 14 };
    this.lastObjective = '';

    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xffd23e, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide,
    });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 34, 18, 1, true), beaconMat);
    this.beacon.position.y = 17;
    this.beacon.visible = false;
    world.scene.add(this.beacon);

    // The cash case waits at the end of the pier from the start.
    const caseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.3, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.7, emissive: 0x664d00, emissiveIntensity: 0.4 }),
    );
    caseMesh.position.set(CASE_POS.x, 0.9, CASE_POS.z);
    world.scene.add(caseMesh);
    this.caseMesh = caseMesh;
    this.guard = new Guard(world.scene, world.rng, CASE_POS.x + 4.5, CASE_POS.z - 9, Math.PI);
    world.guards.push(this.guard);

    world.onPedArrived = (ped) => this.#pedArrived(ped);
  }

  /** Restore story progress from a save. */
  restore(index) {
    this.storyIndex = Math.min(3, index);
    this.stage = ['toCafe', 'toLot', 'toPier', 'free'][this.storyIndex];
    this.guard.active = false;
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

  update(dt, t) {
    const world = this.world;
    this.beacon.material.opacity = 0.2 + Math.sin(t * 3) * 0.07;
    this.beacon.rotation.y += dt * 0.4;
    if (world.state === 'playing') {
      this.#updateStory(dt);
      this.#updateTaxi(dt);
    }
  }

  #updateStory(dt) {
    void dt;
    const world = this.world;
    const hud = world.hud;
    switch (this.stage) {
      case 'toCafe': {
        this.#setTarget(POIS.cafe.x, POIS.cafe.z);
        this.#objective('FIRST RUN', 'Meet Marisol at Café Solano', dist2d(world.playerPos.x, world.playerPos.z, POIS.cafe.x, POIS.cafe.z));
        if (this.#arrived(POIS.cafe.x, POIS.cafe.z, 7)) {
          hud.message('Marisol: "Rook. Take this to the Dockside Warehouse — no detours."', '#ffd98f');
          world.audio.pickup();
          this.stage = 'toWarehouse';
        }
        break;
      }
      case 'toWarehouse': {
        this.#setTarget(POIS.warehouse.x, POIS.warehouse.z);
        this.#objective('FIRST RUN', 'Deliver the package to the Dockside Warehouse', dist2d(world.playerPos.x, world.playerPos.z, POIS.warehouse.x, POIS.warehouse.z));
        if (this.#arrived(POIS.warehouse.x, POIS.warehouse.z, 8)) {
          world.addCash(150);
          hud.toast('JOB DONE', 'First Run · +$150');
          hud.message('Marisol: "Clean work. Tito has something louder for you."', '#ffd98f');
          this.storyIndex = 1;
          this.stage = 'toLot';
          world.saveGame();
        }
        break;
      }
      case 'toLot': {
        this.#setTarget(POIS.carLot.x, POIS.carLot.z);
        this.#objective('BORROWED SUNSHINE', 'Go to Shoreline Motors on the beachfront', dist2d(world.playerPos.x, world.playerPos.z, POIS.carLot.x, POIS.carLot.z));
        if (this.#arrived(POIS.carLot.x, POIS.carLot.z, 16)) {
          hud.message('Tito: "The coral Vireo GT, back row. She\'s yours — just take her."', '#ffd98f');
          this.stage = 'steal';
        }
        break;
      }
      case 'steal': {
        const car = world.markedCar;
        this.#setTarget(car.x, car.z);
        this.#objective('BORROWED SUNSHINE', 'Steal the coral Vireo GT', dist2d(world.playerPos.x, world.playerPos.z, car.x, car.z));
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
        this.#objective('BORROWED SUNSHINE', inCar ? "Deliver the Vireo GT to Tito's Garage" : 'Get back in the Vireo GT', dist2d(world.playerPos.x, world.playerPos.z, POIS.garage.x, POIS.garage.z));
        if (inCar && this.#arrived(POIS.garage.x, POIS.garage.z, 10)) {
          world.player.exitCar(world);
          world.markedCar.driver = 'parked';
          world.addCash(300);
          hud.toast('JOB DONE', 'Borrowed Sunshine · +$300');
          hud.message('Marisol: "One last thing, Rook. The pier. Sunset. Come hungry."', '#ffd98f');
          this.storyIndex = 2;
          this.stage = 'toPier';
          world.saveGame();
        }
        break;
      }
      case 'toPier': {
        this.#setTarget(POIS.pier.x, POIS.pier.z + 30);
        this.#objective('THE SUNSET SCORE', 'Head to the end of Palms Pier', dist2d(world.playerPos.x, world.playerPos.z, POIS.pier.x, POIS.pier.z + 30));
        if (this.#arrived(CASE_POS.x, CASE_POS.z, 16)) {
          this.guard.active = true;
          hud.message('A guard watches the case. Take it — fast, or quiet and quicker.', '#ff9d8a');
          this.stage = 'grab';
        }
        break;
      }
      case 'grab': {
        this.#setTarget(CASE_POS.x, CASE_POS.z);
        this.#objective('THE SUNSET SCORE', 'Grab the cash case', dist2d(world.playerPos.x, world.playerPos.z, CASE_POS.x, CASE_POS.z));
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
        if (this.taxi.phase === 'none') this.#clearTarget(), hud.clearObjective();
      }
    }
  }

  // --- Taxi Dash: the repeatable side job ---------------------------------

  #updateTaxi(dt) {
    const world = this.world;
    const taxi = this.taxi;
    if (this.storyIndex < 1) return;
    if (taxi.phase === 'none') {
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
      // The story keeps the marker while a job is running; the hail waits.
      if (this.stage === 'free') {
        this.#setTarget(taxi.ped.x, taxi.ped.z, '#7be382');
        this.#objective('TAXI DASH', 'Pick up the passenger', dist2d(world.playerPos.x, world.playerPos.z, taxi.ped.x, taxi.ped.z));
      }
      const car = world.playerVehicle;
      if (car && Math.abs(car.speed) < 1.2 && dist2d(car.x, car.z, taxi.ped.x, taxi.ped.z) < 4.5) {
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
        this.#objective('TAXI DASH', 'Drive your passenger to the green marker', dist2d(world.playerPos.x, world.playerPos.z, taxi.dest.x, taxi.dest.z));
      }
      const car = world.playerVehicle;
      if (!car) { this.#dropTaxi(true); return; }
      if (dist2d(car.x, car.z, taxi.dest.x, taxi.dest.z) < 6.5 && Math.abs(car.speed) < 1.2) {
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
