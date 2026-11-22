// minimap.js — the little map in the corner: the street grid, the shore,
// the player as a white arrow, Sun Discs in amber, the objective in gold,
// fares in cyan, traffic as grey dots and Sunfall PD flashing blue and red.
// Drawn fresh each frame on a 2D canvas; north is up, the city is fixed,
// and the view is the whole city at a glance.

import { AVENUES, STREETS } from './config.js';

const SIZE = 176;
const WORLD_MIN = -125, WORLD_SPAN = 250;

export class Minimap {
  constructor(canvas) {
    this.ctx = canvas.getContext('2d');
    canvas.width = SIZE; canvas.height = SIZE;
  }

  px(x) { return ((x - WORLD_MIN) / WORLD_SPAN) * SIZE; }
  pz(z) { return ((z - WORLD_MIN) / WORLD_SPAN) * SIZE; }

  dot(x, z, color, r = 2.4) {
    const g = this.ctx;
    g.fillStyle = color;
    g.beginPath(); g.arc(this.px(x), this.pz(z), r, 0, Math.PI * 2); g.fill();
  }

  draw(world) {
    const g = this.ctx;
    g.fillStyle = '#1d2733';
    g.fillRect(0, 0, SIZE, SIZE);
    // The sea takes the bottom of the map.
    g.fillStyle = '#2f7ea6';
    g.fillRect(0, this.pz(158), SIZE, SIZE - this.pz(158));
    g.fillStyle = '#e8cf9f';
    g.fillRect(0, this.pz(128), SIZE, this.pz(158) - this.pz(128));
    // Streets.
    g.strokeStyle = '#5a6672';
    g.lineWidth = 2.4;
    for (const a of AVENUES) {
      g.beginPath(); g.moveTo(this.px(a), this.pz(-112)); g.lineTo(this.px(a), this.pz(112)); g.stroke();
    }
    for (const s of STREETS) {
      g.beginPath(); g.moveTo(this.px(-112), this.pz(s)); g.lineTo(this.px(112), this.pz(s)); g.stroke();
    }
    // The pier.
    g.strokeStyle = '#cbb894'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(this.px(0), this.pz(120)); g.lineTo(this.px(0), this.pz(196)); g.stroke();

    // Discs still waiting, then the objective, then the fare.
    for (const disc of world.missions.discs) {
      if (!disc.taken) this.dot(disc.spot.x, disc.spot.z, '#ffb52e', 2.2);
    }
    const obj = world.missions.currentObjective();
    if (obj.x !== null && obj.x !== undefined) {
      const pulse = 3 + Math.sin(performance.now() / 240) * 0.9;
      this.dot(obj.x, obj.z, world.missions.objectiveOverride ? '#4ee6e0' : '#ffc94e', pulse);
    }
    for (const car of world.traffic.cars) this.dot(car.pos.x, car.pos.z, '#9aa4ae', 1.6);
    const flash = Math.sin(performance.now() / 130) > 0;
    for (const car of world.police.cruisers) this.dot(car.pos.x, car.pos.z, flash ? '#ff4a3c' : '#3c78ff', 2.4);

    // The player: a white arrow turned to his heading (or his car's).
    const p = world.player;
    const x = this.px(p.pos.x), y = this.pz(p.pos.z);
    const h = p.heading;
    g.save();
    g.translate(x, y);
    // Forward on the map is (sin h, cos h) in world xz, which is (sin h,
    // cos h) in canvas xy too — rotate the up-pointing arrow to match.
    g.rotate(Math.atan2(Math.sin(h), -Math.cos(h)));
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -5.4); g.lineTo(3.6, 4.4); g.lineTo(0, 2.4); g.lineTo(-3.6, 4.4);
    g.closePath(); g.fill();
    g.restore();
  }
}
