// The minimap: a north-up canvas plot of the avenue grid, the beach and the
// sea, with blips for the player, their car, the police and whatever the
// current objective points at. Redrawn each frame from live positions.

import { CITY, avenueLines } from './config.js';

const SIZE = 184;
const SPAN = 620;             // world metres shown across the map
const SCALE = SIZE / SPAN;
const ORIGIN = -270;          // world x/z at the map's top-left

const px = (x) => (x - ORIGIN) * SCALE;
const pz = (z) => (z - ORIGIN) * SCALE;

export class Minimap {
  constructor(canvas) {
    this.ctx = canvas.getContext('2d');
    this.avenues = avenueLines();
  }

  draw(world) {
    const g = this.ctx;
    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.beginPath();
    g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
    g.clip();
    // Land, beach, sea.
    g.fillStyle = '#274b3a';
    g.fillRect(0, 0, SIZE, SIZE);
    g.fillStyle = '#e8d29a';
    g.fillRect(0, pz(CITY.beachZ), SIZE, pz(CITY.waterZ) - pz(CITY.beachZ));
    g.fillStyle = '#2e8fa3';
    g.fillRect(0, pz(CITY.waterZ), SIZE, SIZE - pz(CITY.waterZ));
    // Roads.
    g.strokeStyle = '#565e68';
    g.lineWidth = Math.max(2, CITY.roadWide * SCALE);
    for (const a of this.avenues) {
      g.beginPath(); g.moveTo(px(a), 0); g.lineTo(px(a), SIZE); g.stroke();
      g.beginPath(); g.moveTo(0, pz(a)); g.lineTo(SIZE, pz(a)); g.stroke();
    }
    // Police blips flash blue/red.
    const flash = Math.floor(performance.now() / 280) % 2 === 0;
    for (const car of world.cars) {
      if (car.driver !== 'police' || car.health <= 0) continue;
      g.fillStyle = flash ? '#3f8cff' : '#ff5040';
      g.fillRect(px(car.x) - 2.5, pz(car.z) - 2.5, 5, 5);
    }
    // The player's car, when they are away from it.
    if (!world.playerVehicle && world.lastCar) {
      g.fillStyle = '#f7f3ea';
      g.fillRect(px(world.lastCar.x) - 2, pz(world.lastCar.z) - 2, 4, 4);
    }
    // Objective blip.
    const target = world.missions?.target;
    if (target) {
      g.fillStyle = target.color ?? '#ffd23e';
      g.beginPath();
      const tx = px(target.x);
      const tz = pz(target.z);
      g.moveTo(tx, tz - 5);
      g.lineTo(tx + 4, tz);
      g.lineTo(tx, tz + 5);
      g.lineTo(tx - 4, tz);
      g.closePath();
      g.fill();
    }
    // Player arrow, pointing where the player (or their car) faces.
    const p = world.playerPos;
    const heading = world.playerVehicle ? world.playerVehicle.heading : world.player.heading;
    g.translate(px(p.x), pz(p.z));
    g.rotate(Math.atan2(Math.sin(heading), Math.cos(heading)) * 0 + headingToMap(heading));
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4, 5);
    g.lineTo(0, 2.4);
    g.lineTo(-4, 5);
    g.closePath();
    g.fill();
    g.restore();
  }
}

/** World heading (0 = +z/south, growing toward +x/east) to a canvas rotation. */
function headingToMap(heading) {
  // Canvas y grows downward (south), x rightward (east): a heading of 0 points
  // down, PI/2 points right — exactly a rotation of the up-arrow by heading.
  return heading;
}
