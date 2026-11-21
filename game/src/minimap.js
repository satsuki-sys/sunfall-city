// The minimap: a north-up canvas chart of Sunfall. The street grid, shore
// and park are painted once onto an offscreen chart; every frame the live
// ink goes on top — sun discs in amber, the objective in gold, the PD in
// blue, a fare in green, and you as a white arrow at the middle of it all.

import { AVENUES, STREETS, ROAD_HALF, WATER_Z, SAND_Z } from './config.js';

const EXTENT = 290; // the chart covers x/z in [-290, 290]

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = canvas.width;
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = this.size;
    this.paintBase();
  }

  scale() {
    return this.size / (EXTENT * 2);
  }
  px(x) {
    return (x + EXTENT) * this.scale();
  }
  pz(z) {
    return (z + EXTENT) * this.scale();
  }

  paintBase() {
    const g = this.base.getContext('2d');
    const s = this.scale();
    g.fillStyle = '#20242c';
    g.fillRect(0, 0, this.size, this.size);
    // Blocks.
    g.fillStyle = '#2e333d';
    g.fillRect(this.px(-238), this.pz(-238), 476 * s, (SAND_Z + 30) * s);
    // The park.
    g.fillStyle = '#3f6034';
    g.fillRect(this.px(-119), this.pz(-55), 46 * s, 46 * s);
    // Sand and sea.
    g.fillStyle = '#8a764f';
    g.fillRect(this.px(-290), this.pz(SAND_Z - 4), this.size, (WATER_Z - SAND_Z + 4) * s);
    g.fillStyle = '#1d5f7a';
    g.fillRect(this.px(-290), this.pz(WATER_Z), this.size, this.size - this.pz(WATER_Z));
    // Roads.
    g.fillStyle = '#4a4d55';
    for (const x of AVENUES) g.fillRect(this.px(x - ROAD_HALF), this.pz(-238), ROAD_HALF * 2 * s, 406 * s);
    for (const z of STREETS) g.fillRect(this.px(-238), this.pz(z - ROAD_HALF), 476 * s, ROAD_HALF * 2 * s);
    // The pier.
    g.fillStyle = '#7d6248';
    g.fillRect(this.px(-4.4), this.pz(192), 8.8 * s, 100 * s);
    // Boardwalk.
    g.fillStyle = '#6e5136';
    g.fillRect(this.px(-238), this.pz(142), 476 * s, 16 * s);
  }

  dot(x, z, color, r = 3) {
    const g = this.ctx;
    g.fillStyle = color;
    g.beginPath();
    g.arc(this.px(x), this.pz(z), r, 0, Math.PI * 2);
    g.fill();
  }

  draw(game, t) {
    const g = this.ctx;
    g.clearRect(0, 0, this.size, this.size);
    g.drawImage(this.base, 0, 0);
    // Sun discs still waiting.
    for (const d of game.missions.discs) {
      if (!d.taken) this.dot(d.x, d.z, '#ffb52e', 2.6);
    }
    // Police.
    for (const c of game.police.cruisers) this.dot(c.pos.x, c.pos.z, '#4d8dff', 3);
    // Taxi fare.
    const taxi = game.missions.taxi;
    if (taxi.state === 'pickup' && taxi.marker) this.dot(taxi.marker.x, taxi.marker.z, '#63e06a', 3.4);
    if (taxi.state === 'deliver' && taxi.dest) this.dot(taxi.dest.x, taxi.dest.z, '#63e06a', 3.4);
    // The objective marker: a pulsing gold diamond.
    const m = game.missions.markerPos;
    if (m) {
      const r = 4 + Math.sin(t * 4) * 1.1;
      g.save();
      g.translate(this.px(m.x), this.pz(m.z));
      g.rotate(Math.PI / 4);
      g.fillStyle = '#ffd34d';
      g.fillRect(-r / 1.4, -r / 1.4, r * 1.4, r * 1.4);
      g.restore();
    }
    // You: a white arrow turned to your heading. Canvas y is south (+z),
    // and a heading of a has forward (sin a, -cos a), so rotating the
    // up-drawn arrow by a points it the way you face.
    const p = game.playerPos();
    const a = game.playerHeading();
    g.save();
    g.translate(this.px(p.x), this.pz(p.z));
    g.rotate(a);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4.4, 5);
    g.lineTo(0, 2.6);
    g.lineTo(-4.4, 5);
    g.closePath();
    g.fill();
    g.restore();
  }
}
