// The work: Dalia Marín's three-job story chain, the Taxi Dash fares that
// fill the gaps, and the twelve Sun Discs hidden at the city's landmarks.
// Stages live in the save profile; timers and half-done errands live here.

import * as THREE from 'three';
import { clamp } from './config.js';
import { groundHeightAt, glowSprite } from './city.js';
import { makeFigure } from './player.js';

// Twelve discs, twelve landmarks — pier head to avenue median.
export const DISC_SPOTS = [
  { x: 0, z: 284, label: 'the pier head' },
  { x: -40, z: 150, label: 'the boardwalk' },
  { x: 90, z: 184, label: 'the beach' },
  { x: -166, z: 46, label: 'Aurora Motors' },
  { x: 50, z: 50, label: 'the Café Brisa corner' },
  { x: 96, z: -16, label: 'the hospital steps' },
  { x: 32, z: -140, label: 'the station forecourt' },
  { x: 176, z: 112, label: 'the warehouse yard' },
  { x: -64, z: -96, label: 'the avenue median' },
  { x: 74, z: -58, label: 'the downtown corner' },
  { x: -96, z: -32, label: 'Palm Court' },
  { x: -84, z: 112, label: "Berto's forecourt" },
];

const TAXI_DESTS = ['cafeDoor', 'warehouseYard', 'garageForecourt', 'hospitalSteps', 'stationForecourt', 'park', 'beach', 'lot'];

