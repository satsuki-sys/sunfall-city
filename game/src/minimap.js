// minimap.js — the round map in the bottom-right corner, drawn on a 2D
// canvas every frame: the street grid and the sea, amber dots for the sun
// discs still waiting, a gold diamond for the objective, blue squares for
// police cruisers, an outline for the car the player last drove, and a
// white arrow for the player that turns with their heading. The legend
// above it is plain HTML in index.html.

import { STREETS_X, AVENUES_Z, CITY } from './config.js';

// The map covers x and z from -200 to +220 in a square canvas.
const SPAN = 420;
const ORIGIN = -200;

export class Minimap {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.scale = canvas.width / SPAN;
  }

  px(x) { return (x - ORIGIN) * this.scale; }
  py(z) { return (z - ORIGIN) * this.scale; }

  draw() {
    const { ctx, canvas } = this;
    const w = this.world;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, Math.PI * 2);
    ctx.clip();

    // Land, then the sea and the beach along the south edge.
    ctx.fillStyle = '#1e3d33';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#c9ae76';
    ctx.fillRect(0, this.py(CITY.beachZ), canvas.width, (CITY.waterZ - CITY.beachZ) * this.scale);
    ctx.fillStyle = '#2e6b7a';
    ctx.fillRect(0, this.py(CITY.waterZ), canvas.width, canvas.height);

    // The street grid.
    ctx.strokeStyle = '#4a5d5f';
    ctx.lineWidth = Math.max(2, 16 * this.scale);
    for (const z of AVENUES_Z) {
      ctx.beginPath();
      ctx.moveTo(0, this.py(z));
      ctx.lineTo(canvas.width, this.py(z));
      ctx.stroke();
    }
    for (const x of STREETS_X) {
      ctx.beginPath();
      ctx.moveTo(this.px(x), 0);
      ctx.lineTo(this.px(x), this.py(CITY.boardwalkZ));
      ctx.stroke();
    }
    // The pier.
    ctx.strokeStyle = '#8a6844';
    ctx.lineWidth = Math.max(2, 9 * this.scale);
    ctx.beginPath();
    ctx.moveTo(this.px(CITY.pierX), this.py(CITY.beachZ));
    ctx.lineTo(this.px(CITY.pierX), this.py(CITY.pierEndZ));
    ctx.stroke();

    // Sun discs still out there.
    ctx.fillStyle = '#ffb52e';
    for (const disc of w.missions.discs.discs) {
      if (disc.taken) continue;
      ctx.beginPath();
      ctx.arc(this.px(disc.x), this.py(disc.z), 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Police cruisers.
    ctx.fillStyle = '#5aa2ff';
    for (const car of w.police.cruisers) {
      ctx.fillRect(this.px(car.pos.x) - 2.5, this.py(car.pos.z) - 2.5, 5, 5);
    }

    // The car the player last drove, if they are not in it.
    if (!w.playerCar && w.lastCar) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(this.px(w.lastCar.pos.x) - 3, this.py(w.lastCar.pos.z) - 3, 6, 6);
    }

    // The objective: a gold diamond.
    const obj = w.missions.objective;
    if (obj && obj.target) {
      const x = this.px(obj.target.x), y = this.py(obj.target.z);
      ctx.fillStyle = '#ffd83c';
      ctx.beginPath();
      ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 4, y);
      ctx.closePath();
      ctx.fill();
    }

    // The player: a white arrow on their heading (the car's, when driving).
    const focus = w.playerCar || w.player;
    const fx = this.px(focus.pos.x), fy = this.py(focus.pos.z);
    const h = focus.heading;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(fx + Math.sin(h) * 6, fy + Math.cos(h) * 6);
    ctx.lineTo(fx + Math.sin(h + 2.5) * 4.6, fy + Math.cos(h + 2.5) * 4.6);
    ctx.lineTo(fx + Math.sin(h - 2.5) * 4.6, fy + Math.cos(h - 2.5) * 4.6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}
