// The Game: owns the renderer, the city, every actor, and the rules that
// bind them together — crime and the wanted level, damage and death,
// busts, effects, the camera and the HUD. main.js drives the screens and
// shots.js stages scenes for the camera; everything else lives here.

import * as THREE from 'three';
import { PACKAGES, PALETTE, WANTED } from './config.js';
import { clamp, dist2d, makeRng } from './random.js';
import { buildCity, POIS } from './city.js';
import { createCar } from './vehicles.js';
import { TrafficDriver } from './traffic.js';
import { Pedestrian } from './pedestrians.js';
import { PoliceForce } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { Player, CameraRig } from './player.js';
import { Hud } from './hud.js';
import { Minimap } from './minimap.js';
import { SoundBank } from './audio.js';
import { Input } from './input.js';
import { loadSave, writeSave } from './save.js';

/** How many stars each crime is worth when somebody witnesses it. */
const CRIME_STARS = { shot: 1, theft: 1, hitCar: 1, grandTheft: 2, hitPed: 2, score: 2, hitPolice: 3 };

/** Seconds spent standing still beside an officer that end in an arrest. */
const BUST_SECONDS = 2.5;

export class Game {
  constructor(container, opts = {}) {
    this.shotMode = opts.shot ?? null;
    this.rng = makeRng((opts.seed ?? 7) * 7919 + 13);
    this.state = this.shotMode ? 'playing' : 'title';
    this.onEnd = opts.onEnd ?? (() => {});
    this.time = 0;
    this.snapCamera = true;

    // --- Renderer, scene, camera ---------------------------------------------
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(this.shotMode ? 1 : Math.min(devicePixelRatio, 1.75));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(PALETTE.fog, 130, 640);
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1600);
    this.camera.position.set(-140, 8, -130);

