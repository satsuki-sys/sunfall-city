// The conductor: owns the renderer, the camera, the state machine
// (title → playing → paused → ended, plus the staged shot mode), and every
// consequence that crosses between systems — crimes, fines, damage, being
// busted, going down. Each specialist module does its own job; this file
// makes them one game.

import * as THREE from 'three';
import {
  DEFAULT_SEED, PALETTE, Rng, clamp,
} from './config.js';
import { buildCity } from './city.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { Hud } from './hud.js';
import { Minimap } from './minimap.js';
import { Player } from './player.js';
import { Car, collideCarPair } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { Police } from './police.js';
import { Guard } from './combat.js';
import { Pistol, WeaponFX, tagOf } from './weapons.js';
import { Missions } from './missions.js';
import { loadSave, storeSave, clearSave, freshProfile } from './save.js';
import { stageShot, frameShot } from './shots.js';

const STAGE_LABELS = ['Not started', 'First Light Run', 'Borrowed Light', 'The Long Pier', 'Story complete'];
const SPAWN = { x: 46, z: 58, angle: -0.52 };

export class Game {
  constructor(container, opts = {}) {
    this.container = container;
    this.seed = opts.seed ?? DEFAULT_SEED;
    this.shot = opts.shot ?? null;
    this.t = 0;
    this.mode = 'title';
    this.health = 100;
    this.lastDamageT = -99;
    this.shake = 0;
    this.endKind = 'downed';
    this.playerCar = null;
    this.prevKeys = new Set();

    // Renderer / scene / camera.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('outputColorSpace' in this.renderer) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(PALETTE.fog, 130, 560);
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1500);
    this.camera.position.set(120, 60, 190);
    this.camYaw = SPAWN.angle;
    this.camPitch = 0.3;

    // Systems.
    this.input = new Input(this.renderer.domElement);
    this.audio = new AudioSys();
    this.hud = new Hud();
    this.city = buildCity(this.scene, this.seed);
    this.colliders = this.city.colliders;

    this.player = new Player(this.scene);
    this.player.placeAt(SPAWN.x, SPAWN.z, SPAWN.angle);

    // Parked cars: kerbside spots, the Aurora lot, and one amber Solstice GT.
    this.parkedCars = [];
    const paintRng = new Rng(this.seed * 131 + 7);
    for (const s of this.city.parkedSpots) {
      this.parkedCars.push(new Car(this.scene, {
        x: s.x, z: s.z, angle: s.angle, color: paintRng.pick(PALETTE.carPaints), occupant: null,
      }));
    }
    for (const s of this.city.lotSpots) {
      this.parkedCars.push(new Car(this.scene, {
        x: s.x, z: s.z, angle: s.angle, color: paintRng.pick(PALETTE.carPaints), occupant: null,
      }));
    }
    const gt = this.city.landmarks.gtSpot;
    this.gtCar = new Car(this.scene, {
      x: gt.x, z: gt.z, angle: gt.angle, color: 0xf08a2d, sport: true, maxSpeed: 34, accel: 15, occupant: null,
    });
    this.parkedCars.push(this.gtCar);
    for (const car of this.parkedCars) {
      car.mesh.userData.tag = 'car';
      car.mesh.userData.carRef = car;
    }

    this.traffic = new Traffic(this.scene, new Rng(this.seed * 977 + 31), 10);
    for (const car of this.traffic.drivers) {
      car.mesh.userData.tag = 'car';
      car.mesh.userData.carRef = car;
    }
    this.peds = new Peds(this.scene, new Rng(this.seed * 613 + 3), 36);
    this.police = new Police(this.scene, this);
    this.guard = new Guard(this.scene, new THREE.Vector3(3.2, 0.55, 274));
    this.fx = new WeaponFX(this.scene);
    this.pistol = new Pistol(this.scene, this.camera, this.fx);

    const saved = loadSave();
    this.hasSave = !!saved;
    this.profile = saved ?? freshProfile();
    this.missions = new Missions(this);
    this.minimap = new Minimap(document.getElementById('minimap'));

