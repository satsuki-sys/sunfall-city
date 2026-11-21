// Cars: low-poly, box-built vehicles — sedans, sports cars, taxis, trucks
// and police interceptors — plus the arcade physics every driver shares.
// Player, traffic and police all steer through stepCar, which is what
// keeps a chase fair. At dusk every car wears halo sprites on its lamps,
// and the tail lights flare whenever the driver brakes.

import * as THREE from 'three';
import { CAR_TYPES } from './config.js';
import { clamp } from './random.js';
import { groundHeightAt, glowTexture } from './city.js';

let sharedGlowTex = null;
/** The radial glow texture, built once and shared by all lamp sprites. */
function glowTex() {
  if (!sharedGlowTex) sharedGlowTex = glowTexture();
  return sharedGlowTex;
}

/** An additive halo sprite for a lamp, sized in metres. */
function lampGlow(color, size, opacity) {
  const mat = new THREE.SpriteMaterial({
    map: glowTex(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(size);
  return sprite;
}

/** One shadow-casting box in a standard material; the only mesh maker here. */
function box(w, h, d, color, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.rough ?? 0.55,
    metalness: opts.metal ?? 0.25,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.ei ?? 1,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.castShadow = true;
  return mesh;
}

/** Build a car mesh facing +z. Police cars get a flashable light bar. */
export function makeCarMesh(type, color) {
  const spec = CAR_TYPES[type];
  const g = new THREE.Group();
  const paint = type === 'police' ? 0xf4f6f8 : type === 'taxi' ? 0xf2c14e : color;

  const body = box(spec.wid, type === 'truck' ? 0.8 : 0.55, spec.len, paint);
  body.position.y = type === 'truck' ? 0.85 : 0.62;
  g.add(body);

  if (type === 'truck') {
    const cab = box(spec.wid * 0.92, 0.7, 1.1, 0x39434f);
    cab.position.set(0, 1.55, spec.len * 0.28);
    g.add(cab);
  } else {
    const cabin = box(spec.wid * 0.84, 0.5, spec.len * 0.44, 0x2c3844, { rough: 0.25, metal: 0.4 });
    cabin.position.set(0, 1.12, -spec.len * 0.04);
    g.add(cabin);
  }
  if (type === 'sport') {
    const spoiler = box(spec.wid * 0.9, 0.08, 0.4, 0x22262c);
    spoiler.position.set(0, 1.05, -spec.len * 0.46);
    g.add(spoiler);
  }
  if (type === 'taxi') {
    const sign = box(0.7, 0.22, 0.3, 0xffe9a0, { emissive: 0xffc94d, ei: 0.7 });
    sign.position.set(0, 1.48, -spec.len * 0.04);
    g.add(sign);
  }
  if (type === 'police') {
    const band = box(spec.wid + 0.02, 0.3, spec.len * 0.5, 0x22262c);
    band.position.y = 0.62;
    g.add(band);
    const bar = new THREE.Group();
    const red = box(0.5, 0.16, 0.34, 0xff3b30, { emissive: 0xff3b30, ei: 2 });
    red.position.x = -0.28;
    const blue = box(0.5, 0.16, 0.34, 0x2e7dff, { emissive: 0x2e7dff, ei: 0.2 });
    blue.position.x = 0.28;
    bar.add(red, blue);
    bar.position.set(0, 1.45, -spec.len * 0.04);
    g.add(bar);
    g.userData.flash = [red.material, blue.material];
    // Halos over the bar, pulsed by the police driver in time with the strobe.
    const redGlow = lampGlow(0xff5040, 1.7, 0.5);
    redGlow.position.set(-0.28, 1.5, -spec.len * 0.04);
    const blueGlow = lampGlow(0x4d8dff, 1.7, 0.06);
    blueGlow.position.set(0.28, 1.5, -spec.len * 0.04);
    g.add(redGlow, blueGlow);
    g.userData.flashGlow = [redGlow.material, blueGlow.material];
  }

  // Headlights and tail lights, each carrying a soft halo for the dusk.
  const headlights = box(spec.wid * 0.7, 0.12, 0.05, 0xfff6c9, { emissive: 0xffeeb0, ei: 1.4 });
  headlights.position.set(0, 0.68, spec.len / 2 + 0.01);
  g.add(headlights);
  const headGlow = lampGlow(0xffe9a8, 1.15, 0.4);
  headGlow.position.set(0, 0.68, spec.len / 2 + 0.3);
  g.add(headGlow);
  const tailLights = box(spec.wid * 0.7, 0.1, 0.05, 0xd23b2e, { emissive: 0xd23b2e, ei: 0.8 });
  tailLights.position.set(0, 0.7, -spec.len / 2 - 0.01);
  g.add(tailLights);
  const tailGlow = lampGlow(0xff4030, 0.85, 0.3);
  tailGlow.position.set(0, 0.7, -spec.len / 2 - 0.26);
  g.add(tailGlow);
  // stepCar flares these two while the driver is on the brake.
  g.userData.tailGlow = tailGlow.material;
  g.userData.tailMat = tailLights.material;

  // One shared wheel geometry and material; the front pair also steers.
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.9 });
  const wheels = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(sx * (spec.wid / 2 - 0.05), 0.34, sz * spec.len * 0.32);
    wheel.castShadow = true;
    g.add(wheel);
    wheels.push(wheel);
  }
  g.userData.wheels = wheels;
  return g;
}