    // --- Light: a warm hemisphere wash under the low golden-hour sun ----------
    const hemi = new THREE.HemisphereLight(0xffd9a8, 0x7a5c48, 0.95);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffdf9e, 1.75);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -80;
    this.sun.shadow.camera.right = 80;
    this.sun.shadow.camera.top = 80;
    this.sun.shadow.camera.bottom = -80;
    this.sun.shadow.camera.far = 420;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);

    // --- The city, and the instruments the player reads -----------------------
    const city = buildCity(this.scene, makeRng(4242));
    this.city = city;
    this.colliders = city.colliders;

    this.input = new Input(this.renderer.domElement);
    this.audio = new SoundBank();
    this.hud = new Hud();
    this.minimap = new Minimap(document.getElementById('minimap'));
    this.cameraRig = new CameraRig(this.camera);

    // --- Actors and the state of the run ---------------------------------------
    this.player = new Player(this.scene, this.rng);
    this.cars = [];
    this.peds = [];
    this.guards = [];
    this.effects = [];
    this.cash = 60;
    this.health = 100;
    this.wanted = 0;
    this.crimeTimer = 0;
    this.impactCooldown = 0;
    this.bustMeter = 0;
    this.lastDamageAt = -99;
    this.lastCar = null;
    this.stats = { taxiFares: 0 };
    this.autosave = 0;

    this.#populate(city);
    this.police = new PoliceForce(this.scene, this);
    this.combat = new Combat(this);
    this.missions = new Missions(this);

    const save = loadSave();
    this.hasSave = !!save;
    if (save && opts.continueSave) this.applySave(save);
    if (this.shotMode) this.hud.show();

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  /** Stock the city: parked cars (one of them the Vireo GT), traffic, crowds. */
  #populate(city) {
    const rng = this.rng;
    const lotSpots = city.parkedSpots.filter((s) => s.lot);
    const kerbSpots = city.parkedSpots.filter((s) => !s.lot);

    // The marked car for Borrowed Sunshine: a coral sport, on the lot.
    this.markedCar = createCar(this.scene, 'sport', 0xff5040, POIS.carLot.x + 12, POIS.carLot.z + 16, Math.PI);
    this.markedCar.driver = 'parked';
    this.cars.push(this.markedCar);

    const lotColors = [0xf2e3c6, 0x63b3a6, 0xf2c14e, 0x7fb2d9, 0xd96c85];
    for (const spot of lotSpots) {
      if (Math.abs(spot.x - this.markedCar.x) < 3 && Math.abs(spot.z - this.markedCar.z) < 3) continue;
      if (!rng.chance(0.75)) continue;
      const car = createCar(this.scene, rng.pick(['sedan', 'sedan', 'sport', 'truck']), rng.pick(lotColors), spot.x, spot.z, spot.heading);
      car.driver = 'parked';
      this.cars.push(car);
    }
    const kerbColors = [0xf2e3c6, 0xe8836b, 0x63b3a6, 0xf2c14e, 0x7fb2d9, 0x9bc53d];
    for (const spot of kerbSpots) {
      if (!rng.chance(0.5)) continue;
      const car = createCar(this.scene, rng.pick(['sedan', 'sedan', 'taxi', 'sport', 'truck']), rng.pick(kerbColors), spot.x, spot.z, spot.heading);
      car.driver = 'parked';
      this.cars.push(car);
    }

    // Moving traffic, spawned well clear of where the player starts.
    const trafficColors = [0xf2e3c6, 0xe8836b, 0x63b3a6, 0x7fb2d9, 0xf7f3ea];
    for (let i = 0; i < 13; i += 1) {
      let x = 0;
      let z = 0;
      do {
        x = rng.range(-220, 220);
        z = rng.range(-220, 220);
      } while (dist2d(x, z, this.player.x, this.player.z) < 55);
      const car = createCar(this.scene, rng.pick(['sedan', 'sedan', 'taxi', 'truck']), rng.pick(trafficColors), x, z, 0);
      car.traffic = new TrafficDriver(car, rng);
      this.cars.push(car);
    }

    // The crowd.
    for (let i = 0; i < 36; i += 1) this.peds.push(new Pedestrian(this.scene, rng));
  }

  get playerPos() { return this.player.pos; }
  get playerVehicle() { return this.player.car; }

  shake(t) { this.cameraRig.shake(t); }

  /** A traffic honk is audible only when it happens near the player. */
  onHonk(car) {
    if (dist2d(car.x, car.z, this.playerPos.x, this.playerPos.z) < 32) this.audio.horn();
  }

  applySave(save) {
    this.cash = save.cash;
    this.stats.taxiFares = save.taxiFares ?? 0;
    this.player.x = save.x ?? this.player.x;
    this.player.z = save.z ?? this.player.z;
    this.missions.restore(save.storyIndex ?? 0);
    this.missions.restoreDiscs(save.discs ?? []);
  }

  saveGame() {
    writeSave({
      cash: Math.floor(this.cash),
      storyIndex: this.missions.storyIndex,
      taxiFares: this.stats.taxiFares,
      discs: this.missions.discs.map((d, i) => (d.taken ? i : -1)).filter((i) => i >= 0),
      x: Math.round(this.player.x),
      z: Math.round(this.player.z),
    });
  }

  startGame() {
    this.state = 'playing';
    this.hud.show();
    this.audio.start();
    this.snapCamera = true;
  }

  addCash(n) {
    this.cash += n;
    if (n > 0) this.audio.cash();
  }

  /** A crime raises the wanted level only when someone could have seen it. */
  reportCrime(kind, pos, guaranteed = false) {
    if (this.state !== 'playing') return;
    const seenByPolice = this.police.nearestDistance(pos) < 48;
    const seenByCrowd = this.peds.some((p) => p.state !== 'down' && p.state !== 'riding' && dist2d(p.x, p.z, pos.x, pos.z) < 30);
    const witnessed = guaranteed || seenByPolice || seenByCrowd;
    // Witnessed or not, people nearby still run from the noise.
    for (const ped of this.peds) ped.scare(pos.x, pos.z, kind === 'shot' || kind === 'hitPed' ? 30 : 16);
    if (!witnessed) return;
    this.wanted = Math.min(WANTED.max, this.wanted + (CRIME_STARS[kind] ?? 1));
    this.crimeTimer = WANTED.decaySeconds;
  }

  damagePlayer(amount, source) {
    void source; // call sites pass it for honesty; nothing needs it yet
    if (this.state !== 'playing' || this.shotMode) return;
    this.health -= amount;
    this.lastDamageAt = this.time;
    this.hud.damageFlash();
    this.shake(0.18);
    if (this.health <= 0) {
      this.health = 0;
      this.state = 'downed';
      this.onEnd('downed');
    }
  }

  /** Respawn from the end screen: outside the hospital, or the station. */
  respawn(kind) {
    this.wanted = 0;
    this.bustMeter = 0;
    this.health = 100;
    if (this.player.car) this.player.exitCar(this);
    if (kind === 'downed') {
      this.cash = Math.max(0, this.cash - Math.floor(this.cash * 0.1));
      this.player.x = -22;
      this.player.z = -154;
    } else {
      this.cash = Math.max(0, this.cash - Math.floor(this.cash * 0.15));
      this.player.x = 22;
      this.player.z = 22;
    }
    this.player.heading = Math.PI * 0.75;
    this.snapCamera = true;
    this.state = 'playing';
    this.saveGame();
  }

  /** A tracer: a single bright line between two points, gone in a blink. */
  spawnTracer(a, b, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.effects.push({ obj: line, life: 0.07, max: 0.07, kind: 'tracer' });
  }

  /** A puff: a handful of soft spheres that drift, swell and fade. */
  spawnPuff(pos, color, count = 3, power = 1) {
    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(PuffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }));
      mesh.position.copy(pos);
      mesh.scale.setScalar(0.6 * power);
      this.scene.add(mesh);
      this.effects.push({
        obj: mesh, kind: 'puff', life: 0.55, max: 0.55,
        vx: (this.rng.next() - 0.5) * 1.6 * power, vy: this.rng.range(1, 2.2) * power, vz: (this.rng.next() - 0.5) * 1.6 * power,
        grow: 2.4 * power,
      });
    }
  }

  #updateEffects(dt) {
    for (const fx of [...this.effects]) {
      fx.life -= dt;
      if (fx.life <= 0) {
        this.scene.remove(fx.obj);
        fx.obj.geometry?.dispose?.();
        fx.obj.material?.dispose?.();
        this.effects.splice(this.effects.indexOf(fx), 1);
        continue;
      }
      const f = fx.life / fx.max;
      if (fx.kind === 'tracer') fx.obj.material.opacity = 0.9 * f;
      else {
        fx.obj.position.x += fx.vx * dt;
        fx.obj.position.y += fx.vy * dt;
        fx.obj.position.z += fx.vz * dt;
        fx.obj.scale.multiplyScalar(1 + fx.grow * dt);
        fx.obj.material.opacity = 0.55 * f;
      }
    }
    // Damaged cars smoke.
    for (const car of this.cars) {
      if (car.health > 0 && car.health < 38) {
        car.smokeT = (car.smokeT ?? 0) - dt;
        if (car.smokeT <= 0) {
          car.smokeT = 0.14;
          this.spawnPuff(new THREE.Vector3(car.x, car.mesh.position.y + 1.1, car.z), 0x4a4f57, 1, 0.8);
        }
      }
    }
  }

  #updateCrimesAndConsequences(dt) {
    // Wanted decay: the clock runs only while no fresh crime lands and no
    // officer is close enough to keep the heat on.
    if (this.wanted > 0) {
      if (this.police.nearestDistance(this.playerPos) < 26) this.crimeTimer = Math.max(this.crimeTimer, 2);
      this.crimeTimer -= dt;
      if (this.crimeTimer <= 0) {
        this.wanted -= 1;
        this.crimeTimer = WANTED.decaySeconds * 0.7;
        if (this.wanted === 0) this.hud.message('You lost the heat.', '#9fe8a9');
      }
    }

    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    const car = this.playerVehicle;
    if (car) {
      // A hard wall impact while driving is itself a crime — and it thuds.
      if (car.lastImpact > 10 && this.impactCooldown <= 0) {
        this.reportCrime('hitCar', this.playerPos);
        this.impactCooldown = 2;
        this.shake(0.3);
        this.audio.bump();
      }
      // Running someone down is the loudest crime of all.
      if (Math.abs(car.speed) > 4) {
        for (const ped of this.peds) {
          if (ped.state === 'down' || ped.state === 'riding' || ped.state === 'waiting') continue;
          if (dist2d(ped.x, ped.z, car.x, car.z) < 1.7) {
            ped.knockDown();
            this.reportCrime('hitPed', this.playerPos, true);
            car.health -= 4;
            this.shake(0.35);
            this.hud.message('You ran someone down!', '#ff7a6b');
          }
        }
      }
    }

    // The bust: an officer on foot beside a slow, wanted player fills the
    // meter — and the HUD shows it filling, so the danger stays readable.
    if (!car && this.wanted > 0 && this.player.speedNow < 1) {
      const near = this.police.nearestDistance(this.playerPos);
      if (near < 4.6) {
        this.bustMeter += dt;
        if (this.bustMeter > BUST_SECONDS) {
          this.state = 'busted';
          this.onEnd('busted');
        }
      } else this.bustMeter = Math.max(0, this.bustMeter - dt * 2);
    } else this.bustMeter = Math.max(0, this.bustMeter - dt * 2);

    // Health creeps back once the shooting has stopped.
    if (this.time - this.lastDamageAt > 6 && this.health > 0) {
      this.health = Math.min(100, this.health + 4.5 * dt);
    }
  }

  /** The F-key prompt: out of the current car, or into the nearest one. */
  #updateInteraction() {
    const input = this.input;
    if (this.player.car) {
      this.hud.setPrompt('F — get out · H — horn · Space — handbrake');
      if (input.justPressed('KeyF')) {
        this.lastCar = this.player.car;
        this.player.exitCar(this);
      }
      return;
    }
    let nearest = null;
    let best = Infinity;
    for (const car of this.cars) {
      if (car.driver === 'police' || car.driver === 'traffic') continue;
      const d = dist2d(this.player.x, this.player.z, car.x, car.z);
      if (d < best) { best = d; nearest = car; }
    }
    if (nearest && best < 3.4) {
      const name = nearest === this.markedCar ? 'the coral Vireo GT' : nearest === this.lastCar ? 'your car' : 'the car';
      this.hud.setPrompt(`F — take ${name}`);
      if (input.justPressed('KeyF')) {
        if (nearest !== this.lastCar && nearest.driver === 'parked') this.reportCrime('theft', this.playerPos);
        this.player.enterCar(nearest, this);
        this.lastCar = nearest;
      }
    } else this.hud.setPrompt(null);
  }

  update(dt) {
    this.time += dt;
    const playing = this.state === 'playing';
    if (playing) {
      this.player.update(dt, this);
      this.#updateInteraction();
      // Shooting: on foot, mouse held, never while a screenshot is staged.
      if (this.input.mouseDown && !this.player.car && !this.shotMode) {
        const origin = new THREE.Vector3(this.player.x, this.player.mesh.position.y + 1.45, this.player.z);
        this.combat.playerShoot(origin, this.cameraRig.forward);
      }
      this.combat.update(dt);
      for (const car of this.cars) if (car.traffic) car.traffic.update(dt, this);
      this.police.update(dt, this.time);
      for (const ped of this.peds) ped.update(dt, this);
      for (const guard of this.guards) guard.update(dt, this);
      this.missions.update(dt, this.time);
      this.#updateCrimesAndConsequences(dt);
      this.autosave += dt;
      if (this.autosave > 20) { this.autosave = 0; this.saveGame(); }
    }
    this.city.update(dt, this.time);
    this.#updateEffects(dt);

    // The sun, shadow box and all, follows the player around the city.
    const p = this.playerPos;
    this.sun.position.set(p.x - 120, 130, p.z + 70);
    this.sun.target.position.set(p.x, 0, p.z);
    this.cameraRig.update(dt, this);

    if (this.deferRender) return; // screenshot staging steps the sim without drawing
    if (playing || this.shotMode) {
      this.hud.setHealth(this.health / 100);
      this.hud.setCash(this.cash);
      this.hud.setPackages(this.missions.discsFound, PACKAGES.count);
      this.hud.setWanted(this.wanted);
      this.hud.setBust(this.bustMeter / BUST_SECONDS);
      this.hud.setSpeed(this.player.car ? this.player.car.speed * 3.6 : null);
      this.hud.setCrosshair(!this.player.car && playing && !this.shotMode);
      this.hud.update(dt);
      this.minimap.draw(this);
    }
    this.renderer.render(this.scene, this.camera);
  }
}

const PuffGeo = new THREE.SphereGeometry(0.2, 6, 5);