    this.wireUi();
    if (this.shot) {
      this.mode = 'shot';
      document.getElementById('title-screen').style.display = 'none';
      stageShot(this, this.shot);
    }
    this.refreshHud();

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // --- plumbing the other modules lean on --------------------------------------
  persist() {
    storeSave(this.profile);
    this.hud.setCash(this.profile.cash);
  }
  playerPos() {
    return this.playerCar ? this.playerCar.pos : this.player.pos;
  }
  playerSpeed() {
    return this.playerCar ? Math.abs(this.playerCar.speed) : this.player.speedNow;
  }
  playerHeading() {
    return this.playerCar ? this.playerCar.angle : this.player.angle;
  }
  allCars() {
    return [...this.parkedCars, ...this.traffic.drivers, ...this.police.cruisers];
  }
  shootables() {
    const list = [this.city.group, this.guard.mesh];
    for (const ped of this.peds.list) list.push(ped.mesh);
    for (const car of this.allCars()) {
      if (!car.mesh.userData.tag) {
        car.mesh.userData.tag = 'car';
        car.mesh.userData.carRef = car;
      }
      list.push(car.mesh);
    }
    return list;
  }

  // --- UI wiring -----------------------------------------------------------------
  wireUi() {
    const el = (id) => document.getElementById(id);
    this.titleEl = el('title-screen');
    this.pauseEl = el('pause-screen');
    this.endEl = el('end-screen');
    this.hudEl = el('hud');
    if (!this.hasSave) el('btn-continue').style.display = 'none';
    el('btn-new').addEventListener('click', () => this.startNewGame());
    el('btn-continue').addEventListener('click', () => this.continueGame());
    el('btn-resume').addEventListener('click', () => this.resumeGame());
    el('btn-restart').addEventListener('click', () => this.startNewGame());
    el('btn-respawn').addEventListener('click', () => this.respawn());
    this.input.onLockLost = () => {
      if (this.mode === 'playing') this.pauseGame();
    };
    this.renderer.domElement.addEventListener('click', () => {
      this.audio.ensure();
      if (this.mode === 'playing' && !this.input.locked) this.input.lock();
    });
  }

  showHud(on) {
    this.hudEl.style.display = on ? 'block' : 'none';
  }

  startNewGame() {
    this.audio.ensure();
    clearSave();
    this.profile = freshProfile();
    this.missions.profile = this.profile;
    this.missions.setStage(0);
    this.missions.gtTaken = false;
    this.missions.caseTaken = false;
    this.missions.cancelTaxiSilent?.();
    for (const d of this.missions.discs) {
      d.taken = false;
      d.mesh.visible = true;
    }
    this.beginPlay();
  }

  continueGame() {
    this.audio.ensure();
    const saved = loadSave();
    if (saved) {
      this.profile = saved;
      this.missions.profile = saved;
    }
    this.missions.stage = this.profile.stage;
    this.missions.gtTaken = false;
    this.missions.caseTaken = false;
    for (let i = 0; i < this.missions.discs.length; i++) {
      const d = this.missions.discs[i];
      d.taken = this.profile.discs.includes(i);
      d.mesh.visible = !d.taken;
    }
    this.beginPlay();
  }

  beginPlay() {
    if (this.playerCar) this.exitCar(true);
    this.police.disposeAll();
    this.police.clear();
    this.health = 100;
    this.player.placeAt(SPAWN.x, SPAWN.z, SPAWN.angle);
    this.camYaw = SPAWN.angle;
    this.titleEl.style.display = 'none';
    this.pauseEl.style.display = 'none';
    this.endEl.style.display = 'none';
    this.showHud(true);
    this.mode = 'playing';
    this.persist();
    this.hud.setDiscs(this.profile.discs.length);
    this.input.lock();
  }

