// vehicles.js — the car itself: a low-poly body built from boxes (body, cabin,
// wheels, light clusters) and an arcade driving model the traffic, police and
// player drivers all share. A Car knows how to accelerate, brake, reverse,
// slide on the handbrake and light its brake lights; who holds the wheel is
// somebody else's business. Police cars get a strobing light bar, taxis a
// roof sign, and every car wears glow sprites on its headlights so the
// evening streets sparkle the way the screenshots show.

import * as THREE from 'three';
import { makeGlowTexture } from './city.js';
import { TUNE } from './config.js';

const ACCEL = 12.5;
const BRAKE = 21;
const MAX_FORWARD = 30;
const MAX_REVERSE = 9;

const bodyGeo = new THREE.BoxGeometry(1.82, 0.58, 4.3);
const cabinGeo = new THREE.BoxGeometry(1.62, 0.52, 2.1);
const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.26, 12);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.9 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x223240, roughness: 0.25, metalness: 0.5 });

function glow(color, scale, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.scale.setScalar(scale);
  return s;
}

export class Car {
  constructor(scene, { color = 0xc94f42, police = false, taxi = false } = {}) {
    this.isPolice = police;
    this.isTaxi = taxi;
    this.group = new THREE.Group();
    this.body = new THREE.Group(); // rolls and pitches with the driving
    this.group.add(this.body);
    this.heading = 0;
    this.speed = 0;
    this.steer = 0;
    this.radius = TUNE.carRadius;
    this.health = 100;
    this.brakeOn = false;
    this.hornTimer = 0;

    const paint = new THREE.MeshStandardMaterial({
      color: police ? 0xf2f2ee : (taxi ? 0xf2b13c : color),
      roughness: 0.45, metalness: 0.25,
    });
    const main = new THREE.Mesh(bodyGeo, paint);
    main.position.y = 0.58;
    main.castShadow = true;
    this.body.add(main);
    const cabin = new THREE.Mesh(cabinGeo, police ? paint : glassMat);
    cabin.position.set(0, 1.08, -0.25);
    cabin.castShadow = true;
    this.body.add(cabin);
    if (police) { // black band along the flanks
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(1.86, 0.3, 4.34),
        new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.5 }));
      band.position.y = 0.52;
      this.body.add(band);
    }
    if (taxi) {
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.22, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffdf80, emissiveIntensity: 0.7 }));
      sign.position.set(0, 1.45, -0.25);
      this.body.add(sign);
    }

    // Wheels: fronts steer visually, all four spin with the speed.
    this.wheels = [];
    this.frontAxle = [];
    for (const [x, z, front] of [[-0.86, 1.38, 1], [0.86, 1.38, 1], [-0.86, -1.38, 0], [0.86, -1.38, 0]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.35, z);
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      pivot.add(wheel);
      this.body.add(pivot);
      this.wheels.push(wheel);
      if (front) this.frontAxle.push(pivot);
    }

    // Lights: headlight glow sprites, a tail strip that flares under braking.
    this.headGlows = [];
    for (const x of [-0.6, 0.6]) {
      const s = glow(0xfff0c0, 1.5, 0.5);
      s.position.set(x, 0.62, 2.2);
      this.body.add(s);
      this.headGlows.push(s);
    }
    this.tailMat = new THREE.MeshStandardMaterial({
      color: 0x881111, emissive: 0xff2211, emissiveIntensity: 0.9,
    });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.06), this.tailMat);
    tail.position.set(0, 0.72, -2.16);
    this.body.add(tail);
    this.brakeGlow = glow(0xff3322, 2.2, 0.0);
    this.brakeGlow.position.set(0, 0.72, -2.35);
    this.body.add(this.brakeGlow);

    // The police light bar: two emissive blocks and two halo sprites that
    // strobe against each other.
    this.barRed = null; this.barBlue = null;
    if (police) {
      const barBase = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.1, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x191919 }));
      barBase.position.set(0, 1.42, -0.25);
      this.body.add(barBase);
      const mk = (colorHex, x) => {
        const mat = new THREE.MeshStandardMaterial({
          color: colorHex, emissive: colorHex, emissiveIntensity: 2,
        });
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.34), mat);
        m.position.set(x, 1.53, -0.25);
        this.body.add(m);
        const s = glow(colorHex, 3.4, 0.8);
        s.position.set(x, 1.6, -0.25);
        this.body.add(s);
        return { mat, sprite: s };
      };
      this.barRed = mk(0xff2a22, -0.3);
      this.barBlue = mk(0x2266ff, 0.3);
    }

    scene.add(this.group);
  }

  get pos() { return this.group.position; }

  setPosition(x, z, heading) {
    this.group.position.set(x, 0, z);
    this.heading = heading;
    this.group.rotation.y = heading;
  }

  forwardX() { return Math.sin(this.heading); }
  forwardZ() { return Math.cos(this.heading); }

  setBrake(on) {
    this.brakeOn = on;
    this.tailMat.emissiveIntensity = on ? 3.2 : 0.9;
    this.brakeGlow.material.opacity = on ? 0.75 : 0;
  }

  // One physics step. input: {throttle: -1..1, steer: -1..1, handbrake}.
  // Steering bites harder at town speeds and eases off at full pace, the
  // handbrake kills the rear grip so the tail steps out, and the body leans
  // and squats for feel.
  update(dt, input) {
    const throttle = input.throttle || 0;
    const steerIn = input.steer || 0;
    if (throttle > 0) {
      const headroom = Math.max(0, 1 - this.speed / MAX_FORWARD);
      this.speed += ACCEL * throttle * dt * (0.35 + headroom);
    } else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= BRAKE * dt;
      else this.speed = Math.max(-MAX_REVERSE, this.speed + ACCEL * 0.7 * throttle * dt);
    }
    this.speed -= this.speed * 0.32 * dt; // drag and rolling resistance
    if (input.handbrake) this.speed -= this.speed * 1.4 * dt;
    if (Math.abs(this.speed) < 0.04 && throttle === 0) this.speed = 0;

    const steerTarget = steerIn * (input.handbrake ? 1.25 : 1);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 7);
    const grip = Math.min(1, Math.abs(this.speed) / 5);
    if (Math.abs(this.speed) > 0.05) {
      this.heading += this.steer * grip * dt * this.speed * 0.30;
    }
    this.group.position.x += this.forwardX() * this.speed * dt;
    this.group.position.z += this.forwardZ() * this.speed * dt;
    this.group.rotation.y = this.heading;

    const speed01 = Math.min(1, Math.abs(this.speed) / MAX_FORWARD);
    this.body.rotation.z = -this.steer * speed01 * 0.055;
    this.body.rotation.x = THREE.MathUtils.clamp(-throttle * 0.02 + (input.handbrake ? 0.015 : 0), -0.03, 0.03);
    for (const pivot of this.frontAxle) pivot.rotation.y = this.steer * 0.42;
    for (const wheel of this.wheels) wheel.rotation.x += (this.speed * dt) / 0.35;
    this.setBrake(throttle < 0 || !!input.handbrake || (throttle === 0 && Math.abs(this.speed) > 2));
  }

  // Police strobes and headlight shimmer, driven by the world clock.
  updateVisual(elapsed) {
    if (this.barRed) {
      const phase = Math.sin(elapsed * 11) > 0;
      this.barRed.sprite.material.opacity = phase ? 0.95 : 0.08;
      this.barBlue.sprite.material.opacity = phase ? 0.08 : 0.95;
      this.barRed.mat.emissiveIntensity = phase ? 3 : 0.4;
      this.barBlue.mat.emissiveIntensity = phase ? 0.4 : 3;
    }
  }

  destroy(scene) {
    scene.remove(this.group);
  }
}
