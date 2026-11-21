// missions.js — the work: Marisol's three-job story chain, the repeatable
// taxi fares, and the twelve sun discs. The story runs meet → deliver →
// steal → pier score, each leg an objective with a marker the HUD and the
// minimap point at; the delivery and the taxi runs are timed. The discs are
// their own little economy: golden coins spinning at landmarks, collected
// on foot or by car, $25 apiece and $250 for the set, remembered by the
// save file. This module holds the state machines; the world supplies the
// player, the police and the money.

import * as THREE from 'three';
import { makeGlowTexture } from './city.js';
import {
  DISC_SPOTS, DISC_VALUE, DISC_SET_BONUS, PLACES, TUNE,
} from './config.js';

// The twelve discs as spinning golden coins with a halo each.
export class SunDiscs {
  constructor(world) {
    this.world = world;
    const coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.13, 22);
    const gold = new THREE.MeshStandardMaterial({
      color: 0xffc93c, emissive: 0xcc8f1a, emissiveIntensity: 0.55,
      roughness: 0.3, metalness: 0.7,
    });
    this.discs = DISC_SPOTS.map((spot, i) => {
      const group = new THREE.Group();
      const coin = new THREE.Mesh(coinGeo, gold);
      coin.rotation.x = Math.PI / 2; // stand the coin on its edge
      coin.castShadow = true;
      group.add(coin);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlowTexture(), color: 0xffbe3c, transparent: true, opacity: 0.65,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      halo.scale.setScalar(3.1);
      group.add(halo);
      group.position.set(spot.x, 1.15, spot.z);
      world.scene.add(group);
      return { ...spot, index: i, group, taken: world.profile.discs.includes(i) };
    });
    for (const d of this.discs) d.group.visible = !d.taken;
  }

  get found() {
    return this.discs.filter((d) => d.taken).length;
  }

  update(dt, elapsed) {
    const focus = this.world.playerCar || this.world.player;
    for (const d of this.discs) {
      if (d.taken) continue;
      d.group.rotation.y += dt * 2.4;
      d.group.position.y = 1.15 + Math.sin(elapsed * 2 + d.index) * 0.14;
      const dist = Math.hypot(focus.pos.x - d.x, focus.pos.z - d.z);
      if (dist < TUNE.discPickupRange) {
        d.taken = true;
        d.group.visible = false;
        this.world.onDiscCollected(d);
      }
    }
  }
}

export class Missions {
  constructor(world) {
    this.world = world;
    this.discs = new SunDiscs(world);
    this.stage = world.profile.stage;
    this.stolen = false;      // the Vireo has been taken (stage 2)
    this.caseTaken = false;   // the pier case is in hand (stage 3)
    this.timer = null;        // seconds left on the current timed leg
    this.taxi = null;         // {phase, x, z, timer, distance}
    this.taxiCooldown = 4;
    this.objective = null;
    this.refreshObjective();
  }

  // The objective the HUD banner and the minimap currently show. A live
  // taxi fare outranks the story; after the story, fares are all there is.
  refreshObjective() {
    const w = this.world;
    if (this.taxi) {
      this.objective = this.taxi.phase === 'pickup'
        ? { title: 'TAXI DASH', text: 'Pick up the fare', target: { x: this.taxi.x, z: this.taxi.z } }
        : { title: 'TAXI DASH', text: 'Get them there in time', target: { x: this.taxi.x, z: this.taxi.z } };
      return;
    }
    switch (this.stage) {
      case 0:
        this.objective = { title: 'FIRST RUN', text: 'Meet Marisol at Café Solano', target: PLACES.marisol };
        break;
      case 1:
        this.objective = { title: 'FIRST RUN', text: 'Deliver the package to the Dockside Warehouse', target: PLACES.warehouseDoor };
        break;
      case 2:
        this.objective = this.stolen
          ? { title: 'BORROWED SUNSHINE', text: "Stash the Vireo at Tito's Garage", target: PLACES.garageDoor }
          : { title: 'BORROWED SUNSHINE', text: 'Steal the coral Vireo GT from Shoreline Motors', target: PLACES.vireoSpot };
        break;
      case 3:
        this.objective = this.caseTaken
          ? { title: 'THE SUNSET SCORE', text: 'Lose the heat — wanted level must reach zero', target: null }
          : { title: 'THE SUNSET SCORE', text: 'Take the case from the pier', target: PLACES.pierCase };
        break;
      default:
        this.objective = { title: 'SUNFALL CITY', text: 'Free roam — taxi fares pay, sun discs hide', target: null };
    }
    if (w.hud) w.hud.setObjective(this.objective.title, this.objective.text);
  }

  // World hook: the player just got into a car.
  onPlayerEnteredCar(car) {
    if (this.stage === 2 && !this.stolen && car === this.world.vireoCar) {
      this.stolen = true;
      this.world.police.raise(2);
      this.world.toast('That is the car. Now get it to Tito’s.');
      this.refreshObjective();
    }
  }