  pauseGame() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.input.unlock(); // free the cursor so the pause menu is clickable
    this.audio.setEngine(false, 0, false);
    const el = (id) => document.getElementById(id);
    el('stats-line').textContent =
      `Cash $${this.profile.cash} · Taxi fares ${this.profile.fares} · Sun discs ${this.profile.discs.length}/12 · ${STAGE_LABELS[this.missions.stage]}`;
    this.pauseEl.style.display = 'flex';
  }

  resumeGame() {
    if (this.mode !== 'paused') return;
    this.pauseEl.style.display = 'none';
    this.mode = 'playing';
    this.input.lock();
  }

  endRun(kind) {
    this.endKind = kind;
    this.mode = 'ended';
    this.input.unlock();
    this.audio.setEngine(false, 0, false);
    this.audio.setSiren(0);
    const el = (id) => document.getElementById(id);
    if (kind === 'busted') {
      const fine = Math.max(40, Math.round(this.profile.cash * 0.12));
      this.profile.cash = Math.max(0, this.profile.cash - fine);
      this.persist();
      el('end-title').textContent = 'BUSTED';
      el('end-text').textContent = `Sunfall PD walks you to the steps. The fine stings more than the cuffs: $${fine}.`;
      this.audio.busted();
    } else {
      el('end-title').textContent = 'DOWNED';
      el('end-text').textContent = 'You wake up outside Sunfall General. The city kept your dignity; the hospital keeps a fee.';
    }
    this.endEl.style.display = 'flex';
  }

  respawn() {
    this.endEl.style.display = 'none';
    if (this.playerCar) this.exitCar(true);
    this.police.disposeAll();
    this.police.clear();
    this.health = 100;
    if (this.endKind === 'downed') {
      this.profile.cash = Math.max(0, this.profile.cash - 80);
      this.persist();
      const h = this.city.landmarks.hospitalSteps;
      this.player.placeAt(h.x, h.z + 4, Math.PI);
      this.camYaw = Math.PI;
    } else {
      const s = this.city.landmarks.stationForecourt;
      this.player.placeAt(s.x, s.z, 0);
      this.camYaw = 0;
    }
    this.mode = 'playing';
    this.input.lock();
  }

  onBusted() {
    if (this.mode === 'playing') this.endRun('busted');
  }

  // --- consequences ---------------------------------------------------------------
  damagePlayer(amount) {
    if (this.mode !== 'playing') return;
    this.health -= amount;
    this.lastDamageT = this.t;
    this.hud.flashDamage();
    this.audio.hurt();
    if (this.health <= 0) this.endRun('downed');
  }

  onPedHit(ped, car) {
    if (car !== this.playerCar) return;
    this.profile.cash = Math.max(0, this.profile.cash - 60);
    this.persist();
    this.hud.toast('You ran someone down. $60 fine — and the PD noticed.');
    this.police.addCrime(1.1, 2);
    this.audio.crash(0.25);
  }

  guardShoot(guard, hitChance) {
    const from = guard.pos.clone();
    from.y += 1.32;
    const target = this.playerPos().clone();
    target.y += this.playerCar ? 0.8 : 1.15;
    const hit = Math.random() < hitChance;
    const end = hit
      ? target
      : target.add(new THREE.Vector3((Math.random() - 0.5) * 3.4, Math.random() * 1.4 - 0.4, (Math.random() - 0.5) * 3.4));
    this.fx.trace(from, end);
    this.audio.shoot();
    if (hit) {
      this.fx.impact(target);
      this.damagePlayer(this.playerCar ? 3 : 8);
    }
  }

  onShotFired(hit) {
    this.audio.ensure();
    this.peds.scatterFrom(this.player.pos.x, this.player.pos.z, 17);
    const gd = Math.hypot(this.guard.pos.x - this.player.pos.x, this.guard.pos.z - this.player.pos.z);
    if (gd < 24) this.guard.provoke();
    this.police.addCrime(0.25, 1);
    if (!hit) return;
    const tagged = tagOf(hit.object);
    if (!tagged) return;
    if (tagged === this.guard.mesh) {
      const died = this.guard.takeHit(16);
      this.police.addCrime(0.8, 2);
      if (died) {
        this.hud.toast('The harbour guard is down.');
        this.police.addCrime(1, 3);
      }
    } else if (tagged.userData.tag === 'ped') {
      const ped = tagged.userData.pedRef;
      if (ped) {
        this.peds.knockDown(ped);
        this.police.addCrime(1.2, 2);
        this.hud.toast('You shot a pedestrian. The city saw that.');
      }
    } else if (tagged.userData.tag === 'car') {
      this.police.addCrime(0.3, 1);
    }
  }

  // --- cars: getting in and out ------------------------------------------------------
  toggleCar() {
    if (this.playerCar) {
      this.exitCar(false);
      return;
    }
    let best = null, bestD = 3.6;
    for (const car of this.allCars()) {
      const d = Math.hypot(car.pos.x - this.player.pos.x, car.pos.z - this.player.pos.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    if (!best) return;
    if (best.occupant === 'traffic') this.traffic.release(best);
    if (best.occupant === 'police') {
      this.police.cruisers.splice(this.police.cruisers.indexOf(best), 1);
      this.police.addCrime(0.6, 1);
      this.hud.toast('You just stole a police cruiser.');
    }
    // Whatever it was, it is a plain car of the city now: keep it on the
    // master list so collisions, bullets and the minimap still see it.
    if (!this.parkedCars.includes(best)) this.parkedCars.push(best);
    best.occupant = 'player';
    best.onCrash = (strength) => {
      this.audio.crash(0.15 + strength * 0.5);
      this.shake = Math.max(this.shake, strength * 0.55);
      if (strength > 0.6) this.damagePlayer(4);
    };
    this.playerCar = best;
    this.player.mesh.visible = false;
    this.audio.ensure();
    this.missions.onEnterCar(best);
  }

  exitCar(silent) {
    const car = this.playerCar;
    if (!car) return;
    car.onCrash = null;
    if (car.occupant === 'player') car.occupant = null;
    this.playerCar = null;
    const rx = -Math.cos(car.angle), rz = -Math.sin(car.angle); // car's left side
    const x = car.pos.x + rx * 1.9, z = car.pos.z + rz * 1.9;
    this.player.placeAt(x, z, car.angle);
    this.player.mesh.visible = true;
    this.camYaw = car.angle;
    this.audio.setEngine(false, 0, false);
    if (!silent) this.audio.ensure();
  }

  // --- the frame ------------------------------------------------------------------------
  pressed(code) {
    return this.input.down(code) && !this.prevKeys.has(code);
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.t += dt;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.prevKeys = new Set(this.input.keys);
  }

  update(dt) {
    this.city.update(dt, this.t);
    this.fx.update(dt);
    this.pistol.update(dt);

    if (this.mode === 'shot') {
      this.traffic.update(dt, this);
      this.peds.update(dt, this.t);
      this.missions.update(dt, this.t);
      frameShot(this, this.shot, this.t);
      this.refreshHud();
      this.minimap.draw(this, this.t);
      return;
    }
    if (this.mode === 'title') {
      const a = this.t * 0.045;
      this.camera.position.set(Math.sin(a) * 165, 58, 60 + Math.cos(a) * 165);
      this.camera.lookAt(0, 4, 30);
      this.camera.fov += (55 - this.camera.fov) * dt;
      this.camera.updateProjectionMatrix();
      this.traffic.update(dt, this);
      this.peds.update(dt, this.t);
      return;
    }
    if (this.mode !== 'playing') return;

    // Key edges.
    if (this.pressed('KeyF')) this.toggleCar();
    if (this.pressed('KeyP')) {
      this.pauseGame();
      return;
    }
    if (this.pressed('KeyH') && this.playerCar) {
      this.audio.horn(0.4);
      this.peds.scatterFrom(this.playerCar.pos.x, this.playerCar.pos.z, 9);
    }

    // Move the player (foot or car), then the city around them.
    if (this.playerCar) {
      const car = this.playerCar;
      const wish = this.input.moveWish();
      this.input.consumeClick(); // clicks belong to the pistol; discard at the wheel
      car.update(dt, {
        throttle: wish.z,
        steer: wish.x * (car.speed < -0.5 ? -1 : 1),
        handbrake: this.input.down('Space'),
      }, this.colliders);
      this.audio.setEngine(true, Math.abs(car.speed) / car.maxSpeed, this.input.down('Space'));
    } else {
      const { dx, dy } = this.input.consumeMouse();
      if (this.input.locked) {
        this.camYaw -= dx * 0.0026;
        this.camPitch = clamp(this.camPitch + dy * 0.0021, -0.06, 0.95);
      }
      this.player.update(dt, this.input, this.camYaw, this.colliders);
      if (this.input.consumeClick()) {
        const hit = this.pistol.fire(this, this.player.pos);
        if (hit !== null || this.pistol.cooldown > 0.2) this.onShotFired(hit);
      }
    }
    this.updateCamera(dt);

    this.traffic.update(dt, this);
    this.police.update(dt);
    this.peds.update(dt, this.t);
    this.guard.update(dt, this);
    this.missions.update(dt, this.t);

    // Car-to-car contact.
    const cars = this.allCars();
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const rel = collideCarPair(cars[i], cars[j]);
        if (rel > 9 && (cars[i] === this.playerCar || cars[j] === this.playerCar)) {
          this.audio.crash(0.3);
          this.shake = Math.max(this.shake, 0.3);
        }
      }
    }
    this.peds.checkCarHits(cars, (ped, car) => this.onPedHit(ped, car));

    // Slow recovery once the shooting stops.
    if (this.t - this.lastDamageT > 6 && this.health > 0) {
      this.health = Math.min(100, this.health + dt * 2.5);
    }
    this.refreshHud();
    this.minimap.draw(this, this.t);
  }

  updateCamera(dt) {
    const cam = this.camera;
    if (this.playerCar) {
      const car = this.playerCar;
      const f = car.forward(new THREE.Vector3());
      const desired = car.pos.clone().addScaledVector(f, -9.6);
      desired.y = car.pos.y + 3.5;
      const k = 1 - Math.pow(0.0015, dt);
      cam.position.lerp(desired, k);
      const look = car.pos.clone().addScaledVector(f, 7.5);
      look.y = car.pos.y + 1.3;
      if (this.shake > 0.01) {
        look.x += (Math.random() - 0.5) * this.shake;
        look.y += (Math.random() - 0.5) * this.shake * 0.6;
        this.shake *= Math.pow(0.02, dt);
      }
      cam.lookAt(look);
      const targetFov = 62 + clamp(Math.abs(car.speed) / car.maxSpeed, 0, 1) * 9;
      if (Math.abs(cam.fov - targetFov) > 0.05) {
        cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 4);
        cam.updateProjectionMatrix();
      }
      this.camYaw = car.angle;
      return;
    }
    // On foot: a shoulder camera the mouse orbits.
    const p = this.player.pos;
    const back = new THREE.Vector3(Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    const dist = 6.4 - this.camPitch * 1.1;
    const desired = p.clone().addScaledVector(back, -dist);
    desired.y = p.y + 1.9 + this.camPitch * 3.6;
    const k = 1 - Math.pow(0.0005, dt);
    cam.position.lerp(desired, k);
    const look = p.clone().addScaledVector(back, 2.2);
    look.y = p.y + 1.55;
    cam.lookAt(look);
    if (Math.abs(cam.fov - 62) > 0.05) {
      cam.fov += (62 - cam.fov) * Math.min(1, dt * 4);
      cam.updateProjectionMatrix();
    }
  }

  refreshHud() {
    this.hud.setCash(this.profile.cash);
    this.hud.setDiscs(this.profile.discs.length);
    this.hud.setStars(this.police.stars());
    this.hud.setBust(this.police.bust > 0.01 ? this.police.bust : null);
    this.hud.setHealth(this.health / 100);
    this.hud.setSpeed(this.playerCar ? this.playerCar.speedKmh() : null);
    this.hud.showCrosshair(this.mode === 'playing' && !this.playerCar && this.input.locked);
  }
}
