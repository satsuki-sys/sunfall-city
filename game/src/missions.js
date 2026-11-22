// missions.js — the work: Dalia Marín's three-job story chain, the
// repeatable Taxi Dash fares, and the twelve Sun Discs. This system owns
// the objective the HUD shows, the beacon that marks it in the world, and
// every payout. It reads the world; the world reads its objective.

import * as THREE from 'three';
import { DISC_SPOTS, DISC_VALUE, DISC_SET_BONUS, PLACES, clamp } from './config.js';
import { glowTexture, groundHeightAt } from './city.js';
import { Car } from './vehicles.js';

const JOB_NAMES = ['First Light Run', 'Borrowed Light', 'The Long Pier'];

export class Missions {
  constructor(scene, save) {
    this.save = save;
    this.stage = save.stage;
    this.phase = 'meet';
    this.timer = null;             // seconds left on the current leg, or null
    this.objective = { text: '', x: null, z: null };
    this.fare = null;              // active taxi fare, or null
    this.fareCooldown = 14;
    this.gt = null;

    // The objective beacon: a column of light and a ring on the ground.
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 34, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffc94e, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.beacon.position.y = 17;
    scene.add(this.beacon);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 1.9, 28),
      new THREE.MeshBasicMaterial({ color: 0xffc94e, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    scene.add(this.ring);

    // The Sun Discs still waiting to be found.
    this.discs = [];
    const glow = glowTexture();
    DISC_SPOTS.forEach((spot, i) => {
      if (save.discs.includes(i)) return;
      const g = new THREE.Group();
      const coin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 0.13, 22),
        new THREE.MeshStandardMaterial({ color: 0xf2b83c, emissive: 0x8a5a10, roughness: 0.3, metalness: 0.7 }),
      );
      coin.rotation.x = Math.PI / 2;
      g.add(coin);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glow, color: 0xffbe4e, transparent: true, opacity: 0.75, depthWrite: false,
      }));
      halo.scale.setScalar(2.7);
      g.add(halo);
      const y = groundHeightAt(spot.x, spot.z) + 1.15;
      g.position.set(spot.x, y, spot.z);
      scene.add(g);
      this.discs.push({ index: i, spot, group: g, taken: false });
    });

    // The amber Solstice GT waits on the Aurora Motors lot from the start;
    // job two is the day Nico finally takes it.
    this.gt = new Car('gt', 0xe8a33c);
    this.gt.place(-84, 17, Math.PI / 2);
    scene.add(this.gt.mesh);

    // The taxi flag: a floating "!" that rides above a fare's head.
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g2 = c.getContext('2d');
    g2.fillStyle = '#ffd94e'; g2.beginPath(); g2.arc(32, 32, 29, 0, Math.PI * 2); g2.fill();
    g2.fillStyle = '#24303c'; g2.font = 'bold 44px sans-serif'; g2.textAlign = 'center';
    g2.fillText('!', 32, 47);
    const tex = new THREE.CanvasTexture(c);
    this.flagSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
    this.flagSprite.scale.setScalar(1.1);
    this.flagSprite.visible = false;
    scene.add(this.flagSprite);

    this.setObjectiveForStage();
  }

  // --- story -----------------------------------------------------------------

  setObjectiveForStage() {
    if (this.stage === 0) {
      this.phase = 'meet';
      this.objective = { text: 'Meet Dalia at Café Brisa', x: PLACES.cafe.x, z: PLACES.cafe.z };
    } else if (this.stage === 1) {
      this.phase = 'steal';
      this.objective = { text: 'Steal the amber Solstice GT from Aurora Motors', x: -84, z: 17 };
    } else if (this.stage === 2) {
      this.phase = 'retrieve';
      this.objective = { text: 'Lift the case at the pier head', x: PLACES.pierHead.x, z: PLACES.pierHead.z };
    } else {
      this.phase = 'done';
      this.objective = { text: 'Free roam — Taxi Dash fares and Sun Discs remain', x: null, z: null };
    }
    this.timer = null;
    this.gtTimerStarted = false;
  }

  failLeg(world, why) {
    world.audio.fail();
    world.hud.toast(`Job failed — ${why}. Dalia will give you another chance.`);
    this.setObjectiveForStage();
  }

  completeJob(world, payout, note) {
    this.save.cash += payout;
    this.save.stage += 1;
    this.stage = this.save.stage;
    world.audio.cash();
    world.hud.toast(`Job done: +$${payout}. ${note}`);
    if (this.stage < 3) world.hud.toast(`NEW JOB: ${JOB_NAMES[this.stage]}`);
    else world.hud.toast('Story complete — the city is yours.');
    this.setObjectiveForStage();
    world.persist();
  }

  updateStory(dt, world) {
    const p = world.player;
    const px = p.pos.x, pz = p.pos.z;
    if (this.timer !== null) {
      this.timer -= dt;
      if (this.timer <= 0) { this.failLeg(world, 'out of time'); return; }
    }
    if (this.stage === 0) {
      if (this.phase === 'meet') {
        if (!p.driving && Math.hypot(px - PLACES.cafe.x, pz - PLACES.cafe.z) < 3.6) {
          world.hud.showBriefing('First Light Run',
            'Dalia slides a cooler across the counter. "Cold storage, north-east docks, before it warms up. You drive careful, you eat tonight."');
          this.phase = 'carry';
          this.timer = 150;
          this.objective = { text: 'Deliver the cooler to Dockside Cold Storage', x: PLACES.storage.x, z: PLACES.storage.z };
        }
      } else if (this.phase === 'carry') {
        if (Math.hypot(px - PLACES.storage.x, pz - PLACES.storage.z) < 7) {
          this.completeJob(world, 150, 'The cooler arrives still cold.');
        }
      }
    } else if (this.stage === 1) {
      if (this.phase === 'steal') {
        this.objective = {
          text: p.driving === this.gt ? 'Deliver the Solstice GT to Berto\'s Body Shop' : 'Steal the amber Solstice GT from Aurora Motors',
          x: p.driving === this.gt ? PLACES.berto.x : -84,
          z: p.driving === this.gt ? PLACES.berto.z : 17,
        };
        if (p.driving === this.gt && !this.gtTimerStarted) {
          this.gtTimerStarted = true;
          this.timer = 180;
          world.hud.showBriefing('Borrowed Light',
            'The GT purrs awake. Berto is waiting across town — and Berto pays full price only for a car without a scratch on it.');
          world.commitCrime(1, 'a stolen GT');
        }
      }
      if (this.gtTimerStarted && p.driving === this.gt
          && Math.hypot(px - PLACES.berto.x, pz - PLACES.berto.z) < 7.5) {
        const clean = this.gt.damage <= 35;
        this.gtTimerStarted = false;
        this.completeJob(world, clean ? 300 : 150, clean ? 'Not a scratch on her.' : 'Berto winces at the dents and pays half.');
      }
    } else if (this.stage === 2) {
      if (this.phase === 'retrieve') {
        if (!p.driving && Math.hypot(px - PLACES.pierHead.x, pz - PLACES.pierHead.z) < 4.2) {
          this.phase = 'escape';
          world.combat.guard.aggro = true;
          world.setWanted(3);
          world.hud.showBriefing('The Long Pier',
            'The case is heavy and the guard is shouting. Lose the heat — all of it — and Dalia makes it worth your while.');
          this.objective = { text: 'Lose the heat', x: null, z: null };
        }
      } else if (this.phase === 'escape') {
        if (world.wanted === 0) this.completeJob(world, 500, 'The case changes hands. Nobody saw a thing.');
      }
    }
  }

  // --- taxi --------------------------------------------------------------------

  updateTaxi(dt, world) {
    const p = world.player;
    if (this.fare) {
      const f = this.fare;
      if (f.state === 'pickup') {
        this.objectiveOverride = { text: 'Pick up the fare', x: f.ped.pos.x, z: f.ped.pos.z };
        this.flagSprite.visible = true;
        this.flagSprite.position.set(f.ped.pos.x, 2.3, f.ped.pos.z);
        if (f.ped.down) { this.endFare(world, 'The fare is in no state to travel.'); return; }
        if (p.driving && Math.abs(p.car.speed) < 1
            && Math.hypot(p.pos.x - f.ped.pos.x, p.pos.z - f.ped.pos.z) < 4.2) {
          f.state = 'ride';
          f.ped.mesh.visible = false;
          const dests = [PLACES.storage, PLACES.hospital, PLACES.station, PLACES.berto, PLACES.cafe,
            { x: -26, z: 26, label: 'Palmetto Park' }, { x: 26, z: -26, label: 'Founders Plaza' }, { x: 0, z: 116, label: 'the boardwalk' }];
          f.dest = dests[(Math.random() * dests.length) | 0];
          const d = Math.hypot(p.pos.x - f.dest.x, p.pos.z - f.dest.z);
          f.timer = d / 8.5 + 30;
          f.fareValue = Math.round(26 + d * 0.32);
          this.flagSprite.visible = false;
          world.hud.toast(`Fare aboard — ${f.dest.label}, $${f.fareValue} on the meter.`);
        }
      } else if (f.state === 'ride') {
        this.objectiveOverride = { text: `Take the fare to ${f.dest.label}`, x: f.dest.x, z: f.dest.z };
        f.timer -= dt;
        if (!p.driving) { this.endFare(world, 'The fare gets out and walks.'); return; }
        if (f.timer <= 0) { this.endFare(world, 'Too slow — the fare bails out.'); return; }
        this.fareTimer = f.timer;
        if (Math.hypot(p.pos.x - f.dest.x, p.pos.z - f.dest.z) < 7.5 && Math.abs(p.car.speed) < 2) {
          const tip = f.timer > 18 ? 15 : 0;
          this.save.cash += f.fareValue + tip;
          this.save.fares += 1;
          world.audio.cash();
          world.hud.toast(`Fare paid: $${f.fareValue}${tip ? ` + $${tip} tip` : ''}.`);
          f.ped.mesh.visible = true;
          f.ped.pos.set(p.pos.x + 2, 0, p.pos.z + 2);
          this.fare = null;
          this.fareTimer = null;
          this.objectiveOverride = null;
          this.fareCooldown = 16 + Math.random() * 14;
          world.persist();
        }
        return;
      }
      return;
    }
    this.objectiveOverride = null;
    this.fareTimer = null;
    this.flagSprite.visible = false;
    if (!p.driving || this.stage < 0) return;
    this.fareCooldown -= dt;
    if (this.fareCooldown <= 0) {
      this.fareCooldown = 6;
      const ped = world.peds.nearestStanding(p.pos.x, p.pos.z, 55);
      if (ped && Math.hypot(ped.pos.x - p.pos.x, ped.pos.z - p.pos.z) > 9) {
        this.fare = { state: 'pickup', ped };
        world.hud.toast('A fare is flagging you down!');
      }
    }
  }

  endFare(world, why) {
    if (this.fare && this.fare.ped) this.fare.ped.mesh.visible = true;
    this.fare = null;
    this.fareTimer = null;
    this.objectiveOverride = null;
    this.flagSprite.visible = false;
    this.fareCooldown = 20;
    world.hud.toast(why);
  }

  // --- discs -------------------------------------------------------------------

  updateDiscs(dt, world) {
    const p = world.player;
    for (const disc of this.discs) {
      if (disc.taken) continue;
      disc.group.rotation.y += dt * 2.2;
      disc.group.position.y = groundHeightAt(disc.spot.x, disc.spot.z) + 1.15 + Math.sin(performance.now() / 480 + disc.index) * 0.12;
      if (Math.hypot(p.pos.x - disc.spot.x, p.pos.z - disc.spot.z) < 1.7) {
        disc.taken = true;
        disc.group.visible = false;
        this.save.discs.push(disc.index);
        this.save.cash += DISC_VALUE;
        world.audio.jingle();
        const n = this.save.discs.length;
        world.hud.toast(`Sun Disc found at ${disc.spot.name} — ${n}/12, +$${DISC_VALUE}.`);
        if (n === DISC_SPOTS.length) {
          this.save.cash += DISC_SET_BONUS;
          world.hud.toast(`The full set! +$${DISC_SET_BONUS} bonus.`);
          world.audio.cash();
        }
        world.persist();
      }
    }
  }

  update(dt, world) {
    this.updateStory(dt, world);
    this.updateTaxi(dt, world);
    this.updateDiscs(dt, world);
    const obj = this.objectiveOverride || this.objective;
    if (obj.x === null || obj.x === undefined) {
      this.beacon.visible = false; this.ring.visible = false;
    } else {
      this.beacon.visible = true; this.ring.visible = true;
      this.beacon.position.x = obj.x; this.beacon.position.z = obj.z;
      this.ring.position.set(obj.x, groundHeightAt(obj.x, obj.z) + 0.25, obj.z);
      const s = 1 + Math.sin(performance.now() / 300) * 0.12;
      this.ring.scale.setScalar(s);
    }
  }

  // Remove everything this system put in the scene, so a fresh run can be
  // built on a clean city (NEW GAME / CONTINUE from the title screen).
  dispose(scene) {
    scene.remove(this.beacon);
    scene.remove(this.ring);
    scene.remove(this.flagSprite);
    for (const disc of this.discs) scene.remove(disc.group);
    if (this.gt) scene.remove(this.gt.mesh);
  }

  currentObjective() { return this.objectiveOverride || this.objective; }
  currentTimer() {
    if (this.fareTimer !== null && this.fareTimer !== undefined) return this.fareTimer;
    return this.timer;
  }
  discCount() { return this.save.discs.length; }
}
