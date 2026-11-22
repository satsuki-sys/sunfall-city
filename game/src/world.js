// world.js — the conductor. It builds the renderer, the city and every
// system, owns the run's state (title, playing, paused, downed, busted),
// the wanted level and the bust meter, the entering and leaving of cars,
// and the order in which everything steps each frame.

import * as THREE from 'three';
import { PLACES, CAR_COLORS, clamp, mulberry32 } from './config.js';
import { buildCity } from './city.js';
import { loadSave, storeSave, clearSave, freshSave } from './save.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { Player } from './player.js';
import { Car } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Peds } from './peds.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { Hud, showScreen, fillStats } from './hud.js';
import { Minimap } from './minimap.js';

export class Game {
  constructor(container, seed = 7) {
    this.seed = seed;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xf2c894, 130, 520);
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1500);
    this.camera.position.set(0, 40, 170);

    const hemi = new THREE.HemisphereLight(0xbcd7f0, 0x8a6f4d, 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffbe78, 1.9);
    sun.position.set(-150, 120, 260);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -150; sun.shadow.camera.right = 150;
    sun.shadow.camera.top = 150; sun.shadow.camera.bottom = -150;
    sun.shadow.camera.far = 700;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);
    this.scene.add(sun.target);

    this.city = buildCity(this.scene, seed);
    this.input = new Input(this.renderer.domElement);
    this.audio = new AudioEngine();

    this.save = loadSave() || freshSave();
    this.hasSave = !!loadSave();
    this.player = new Player(this.scene, PLACES.spawn);
    this.parkedCars = this.makeParkedCars();
    this.traffic = new Traffic(this.scene, seed, this.city.colliders);
    this.police = new Police(this.scene, this.city.colliders);
    this.peds = new Peds(this.scene, seed, this.city.colliders);
    this.combat = new Combat(this.scene);
    this.missions = new Missions(this.scene, this.save);
    this.hud = new Hud();
    this.minimap = new Minimap(document.getElementById('minimap'));

    this.state = 'title';
    this.wantedF = 0;
    this.bust = 0;
    this.lastCrimeAgo = 99;
    this.playerSpeed = 0;
    this.prevPlayerPos = this.player.pos.clone();
    this.time = 0;

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  makeParkedCars() {
    const rng = mulberry32(this.seed * 17 + 5);
    const spots = [
      // Shore road kerbs, both sides.
      [-88, 109.5, Math.PI / 2], [-64, 109.5, Math.PI / 2], [36, 109.5, Math.PI / 2],
      [58, 109.5, Math.PI / 2], [88, 109.5, Math.PI / 2],
      [-40, 98.5, -Math.PI / 2], [12, 98.5, -Math.PI / 2], [70, 98.5, -Math.PI / 2],
      // Avenue kerbs.
      [48.5, -70, 0], [48.5, 30, 0], [-55.5, -20, Math.PI], [-55.5, 66, Math.PI],
      // The lots.
      [-88, 14, Math.PI / 2], [-88, 30, Math.PI / 2], [-68, 14, Math.PI / 2], [-68, 30, Math.PI / 2],
      [-88, -18, Math.PI / 2], [-68, -34, Math.PI / 2], [-88, -34, -Math.PI / 2],
      // Berto's yard and the warehouse yard.
      [64, 40, 0], [95, -62, Math.PI],
    ];
    const kinds = ['sedan', 'hatch', 'sedan', 'hatch', 'sedan'];
    const cars = [];
    spots.forEach(([x, z, h], i) => {
      const car = new Car(kinds[i % kinds.length], CAR_COLORS[(rng() * CAR_COLORS.length) | 0]);
      car.place(x, z, h);
      car.mesh.position.y = 0;
      this.scene.add(car.mesh);
      cars.push(car);
    });
    return cars;
  }

  allCars() {
    const cars = [...this.traffic.cars, ...this.police.cruisers, ...this.parkedCars];
    if (this.missions && this.missions.gt) cars.push(this.missions.gt);
    return cars;
  }

  get wanted() { return this.wantedF <= 0 ? 0 : Math.ceil(this.wantedF); }

  setWanted(n) { this.wantedF = n; }

  commitCrime(stars, _label) {
    if (this.state !== 'playing') return;
    this.wantedF = clamp(this.wantedF + stars, 0, 5);
    this.lastCrimeAgo = 0;
  }

  persist() { storeSave(this.save); }

  // --- run flow ---------------------------------------------------------------

  startNewGame() {
    clearSave();
    this.save = freshSave();
    this.resetRun();
    this.missions.dispose(this.scene);
    this.missions = new Missions(this.scene, this.save);
    this.beginPlay();
  }

  startContinue() {
    this.save = loadSave() || this.save;
    this.resetRun();
    this.missions.dispose(this.scene);
    this.missions = new Missions(this.scene, this.save);
    this.beginPlay();
  }

  resetRun() {
    this.wantedF = 0; this.bust = 0; this.lastCrimeAgo = 99;
    this.police.clear();
    this.player.hp = 100;
    this.player.dead = false;
    if (this.player.driving) this.leaveCar(true);
    this.player.pos.set(PLACES.spawn.x, 0, PLACES.spawn.z);
    this.player.yaw = PLACES.spawn.heading;
    this.player.heading = PLACES.spawn.heading;
    this.player.camPos.set(PLACES.spawn.x - 6, 3, PLACES.spawn.z);
  }

  // Pointer lock can refuse (a headless browser, a too-quick relock); a
  // refusal must never surface as a page error.
  lockPointer() {
    try {
      const r = this.renderer.domElement.requestPointerLock?.();
      if (r && r.catch) r.catch(() => {});
    } catch { /* the game plays on without the lock */ }
  }

  beginPlay() {
    this.state = 'playing';
    showScreen(null);
    this.audio.unlock();
    this.lockPointer();
    this.persist();
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    document.exitPointerLock?.();
    fillStats(this);
    showScreen('pause-screen');
    this.audio.setEngine(false);
    this.audio.setScreech(false);
  }

  resumeGame() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    showScreen(null);
    this.lockPointer();
  }

  onDowned() { this.endRun('downed'); }

  endRun(kind) {
    if (this.state !== 'playing') return;
    this.state = kind;
    this.player.dead = kind === 'downed';
    document.exitPointerLock?.();
    this.audio.setEngine(false); this.audio.setScreech(false); this.audio.setSiren(null);
    const fee = kind === 'busted' ? 50 + 25 * this.wanted : 75;
    this.endFee = Math.min(fee, this.save.cash);
    document.getElementById('end-title').textContent = kind === 'busted' ? 'BUSTED' : 'DOWNED';
    document.getElementById('end-text').textContent = kind === 'busted'
      ? `Sunfall PD walks you to the steps. The fine is $${this.endFee}.`
      : `You wake up outside Sunfall General. The bill is $${this.endFee}.`;
    showScreen('end-screen');
  }

  respawn() {
    const kind = this.state;
    this.save.cash -= this.endFee || 0;
    const at = kind === 'busted' ? PLACES.station : PLACES.hospital;
    if (this.player.driving) this.leaveCar(true);
    this.player.pos.set(at.x, 0, at.z + 6);
    this.player.hp = 100;
    this.player.dead = false;
    this.wantedF = 0; this.bust = 0;
    this.police.clear();
    this.state = 'playing';
    showScreen(null);
    this.persist();
    this.lockPointer();
  }

  // --- cars ---------------------------------------------------------------------

  tryEnterExit() {
    const p = this.player;
    if (p.driving) { this.leaveCar(false); return; }
    let best = null, bestD = 3.4;
    for (const car of this.allCars()) {
      const d = Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (!best) return;
    if (best.driver === 'traffic') this.commitCrime(1, 'a car taken in traffic');
    if (best.kind === 'cruiser') this.commitCrime(2, 'a cruiser stolen');
    best.wasDriver = best.driver;
    best.driver = 'player';
    p.driving = best;
    this.audio.door();
    if (best === this.missions.gt) this.missions.onGtTaken?.(this);
  }

  leaveCar(silent) {
    const p = this.player;
    const car = p.driving;
    if (!car) return;
    car.driver = car.wasDriver === 'traffic' ? 'traffic' : null;
    if (car.driver === 'traffic') { car.speed = 0; }
    p.driving = null;
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    p.pos.set(car.pos.x + side.x * 2.1, 0, car.pos.z + side.z * 2.1);
    p.yaw = car.heading; p.heading = car.heading;
    if (!silent) this.audio.door();
    this.audio.setEngine(false);
    this.audio.setScreech(false);
  }

  onPedRunOver(car) {
    if (car !== this.player.driving) return;
    this.save.cash = Math.max(0, this.save.cash - 40);
    this.commitCrime(2, 'a pedestrian run down');
    this.hud.toast('You ran someone down — $40 fine, and the PD noticed.');
    this.audio.bump();
    this.persist();
  }

  // --- the frame ------------------------------------------------------------------

  update(dt) {
    this.time += dt;
    if (this.state === 'title') {
      // A slow orbit over the city while the title is up.
      const t = this.time * 0.05;
      this.camera.position.set(Math.cos(t) * 120, 42, 60 + Math.sin(t) * 120);
      this.camera.lookAt(0, 0, 30);
      this.traffic.update(dt, this);
      this.peds.update(dt, this);
      this.city.update(dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.state !== 'playing') {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const input = this.input;
    const p = this.player;

    if (input.justPressed('KeyP')) { this.pauseGame(); input.endFrame(); return; }
    if (input.justPressed('KeyF')) this.tryEnterExit();
    if (input.mouseDown && !p.driving && this.input.locked) this.combat.playerShoot(this);
    if (input.justPressed('KeyH') && p.driving) this.audio.horn();

    // Drive the player's car, or walk the player.
    if (p.driving) {
      const car = p.driving;
      const controls = {
        throttle: (input.down('KeyW') ? 1 : 0) + (input.down('KeyS') ? -1 : 0),
        steer: (input.down('KeyA') ? 1 : 0) + (input.down('KeyD') ? -1 : 0),
        handbrake: input.down('Space'),
      };
      car.update(dt, controls, this.city.colliders, this.allCars());
      this.audio.setEngine(true, car.rpm01());
      this.audio.setScreech(controls.handbrake && Math.abs(car.speed) > 6);
    } else {
      this.audio.setEngine(false);
      this.audio.setScreech(false);
    }
    p.update(dt, this);

    // Player speed, for the bust meter.
    const moved = Math.hypot(p.pos.x - this.prevPlayerPos.x, p.pos.z - this.prevPlayerPos.z);
    this.playerSpeed = dt > 0 ? moved / dt : 0;
    this.prevPlayerPos.copy(p.pos);

    this.traffic.update(dt, this);
    this.peds.update(dt, this);
    this.combat.update(dt, this);

    // Wanted: the fleet follows the level; heat fades when nobody is close.
    this.lastCrimeAgo += dt;
    this.police.setWanted(this.wanted, p.pos);
    if (this.wantedF > 0) {
      const near = this.police.nearestDist(p.pos);
      if ((near === null || near > 30) && this.lastCrimeAgo > 8) {
        this.wantedF = Math.max(0, this.wantedF - dt / 7);
        if (this.wantedF === 0) this.hud.toast('You lost the heat.');
      }
      this.audio.setSiren(near);
    } else this.audio.setSiren(null);
    this.police.update(dt, this);

    // The bust meter: a cruiser close while you are slow is trouble.
    if (this.wanted > 0) {
      const near = this.police.nearestDist(p.pos);
      const slow = this.playerSpeed < 1.3 && (!p.driving || Math.abs(p.car.speed) < 1.3);
      if (near !== null && near < 7.5 && slow) this.bust = clamp(this.bust + dt / 2.2, 0, 1);
      else this.bust = clamp(this.bust - dt / 3, 0, 1);
      if (this.bust >= 1) { this.endRun('busted'); input.endFrame(); return; }
    } else this.bust = 0;

    this.missions.update(dt, this);
    this.city.update(dt);
    this.hud.update(dt, this);
    this.minimap.draw(this);
    this.renderer.render(this.scene, this.camera);
    input.endFrame();
  }
}