export function createCar(scene, type, color, x, z, heading) {
  const mesh = makeCarMesh(type, color);
  mesh.position.set(x, groundHeightAt(x, z), z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  const spec = CAR_TYPES[type];
  return {
    mesh, type, spec,
    x, z, heading,
    speed: 0,
    health: spec.health,
    maxHealth: spec.health,
    driver: null,        // 'player' | 'traffic' | 'police' | 'parked'
    lastImpact: 0,       // speed a wall ate this step (the world reads it)
    honkCooldown: 0,
    dead: false,
  };
}

export const carForward = (car) => ({ x: Math.sin(car.heading), z: Math.cos(car.heading) });

/** Push a circle at (x, z) out of every building AABB; returns [x, z]. */
export function resolveCircle(x, z, r, colliders) {
  for (const c of colliders) {
    const nx = clamp(x, c.minX, c.maxX);
    const nz = clamp(z, c.minZ, c.maxZ);
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 > r * r) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * r;
      z = nz + (dz / d) * r;
    } else {
      // The centre sits inside the box: leave by the shallowest face.
      const left = x - c.minX;
      const right = c.maxX - x;
      const top = z - c.minZ;
      const bottom = c.maxZ - z;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = c.minX - r;
      else if (m === right) x = c.maxX + r;
      else if (m === top) z = c.minZ - r;
      else z = c.maxZ + r;
    }
  }
  return [x, z];
}

/**
 * Advance one car by a step. control: {throttle -1..1, steer -1..1, brake}.
 * Collisions are circles at the nose and tail against buildings, plus a
 * soft push against other cars. Sets car.lastImpact when a wall eats
 * speed, and flares the tail lights for as long as the brake is held.
 */
export function stepCar(car, control, dt, colliders, cars) {
  const spec = car.spec;
  car.lastImpact = 0;
  const before = Math.abs(car.speed);

  // Brake lights: bright while braking or reversing, dim at a cruise.
  const braking = control.brake || control.throttle < 0;
  if (car.mesh.userData.tailGlow) {
    car.mesh.userData.tailGlow.opacity = braking ? 0.75 : 0.3;
    car.mesh.userData.tailMat.emissiveIntensity = braking ? 2.1 : 0.8;
  }

  // Speed: engine, brake and drag.
  if (car.health <= 0) {
    car.speed *= Math.max(0, 1 - 2.5 * dt);
  } else if (control.brake && Math.abs(car.speed) > 0.5) {
    car.speed -= Math.sign(car.speed) * 26 * dt;
  } else if (control.throttle > 0) {
    car.speed += spec.accel * control.throttle * dt * (1 - (car.speed / spec.maxSpeed) * 0.8);
  } else if (control.throttle < 0) {
    if (car.speed > 0.5) car.speed += spec.accel * 1.4 * control.throttle * dt;
    else car.speed = Math.max(-11, car.speed + spec.accel * 0.7 * control.throttle * dt);
  }
  car.speed -= car.speed * 0.55 * dt;
  if (Math.abs(car.speed) < 0.04 && control.throttle === 0) car.speed = 0;
  car.speed = clamp(car.speed, -11, spec.maxSpeed);

  // Heading and position. control.steer > 0 turns left: the heading grows
  // toward the east of south.
  const steerAuthority = clamp(Math.abs(car.speed) / 7, 0, 1) * Math.sign(car.speed);
  car.heading += control.steer * 1.65 * steerAuthority * dt;
  const f = carForward(car);
  car.x += f.x * car.speed * dt;
  car.z += f.z * car.speed * dt;

  // Buildings: collision circles riding at the nose and the tail.
  const r = spec.wid * 0.58;
  for (const s of [0.32, -0.32]) {
    const cx = car.x + f.x * spec.len * s;
    const cz = car.z + f.z * spec.len * s;
    const [nx, nz] = resolveCircle(cx, cz, r, colliders);
    if (nx !== cx || nz !== cz) {
      car.x += nx - cx;
      car.z += nz - cz;
      if (before > 6) {
        car.lastImpact = before - Math.abs(car.speed * 0.35);
        car.health -= (before - 6) * 0.55;
      }
      car.speed *= 0.35;
    }
  }

  // Other cars: a soft push apart, with damage charged to the faster one.
  for (const other of cars) {
    if (other === car) continue;
    const dx = car.x - other.x;
    const dz = car.z - other.z;
    const d = Math.hypot(dx, dz);
    const min = (spec.len + other.spec.len) * 0.36;
    if (d > 0.01 && d < min) {
      const push = (min - d) / 2;
      car.x += (dx / d) * push;
      car.z += (dz / d) * push;
      if (Math.abs(car.speed) > Math.abs(other.speed)) {
        if (before > 7) { car.lastImpact = Math.max(car.lastImpact, before * 0.4); car.health -= 3; }
        car.speed *= 0.72;
      }
    }
  }

  // Pose the mesh on the ground, wheels spinning and steering.
  car.x = clamp(car.x, -258, 258);
  car.z = clamp(car.z, -258, 262);
  car.mesh.position.set(car.x, groundHeightAt(car.x, car.z), car.z);
  car.mesh.rotation.y = car.heading;
  const spin = (car.speed * dt) / 0.34;
  car.mesh.userData.wheels.forEach((wheel, i) => {
    wheel.rotation.x += spin;
    if (i < 2) wheel.rotation.y = control.steer * 0.42;
  });
  car.honkCooldown = Math.max(0, car.honkCooldown - dt);
}