  arrive(kind) {
    const w = this.world;
    if (kind === 'meet') {
      this.stage = 1;
      this.timer = 170;
      w.toast('Marisol: “Package to the Dockside Warehouse. Clock is running.”');
      w.audio.toast();
    } else if (kind === 'deliver') {
      this.stage = 2;
      this.timer = null;
      w.addCash(140);
      w.toast('Delivered — +$140. Marisol has another job.');
    } else if (kind === 'stash') {
      this.stage = 3;
      w.addCash(220);
      w.toast('Vireo stashed — +$220. One last score, at the pier.');
    } else if (kind === 'case') {
      this.caseTaken = true;
      w.combat.guard.hostile = true;
      w.police.raise(3);
      w.toast('Case in hand — the guard is shooting, the heat is on. Lose them.');
    } else if (kind === 'escaped') {
      this.stage = 4;
      w.profile.storyDone = true;
      w.addCash(350);
      w.toast('Clean getaway — +$350. The city is yours now.');
    }
    w.profile.stage = this.stage;
    w.saveProfile();
    this.refreshObjective();
  }

  // Offer a taxi fare: a pickup somewhere on the kerbs, then a timed run.
  offerTaxi() {
    const w = this.world;
    const spots = [
      { x: 33, z: -58 }, { x: -81, z: 110 }, { x: 81, z: -14 }, { x: -33, z: 14 },
      { x: 129, z: 62 }, { x: -129, z: -34 }, { x: 57, z: 158 }, { x: -57, z: -106 },
    ];
    const pick = spots[(Math.random() * spots.length) | 0];
    this.taxi = { phase: 'pickup', x: pick.x, z: pick.z, timer: 0, distance: 0 };
    w.toast('A fare is waiting — drive to the marker.');
    this.refreshObjective();
  }

  update(dt) {
    const w = this.world;
    this.discs.update(dt, w.elapsed);
    const focus = w.playerCar || w.player;
    const distTo = (t) => Math.hypot(focus.pos.x - t.x, focus.pos.z - t.z);

    // Timed story leg: the First Run delivery.
    if (this.stage === 1 && this.timer !== null) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 170;
        w.toast('Too slow — Marisol sends you again. Clock reset.');
      }
    }

    // Story arrivals.
    if (this.objective && this.objective.target && !this.taxi) {
      const d = distTo(this.objective.target);
      if (d < TUNE.objectiveRange) {
        if (this.stage === 0) this.arrive('meet');
        else if (this.stage === 1) this.arrive('deliver');
        else if (this.stage === 2 && this.stolen && w.playerCar === w.vireoCar) this.arrive('stash');
        else if (this.stage === 3 && !this.caseTaken && !w.playerCar) this.arrive('case');
      }
    }
    // The escape leg completes the moment the heat is gone.
    if (this.stage === 3 && this.caseTaken && w.police.stars === 0) this.arrive('escaped');

    // Taxi fares: offered while driving with the story under way.
    if (!this.taxi && this.stage >= 1) {
      this.taxiCooldown -= dt;
      if (this.taxiCooldown <= 0 && w.playerCar) this.offerTaxi();
    }
    if (this.taxi) {
      const t = this.taxi;
      const d = distTo(t);
      if (t.phase === 'pickup') {
        if (w.playerCar && d < 5 && Math.abs(w.playerCar.speed) < 2) {
          const dests = [PLACES.warehouseDoor, PLACES.garageDoor, PLACES.hospitalDoor,
            PLACES.stationDoor, { x: 72, z: 140 }, { x: -120, z: 150 }, PLACES.marisol];
          const dest = dests[(Math.random() * dests.length) | 0];
          t.phase = 'dropoff';
          t.x = dest.x; t.z = dest.z;
          t.distance = Math.hypot(dest.x - focus.pos.x, dest.z - focus.pos.z);
          t.timer = t.distance / 8.5 + 30;
          w.toast('Fare aboard — get them there while the meter runs.');
          this.refreshObjective();
        }
      } else {
        t.timer -= dt;
        if (t.timer <= 0) {
          w.toast('The fare bailed out — no pay.');
          this.taxi = null;
          this.taxiCooldown = 8;
          this.refreshObjective();
        } else if (w.playerCar && d < 5.5 && Math.abs(w.playerCar.speed) < 2) {
          const pay = Math.round(18 + t.distance * 0.55) + (t.timer > t.distance / 8.5 * 0.4 ? 10 : 0);
          w.profile.taxiFares += 1;
          w.addCash(pay);
          w.toast(`Fare paid — +$${pay}.`);
          this.taxi = null;
          this.taxiCooldown = 10;
          this.refreshObjective();
        }
      }
    }

    // Keep the HUD's distance readout honest.
    if (w.hud) {
      w.hud.setObjectiveDistance(this.objective && this.objective.target
        ? distTo(this.objective.target) : null);
    }
  }
}