export class Missions {
  constructor(world) {
    this.world = world;
    this.profile = world.profile;
    this.stage = this.profile.stage;
    this.stageTimer = null;   // seconds left on the delivery run
    this.gtTaken = false;
    this.caseTaken = false;
    this.taxi = { state: 'idle', cd: 14, marker: null, dest: null, timer: 0, fare: 0, figure: null };
    this.markerPos = null;

    // Sun Disc meshes: a standing gold coin with a halo, spinning slowly.
    this.discGroup = new THREE.Group();
    world.scene.add(this.discGroup);
    this.discs = DISC_SPOTS.map((spot, i) => {
      const g = new THREE.Group();
      const coin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 0.1, 22),
        new THREE.MeshLambertMaterial({ color: 0xffc93d, emissive: 0x9a6d00 }),
      );
      coin.rotation.x = Math.PI / 2;
      g.add(coin);
      const inner = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.12, 18),
        new THREE.MeshLambertMaterial({ color: 0xffe89a, emissive: 0xa87400 }),
      );
      inner.rotation.x = Math.PI / 2;
      g.add(inner);
      const halo = glowSprite(0xffbe3d, 2.7, 0.5);
      g.add(halo);
      const y = groundHeightAt(spot.x, spot.z) + 1.15;
      g.position.set(spot.x, y, spot.z);
      g.visible = !this.profile.discs.includes(i);
      this.discGroup.add(g);
      return { ...spot, mesh: g, taken: this.profile.discs.includes(i) };
    });

    // The objective beacon: a column of light the whole city can see.
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffd34d, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 60, 12, 1, true), beamMat);
    this.beam.visible = false;
    world.scene.add(this.beam);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd34d, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.7, 28), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    world.scene.add(this.ring);
  }

  get landmarks() {
    return this.world.city.landmarks;
  }

  // What the HUD should be saying right now.
  objective() {
    const L = this.landmarks;
    const taxi = this.taxi;
    if (taxi.state === 'pickup') return { title: 'Taxi Dash — pick up your fare', sub: 'Stop beside the passenger', marker: taxi.marker, timer: null };
    if (taxi.state === 'deliver') return { title: 'Taxi Dash — drop them off', sub: `$${taxi.fare} on the meter`, marker: taxi.dest, timer: taxi.timer };
    switch (this.stage) {
      case 0:
        return { title: 'Meet Dalia at Café Brisa', sub: 'She runs half the docks and owes you nothing — yet', marker: L.cafeDoor, timer: null };
      case 1:
        return { title: 'First Light Run — deliver the cooler', sub: 'Dockside Cold Storage, before it warms up', marker: L.warehouseYard, timer: this.stageTimer };
      case 2:
        return this.gtTaken
          ? { title: 'Borrowed Light — deliver the Solstice GT', sub: "Berto's Body Shop, and not a scratch on it", marker: L.garageForecourt, timer: null }
          : { title: 'Borrowed Light — steal the Solstice GT', sub: 'The amber GT on the Aurora Motors lot', marker: new THREE.Vector3(L.gtSpot.x, 0, L.gtSpot.z), timer: null };
      case 3:
        return this.caseTaken
          ? { title: 'The Long Pier — lose the heat', sub: 'Break away until the stars are gone', marker: null, timer: null }
          : { title: 'The Long Pier — take the case', sub: 'End of the pier. Mind the harbour guard', marker: L.pierEnd, timer: null };
      default:
        return { title: 'Free roam', sub: 'Taxi Dash fares, Sun Discs, and the whole city', marker: null, timer: null };
    }
  }

  pay(amount, why) {
    const w = this.world;
    w.profile.cash += amount;
    w.persist();
    w.audio.cash();
    w.hud.toast(`${why} +$${amount}`);
  }

  setStage(n) {
    this.stage = n;
    this.profile.stage = n;
    this.world.persist();
  }

  onEnterCar(car) {
    const w = this.world;
    if (this.stage === 2 && !this.gtTaken && car === w.gtCar) {
      this.gtTaken = true;
      w.hud.brief('Borrowed Light', 'That is the one — amber paint, warm engine. Take it across town to Berto\'s Body Shop and keep it pretty.');
      w.audio.jingle();
    }
  }

  update(dt, t) {
    const w = this.world;
    const p = w.playerPos();
    // Discs spin and bob whether or not anyone is watching.
    for (let i = 0; i < this.discs.length; i++) {
      const d = this.discs[i];
      if (d.taken) continue;
      d.mesh.rotation.y = t * 1.6 + i;
      d.mesh.position.y = groundHeightAt(d.x, d.z) + 1.15 + Math.sin(t * 2 + i * 1.7) * 0.16;
      const dx = p.x - d.x, dz = p.z - d.z;
      if (dx * dx + dz * dz < 1.7 * 1.7 && Math.abs(p.y - d.mesh.position.y) < 2.6) {
        this.collectDisc(i);
      }
    }
    // Beacon follows the current objective.
    const obj = this.objective();
    this.markerPos = obj.marker;
    if (obj.marker) {
      this.beam.visible = true;
      this.ring.visible = true;
      this.beam.position.set(obj.marker.x, 30, obj.marker.z);
      this.ring.position.set(obj.marker.x, groundHeightAt(obj.marker.x, obj.marker.z) + 0.25 + Math.sin(t * 3) * 0.08, obj.marker.z);
    } else {
      this.beam.visible = false;
      this.ring.visible = false;
    }
    w.hud.setObjective(obj.title, obj.sub);
    w.hud.setTimer(obj.timer);

    if (w.mode !== 'playing') return;
    const near = (v, r) => {
      const dx = p.x - v.x, dz = p.z - v.z;
      return dx * dx + dz * dz < r * r;
    };

    // --- the story chain ------------------------------------------------------
    if (this.stage === 0 && near(this.landmarks.cafeDoor, 4.5)) {
      w.hud.brief('First Light Run', 'Dalia slides a cooler across the counter. "Cold storage, dockside, two minutes of honest driving. The clock is the whole job, Nico."');
      w.audio.jingle();
      this.stageTimer = 120;
      this.setStage(1);
    } else if (this.stage === 1) {
      this.stageTimer -= dt;
      if (this.stageTimer <= 0) {
        this.stageTimer = null;
        this.setStage(0);
        w.hud.toast('The cooler went warm. Dalia will run it again — go see her.');
      } else if (near(this.landmarks.warehouseYard, 7.5)) {
        this.stageTimer = null;
        this.setStage(2);
        this.pay(175, 'Delivery made.');
        w.hud.brief('Borrowed Light', 'The warehouse boss counts out your fee and leans in: "Aurora Motors has an amber Solstice GT with your name on the keys. Berto is expecting it."');
      }
    } else if (this.stage === 2 && this.gtTaken && w.playerCar === w.gtCar && near(this.landmarks.garageForecourt, 8.5)) {
      this.setStage(3);
      this.gtTaken = false;
      this.pay(325, 'GT delivered.');
      w.hud.brief('The Long Pier', 'Berto wipes his hands and nods south. "Last one. A case, end of the pier, my man watching it has a rifle and no sense of humour. Bring it back — and ditch the heat before you come near my shop."');
    } else if (this.stage === 3 && !this.caseTaken && near(this.landmarks.pierEnd, 4.2)) {
      this.caseTaken = true;
      w.police.addCrime(0, 3);
      w.guard.provoke();
      w.hud.brief('The Long Pier', 'The case is heavier than it looks. Sirens already — lose the heat, Nico.');
      w.audio.jingle();
    } else if (this.stage === 3 && this.caseTaken && w.police.wanted <= 0) {
      this.caseTaken = false;
      this.setStage(4);
      this.pay(550, 'Case delivered, heat gone.');
      w.hud.brief('Sunfall is yours', 'Dalia\'s text lands as you park: "Clean work. The city is open — fares, discs, and whatever trouble you go looking for."');
    }

    this.updateTaxi(dt, near);
  }

  collectDisc(i) {
    const w = this.world;
    const d = this.discs[i];
    d.taken = true;
    d.mesh.visible = false;
    this.profile.discs.push(i);
    w.persist();
    w.audio.pickup();
    const n = this.profile.discs.length;
    w.profile.cash += 25;
    w.persist();
    if (n >= 12) {
      w.profile.cash += 250;
      w.persist();
      w.audio.jingle();
      w.hud.brief('The full set!', 'All twelve Sun Discs. Somewhere a collector just felt a disturbance. +$250 bonus.');
    } else {
      w.hud.toast(`◆ Sun Disc ${n}/12 — ${d.label} +$25`);
    }
    w.hud.setDiscs(n);
  }

  updateTaxi(dt, near) {
    const w = this.world;
    const taxi = this.taxi;
    if (taxi.state === 'idle') {
      if (w.playerCar && this.stage >= 1) {
        taxi.cd -= dt;
        if (taxi.cd <= 0) {
          // A fare flags you down at a random street corner.
          const avenues = [-192, -128, -64, 0, 64, 128, 192];
          const streets = [-192, -128, -64, 0, 64, 128];
          const ax = avenues[Math.floor(Math.random() * avenues.length)];
          const sz = streets[Math.floor(Math.random() * streets.length)];
          taxi.marker = new THREE.Vector3(ax + 10.5, 0, sz + 10.5);
          taxi.state = 'pickup';
          taxi.figure = makeFigure({ shirt: 0xf2b13d, trousers: 0x37414f, skin: 0xf2c79b, cap: 0 });
          taxi.figure.position.copy(taxi.marker);
          taxi.figure.position.y = groundHeightAt(taxi.marker.x, taxi.marker.z);
          w.scene.add(taxi.figure);
          w.hud.toast('🚕 A fare is flagging you down!');
        }
      }
      return;
    }
    if (taxi.state === 'pickup') {
      if (!w.playerCar) return this.cancelTaxi('Fare given up — they walked.');
      if (near(taxi.marker, 7) && Math.abs(w.playerCar.speed) < 1.2) {
        const destKey = TAXI_DESTS[Math.floor(Math.random() * TAXI_DESTS.length)];
        taxi.dest = this.landmarks[destKey].clone();
        const dist = Math.hypot(taxi.dest.x - taxi.marker.x, taxi.dest.z - taxi.marker.z);
        taxi.fare = Math.round(16 + dist * 0.14);
        taxi.timer = dist / 7.5 + 22;
        taxi.state = 'deliver';
        if (taxi.figure) {
          w.scene.remove(taxi.figure);
          taxi.figure = null;
        }
        w.hud.toast('Passenger in. The clock is running.');
      }
      return;
    }
    // deliver
    taxi.timer -= dt;
    if (taxi.timer <= 0) return this.cancelTaxi('Fare walked out — too slow.');
    if (!w.playerCar) return this.cancelTaxi('Fare stranded. They are not happy.');
    if (near(taxi.dest, 8) && Math.abs(w.playerCar.speed) < 1.6) {
      const tip = taxi.timer > 9 ? Math.round(taxi.fare * 0.4) : 0;
      this.profile.fares += 1;
      this.pay(taxi.fare + tip, tip ? `Fare + tip.` : 'Fare paid.');
      taxi.state = 'idle';
      taxi.cd = 16 + Math.random() * 18;
      taxi.dest = null;
    }
  }

  cancelTaxiSilent() {
    const w = this.world;
    if (this.taxi.figure) {
      w.scene.remove(this.taxi.figure);
      this.taxi.figure = null;
    }
    this.taxi.state = 'idle';
    this.taxi.cd = 14;
    this.taxi.dest = null;
    this.taxi.marker = null;
  }

  cancelTaxi(why) {
    const w = this.world;
    if (this.taxi.figure) {
      w.scene.remove(this.taxi.figure);
      this.taxi.figure = null;
    }
    this.taxi.state = 'idle';
    this.taxi.cd = 12 + Math.random() * 14;
    this.taxi.dest = null;
    w.hud.toast(why);
  }
}
