// world.js — the game itself. The Game class builds the renderer, the sun
// and the city, spawns the traffic, the crowd, the police and the missions,
// and runs the frame loop: player on foot or behind the wheel, the chase
// camera with its speed-driven FOV, collisions, crimes and their
// consequences, health, busts, respawns, pause and the save file. Every
// other module is a specialist; this one is the conductor, and it exposes
// itself as window.__game (from main.js) so the play-test rig can drive it.

import * as THREE from 'three';
import { City } from './city.js';
import { Car } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Peds } from './peds.js';
import { Player, resolveCircleCollisions, clampToWorld } from './player.js';
import { Gun } from './weapons.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { Minimap } from './minimap.js';
import { Input } from './input.js';
import { SoundEngine } from './audio.js';
import { loadSave, storeSave, freshSave, clearSave } from './save.js';
import {
  makeRng, PLACES, TUNE, DISC_VALUE, DISC_SET_BONUS, CAR_COLORS, VIREO_COLOR,
  STREETS_X, AVENUES_Z, ROAD_HALF,
} from './config.js';

const STAGE_NAMES = [
  'First Run — meet Marisol', 'First Run — the delivery', 'Borrowed Sunshine',
  'The Sunset Score', 'Story complete',
];

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Game {
  constructor(container, seed = 7) {
    this.seed = seed;
    this.state = 'title'; // title | playing | paused | downed | busted
    this.elapsed = 0;
    this.health = 100;
    this.lastHurtAt = -99;
    this.playerCar = null;
    this.lastCar = null;
    this.crimeCooldown = 0;
    this.camYaw = Math.PI;
    this.camPitch = 0.16;
    this.wasLocked = false;
    this.shotMode = false;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xf2c184, 130, 640);
    this.camera = new THREE.PerspectiveCamera(
      TUNE.cameraBaseFov, innerWidth / innerHeight, 0.1, 1600);
    this.camera.position.set(0, 40, 150);
    this.camera.lookAt(0, 0, 0);

    const sun = new THREE.DirectionalLight(0xffd9a8, 2.7);
    sun.position.set(-90, 170, 150);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -170;
    sun.shadow.camera.right = 170;
    sun.shadow.camera.top = 170;
    sun.shadow.camera.bottom = -170;
    sun.shadow.camera.far = 800;
    sun.shadow.bias = -0.0006;
    this.sun = sun;
    this.scene.add(sun, sun.target);
    this.scene.add(new THREE.HemisphereLight(0xbfd6e4, 0x8a6f4d, 0.95));

    this.audio = new SoundEngine();
    this.input = new Input(this.renderer.domElement);
    this.city = new City(this.scene, makeRng(seed * 3 + 1));

    const stored = loadSave();
    this.hasSave = !!stored;
    this.profile = stored || freshSave();

    this.player = new Player(this.scene);
    this.player.setPosition(PLACES.spawn.x, PLACES.spawn.z, PLACES.spawn.heading);

    this.spawnParkedCars();
    this.traffic = new Traffic(this);
    this.police = new Police(this);
    this.peds = new Peds(this);
    this.combat = new Combat(this);
    this.gun = new Gun(this.scene, this.audio);
    this.missions = new Missions(this);
    this.hud = new Hud();
    this.missions.refreshObjective();
    this.minimap = new Minimap(document.getElementById('minimap'), this);

    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing') this.input.requestLock();
    });
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // Parked cars along the kerbs, drawn from the seeded stream, plus the one
  // car in the city with a name: the coral Vireo GT on the Shoreline lot.
  spawnParkedCars() {
    const rng = makeRng(this.seed * 19 + 3);
    this.parkedCars = [];
    for (let i = 0; i < TUNE.parkedCount; i++) {
      const car = new Car(this.scene, {
        color: CAR_COLORS[(rng() * CAR_COLORS.length) | 0],
        taxi: rng() < 0.12,
      });
      if (rng() < 0.5) { // along an avenue
        const line = AVENUES_Z[(rng() * AVENUES_Z.length) | 0];
        const side = rng() < 0.5 ? 1 : -1;
        const x = -180 + rng() * 360;
        car.setPosition(x, line + side * (ROAD_HALF - 1.2), side > 0 ? Math.PI / 2 : -Math.PI / 2);
      } else { // along a street
        const line = STREETS_X[(rng() * STREETS_X.length) | 0];
        const side = rng() < 0.5 ? 1 : -1;
        const z = -180 + rng() * 300;
        car.setPosition(line + side * (ROAD_HALF - 1.2), z, side > 0 ? Math.PI : 0);
      }
      this.parkedCars.push(car);
    }
    // A couple of cars for sale on the Shoreline Motors lot.
    for (const [x, z, h] of [[136, 6, Math.PI / 2], [152, 6, Math.PI / 2]]) {
      const car = new Car(this.scene, { color: CAR_COLORS[(rng() * CAR_COLORS.length) | 0] });
      car.setPosition(x, z, h);
      this.parkedCars.push(car);
    }
    this.vireoCar = new Car(this.scene, { color: VIREO_COLOR });
    this.vireoCar.setPosition(PLACES.vireoSpot.x, PLACES.vireoSpot.z, PLACES.vireoSpot.heading);
  }

  allCars() {
    return [...this.parkedCars, this.vireoCar, ...this.traffic.cars, ...this.police.cruisers];
  }

  // Groups the pistol can hit, tagged for combat.js.
  combatTargets() {
    const targets = [];
    for (const ped of this.peds.people) {
      ped.group.userData.kind = 'ped';
      ped.group.userData.ref = ped;
      targets.push(ped.group);
    }
    const guard = this.combat.guard;
    guard.group.userData.kind = 'guard';
    guard.group.userData.ref = guard;
    targets.push(guard.group);
    for (const car of this.allCars()) {
      car.group.userData.kind = 'car';
      car.group.userData.ref = car;
      targets.push(car.group);
    }
    return targets;
  }

  // --- run state ---------------------------------------------------------

  saveProfile() {
    storeSave(this.profile);
    this.hasSave = true;
  }

  applyProfile(profile) {
    this.profile = profile;
    for (const d of this.missions.discs.discs) {
      d.taken = profile.discs.includes(d.index);
      d.group.visible = !d.taken;
    }
    const m = this.missions;
    m.stage = profile.stage;
    m.stolen = false;
    m.caseTaken = false;
    m.taxi = null;
    m.timer = profile.stage === 1 ? 170 : null;
    m.refreshObjective();
  }

  startGame(fresh) {
    this.audio.unlock();
    this.audio.click();
    if (fresh) {
      clearSave();
      this.applyProfile(freshSave());
    } else {
      this.applyProfile(loadSave() || freshSave());
    }
    this.health = 100;
    this.police.clear();
    if (this.playerCar) this.exitCar();
    this.player.setPosition(PLACES.spawn.x, PLACES.spawn.z, PLACES.spawn.heading);
    this.player.setVisible(true);
    this.camYaw = PLACES.spawn.heading;
    this.camPitch = 0.16;
    this.state = 'playing';
    this.hud.hideScreens();
    this.saveProfile();
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.releaseLock();
    this.audio.setScreech(0);
    this.hud.showPause(
      `Cash $${this.profile.cash} · Taxi fares ${this.profile.taxiFares} · ` +
      `Sun discs ${this.missions.discs.found}/12 · ${STAGE_NAMES[this.missions.stage]}`);
  }

  resumeGame() {
    if (this.state !== 'paused') return;
    this.audio.unlock();
    this.state = 'playing';
    this.hud.hidePause();
  }

  endRun(kind, cause) {
    if (this.state !== 'playing') return;
    this.state = kind;
    const stars = this.police.stars;
    let fee = 0;
    let where = '';
    if (kind === 'busted') {
      fee = 60 + stars * 30;
      where = 'You wake at Sunfall PD, lighter in the pocket.';
    } else {
      fee = 45;
      where = 'You wake at Sunfall General. The city kept your dignity; the hospital kept a fee.';
    }
    this.profile.cash = Math.max(0, this.profile.cash - fee);
    this.saveProfile();
    if (this.playerCar) {
      const car = this.playerCar;
      this.player.setPosition(car.pos.x + 2.4, car.pos.z, car.heading);
      this.playerCar = null;
    }
    this.player.setVisible(true);
    this.audio.stopEngine();
    this.audio.setScreech(0);
    this.audio.setSiren(0);
    this.input.releaseLock();
    this.pendingRespawn = kind === 'busted' ? PLACES.stationDoor : PLACES.hospitalDoor;
    this.hud.showEnd(kind, `${cause} ${where} Fine and fees: $${fee}.`);
  }

  respawn() {
    this.audio.unlock();
    this.health = 100;
    this.police.clear();
    const spot = this.pendingRespawn || PLACES.hospitalDoor;
    this.player.setPosition(spot.x, spot.z, Math.PI);
    this.player.setVisible(true);
    this.state = 'playing';
    this.hud.hideScreens();
  }

  onBusted() {
    this.endRun('busted', 'Sunfall PD walks you in.');
  }

  // --- consequences --------------------------------------------------------

  addCash(amount) {
    this.profile.cash = Math.max(0, this.profile.cash + amount);
    if (amount > 0) this.audio.cash();
    this.saveProfile();
  }

  toast(text) {
    this.hud.toast(text);
  }

  damagePlayer(amount, cause) {
    if (this.state !== 'playing') return;
    this.health -= amount;
    this.lastHurtAt = this.elapsed;
    if (this.health <= 0) {
      this.health = 0;
      this.endRun('downed', cause || 'You went down.');
    }
  }

  onDiscCollected(disc) {
    if (!this.profile.discs.includes(disc.index)) this.profile.discs.push(disc.index);
    this.audio.pickup();
    const found = this.missions.discs.found;
    this.addCash(DISC_VALUE);
    if (found >= 12) {
      this.addCash(DISC_SET_BONUS);
      this.toast(`Full set — all 12 sun discs! +$${DISC_VALUE} and a $${DISC_SET_BONUS} bonus.`);
    } else {
      this.toast(`Sun disc found — ${found}/12 · +$${DISC_VALUE}`);
    }
    this.saveProfile();
  }

  onPedHit(cause) {
    // Hurting a pedestrian always costs money and police attention.
    this.profile.cash = Math.max(0, this.profile.cash - 30);
    this.toast('You hurt someone — $30 fine, and the police noticed.');
    this.police.raise(cause === 'car' ? 2 : 1);
    this.saveProfile();
  }

  onGuardDown() {
    this.toast('The pier guard is down.');
  }

  onHeatCooled() {
    if (this.police.stars === 0 && this.state === 'playing') this.toast('The heat has cooled.');
  }

  // --- cars ----------------------------------------------------------------

  nearestCar(maxDist) {
    let best = null, bestD = maxDist;
    for (const car of this.allCars()) {
      if (car.isPolice) continue;
      const d = Math.hypot(car.pos.x - this.player.pos.x, car.pos.z - this.player.pos.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  enterCar(car) {
    this.playerCar = car;
    this.lastCar = car;
    this.player.setVisible(false);
    // If it was a traffic car, its driver gives up on it.
    const di = this.traffic.drivers.findIndex((d) => d.car === car);
    if (di >= 0) this.traffic.drivers.splice(di, 1);
    this.audio.startEngine();
    this.missions.onPlayerEnteredCar(car);
    // Stealing in sight of a cruiser is a crime; otherwise it is quiet.
    const wasParked = this.parkedCars.includes(car) || car === this.vireoCar || di >= 0;
    if (wasParked && this.police.nearest < 46 && this.crimeCooldown <= 0) {
      this.police.raise(1);
      this.crimeCooldown = 5;
      this.toast('Witnessed — the police are coming.');
    }
    this.camYaw = car.heading;
  }

  exitCar() {
    const car = this.playerCar;
    if (!car) return;
    const sideX = Math.cos(car.heading), sideZ = -Math.sin(car.heading);
    this.player.setPosition(car.pos.x + sideX * 2.3, car.pos.z + sideZ * 2.3, car.heading);
    resolveCircleCollisions(this.player.pos, TUNE.playerRadius, this.city.colliders);
    this.player.setVisible(true);
    this.playerCar = null;
    this.audio.stopEngine();
    this.audio.setScreech(0);
  }

  // --- the frame -----------------------------------------------------------

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;
    if (this.state === 'playing') this.updatePlaying(dt);
    else if (this.state === 'title') this.updateTitle(dt);
    // The city and its crowds idle on every screen.
    this.city.update(dt, this.elapsed);
    if (this.state !== 'paused') {
      this.traffic.updateVisualOnly?.(dt);
    }
    this.renderer.render(this.scene, this.camera);
    this.input.clearPressed();
  }

  updateTitle(dt) {
    this.traffic.update(dt);
    this.peds.update(dt);
    this.missions.discs.update(dt, this.elapsed);
    const t = this.elapsed * 0.05;
    this.camera.position.set(Math.sin(t) * 150, 52, 60 + Math.cos(t) * 150);
    this.camera.lookAt(0, 0, 10);
    if (this.camera.fov !== 55) {
      this.camera.fov = 55;
      this.camera.updateProjectionMatrix();
    }
  }

  updatePlaying(dt) {
    const input = this.input;
    this.crimeCooldown = Math.max(0, this.crimeCooldown - dt);

    // Pause: P, or Escape (which also drops the pointer lock).
    if (input.wasPressed('KeyP')) { this.pauseGame(); return; }
    if (this.wasLocked && !input.locked && !this.shotMode) { this.pauseGame(); return; }
    this.wasLocked = input.locked;

    // Mouse look.
    const md = input.takeMouseDelta();
    if (input.locked) {
      this.camYaw -= md.x * 0.0026;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + md.y * 0.0022, -0.35, 1.0);
    }

    const focus = this.playerCar || this.player;
    if (this.playerCar) this.updateDriving(dt);
    else this.updateOnFoot(dt);

    this.traffic.update(dt);
    this.peds.update(dt);
    this.police.update(dt, this.elapsed);
    this.combat.update(dt);
    this.gun.update(dt);
    this.missions.update(dt);
    this.collideCars(dt);
    this.hurtFromTraffic(dt);

    // Health creeps back once the danger has passed.
    if (this.elapsed - this.lastHurtAt > 5 && this.health > 0) {
      this.health = Math.min(100, this.health + dt * 3.5);
    }

    this.updateCamera(dt);
    this.updateAudio(dt);
    this.updateHud();
    this.minimap.draw();

    // The sun (and its shadow box) follows the action.
    this.sun.position.set(focus.pos.x - 90, 170, focus.pos.z + 150);
    this.sun.target.position.set(focus.pos.x, 0, focus.pos.z);
  }

  updateOnFoot(dt) {
    const input = this.input;
    const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
    let mx = 0, mz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) { mx += sin; mz += cos; }
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) { mx -= sin; mz -= cos; }
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) { mx += cos; mz -= sin; }
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) { mx -= cos; mz += sin; }
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }
    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    this.player.update(dt, mx, mz, sprint, this.city.colliders);

    // Face the camera when standing or shooting; the walk turns the figure.
    if (input.mouseDown && this.gun.ready) {
      const dir = this.viewDirection();
      this.player.faceTowards(
        this.player.pos.x + dir.x, this.player.pos.z + dir.z);
      const origin = new THREE.Vector3(
        this.player.pos.x, 1.45, this.player.pos.z).add(dir.clone().multiplyScalar(0.5));
      const hit = this.gun.fire(this, origin, dir, this.combatTargets());
      this.combat.onShotFired(this.player.pos.x, this.player.pos.z);
      if (hit) this.lastShotHit = hit.kind;
    }

    if (input.wasPressed('KeyF')) {
      const car = this.nearestCar(TUNE.enterCarRange);
      if (car) this.enterCar(car);
    }
  }

  updateDriving(dt) {
    const input = this.input;
    const car = this.playerCar;
    const throttle = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0) +
      (input.isDown('KeyS') || input.isDown('ArrowDown') ? -1 : 0);
    const steer = (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0) +
      (input.isDown('KeyD') || input.isDown('ArrowRight') ? -1 : 0);
    const handbrake = input.isDown('Space');
    const before = car.speed;
    car.update(dt, { throttle, steer, handbrake });
    if (resolveCircleCollisions(car.pos, TUNE.carRadius, this.city.colliders)) {
      if (Math.abs(before) > 7) {
        this.audio.bump(Math.min(1, Math.abs(before) / 16));
        if (Math.abs(before) > 13) this.damagePlayer((Math.abs(before) - 13) * 0.7, 'The crash got you.');
        car.speed *= 0.42;
      } else car.speed *= 0.7;
    }
    clampToWorld(car.pos, TUNE.carRadius);
    if (input.wasPressed('KeyH')) this.audio.horn();
    if (input.wasPressed('KeyF') && Math.abs(car.speed) < 1.2) this.exitCar();
    // The camera settles in behind the car.
    this.camYaw = angleLerp(this.camYaw, car.heading, Math.min(1, dt * 2.2));
  }

  // Cars bounce off each other; the player's car takes and deals the hurt.
  collideCars(dt) {
    const cars = this.allCars();
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        const min = a.radius + b.radius;
        if (d2 > min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = dx / d, nz = dz / d;
        a.pos.x -= nx * push; a.pos.z -= nz * push;
        b.pos.x += nx * push; b.pos.z += nz * push;
        const rel = Math.abs(a.speed - b.speed);
        const involvesPlayer = a === this.playerCar || b === this.playerCar;
        if (rel > 5) {
          if (involvesPlayer) {
            this.audio.bump(Math.min(1, rel / 15));
            const other = a === this.playerCar ? b : a;
            if (other.isPolice && this.crimeCooldown <= 0) {
              this.police.raise(1);
              this.crimeCooldown = 4;
            }
            if (rel > 12) this.damagePlayer((rel - 12) * 0.55, 'The crash got you.');
          }
          a.speed *= 0.72;
          b.speed *= 0.72;
        }
      }
    }
    // A car that runs a pedestrian down.
    for (const car of cars) {
      if (Math.abs(car.speed) < 3.5) continue;
      for (const ped of this.peds.people) {
        if (ped.down) continue;
        const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
        if (d < 1.6) {
          ped.knockDown();
          if (car === this.playerCar) this.onPedHit('car');
          car.speed *= 0.82;
        }
      }
    }
  }

  // Traffic and police cars can hurt the player on foot, too.
  hurtFromTraffic(dt) {
    if (this.playerCar) return;
    for (const car of [...this.traffic.cars, ...this.police.cruisers]) {
      if (Math.abs(car.speed) < 4) continue;
      const d = Math.hypot(this.player.pos.x - car.pos.x, this.player.pos.z - car.pos.z);
      if (d < 2.1) {
        const away = Math.atan2(
          this.player.pos.x - car.pos.x, this.player.pos.z - car.pos.z);
        this.player.pos.x += Math.sin(away) * 2.2;
        this.player.pos.z += Math.cos(away) * 2.2;
        this.damagePlayer(15, 'A car got you.');
        this.audio.bump(0.8);
      }
    }
  }

  viewDirection() {
    const cp = Math.cos(this.camPitch);
    return new THREE.Vector3(
      Math.sin(this.camYaw) * cp, Math.sin(this.camPitch), Math.cos(this.camYaw) * cp);
  }

  updateCamera(dt) {
    const focus = this.playerCar || this.player;
    const driving = !!this.playerCar;
    const speed = driving ? Math.abs(this.playerCar.speed) : this.player.speedNow;
    const topSpeed = driving ? 30 : TUNE.sprintSpeed;
    const ratio = THREE.MathUtils.clamp(speed / topSpeed, 0, 1);
    const targetFov = TUNE.cameraBaseFov + (TUNE.cameraFastFov - TUNE.cameraBaseFov) * (driving ? ratio : ratio * 0.4);
    if (Math.abs(this.camera.fov - targetFov) > 0.02) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 5);
      this.camera.updateProjectionMatrix();
    }
    const dir = this.viewDirection();
    const dist = driving ? TUNE.cameraDistance + 1.6 : TUNE.cameraDistance;
    const target = new THREE.Vector3(focus.pos.x, focus.pos.y + 1.7, focus.pos.z);
    // Look a little way into the velocity, so speed feels like speed.
    if (driving) {
      target.x += this.playerCar.forwardX() * this.playerCar.speed * 0.14;
      target.z += this.playerCar.forwardZ() * this.playerCar.speed * 0.14;
    }
    const camPos = target.clone().add(dir.clone().multiplyScalar(-dist));
    camPos.y = Math.max(0.7, camPos.y);
    this.camera.position.lerp(camPos, Math.min(1, dt * 10));
    const look = target.clone().add(dir.clone().multiplyScalar(6));
    this.camera.lookAt(look);
  }

  updateAudio(dt) {
    if (this.playerCar) {
      const car = this.playerCar;
      this.audio.setEngine(Math.abs(car.speed) / 30, Math.abs(car.speed) > 0.5 ? 0.8 : 0.25);
      const sliding = this.input.isDown('Space') && Math.abs(car.speed) > 6;
      this.audio.setScreech(sliding ? 1 : 0);
    } else {
      this.audio.setScreech(0);
    }
    const near = this.police.nearest;
    this.audio.setSiren(near === Infinity ? 0 : Math.max(0, 1 - near / 90));
    for (const car of this.police.cruisers) car.updateVisual(this.elapsed);
  }

  currentPrompt() {
    if (this.playerCar) return 'F — get out · H — horn · Space — handbrake';
    const car = this.nearestCar(TUNE.enterCarRange);
    if (car) return car === this.vireoCar ? 'F — steal the Vireo GT' : 'F — get in the car';
    if (this.missions.stage === 3 && !this.missions.caseTaken) {
      const d = Math.hypot(this.player.pos.x - PLACES.pierCase.x, this.player.pos.z - PLACES.pierCase.z);
      if (d < 9) return 'The case is here — walk to it and take it';
    }
    return '';
  }

  updateHud() {
    this.hud.update({
      health: this.health,
      cash: this.profile.cash,
      discs: this.missions.discs.found,
      stars: this.police.stars,
      bust: this.police.bust,
      speedKmh: this.playerCar ? Math.abs(this.playerCar.speed) * 3.6 : null,
      driving: !!this.playerCar,
      prompt: this.state === 'playing' ? this.currentPrompt() : '',
      playing: this.state === 'playing',
    });
  }
}
