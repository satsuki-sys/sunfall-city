// The minimap: a north-up canvas plot of the avenue grid, the beach and the
// sea, carrying blips for the player, the player's car, the police, the sun
// discs still out there, and whatever the current objective points at. It is
// redrawn from live positions every frame, so it keeps no state of its own
// between frames. The legend rendered beside the map names each marker.

import { CITY, avenueLines } from './config.js';

const SIZE = 184;             // canvas edge in pixels
const SPAN = 620;             // world metres shown across the map
const SCALE = SIZE / SPAN;
const ORIGIN = -270;          // world x/z that lands on the map's top-left

const mapX = (x) => (x - ORIGIN) * SCALE;
const mapZ = (z) => (z - ORIGIN) * SCALE;

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

    // Ground: land as the base, a band of beach, then the sea down south.
    g.fillStyle = '#274b3a';
    g.fillRect(0, 0, SIZE, SIZE);
    g.fillStyle = '#e8d29a';
    g.fillRect(0, mapZ(CITY.beachZ), SIZE, mapZ(CITY.waterZ) - mapZ(CITY.beachZ));
    g.fillStyle = '#2e8fa3';
    g.fillRect(0, mapZ(CITY.waterZ), SIZE, SIZE - mapZ(CITY.waterZ));

    // Roads: one stroke for every avenue, drawn on both axes.
    g.strokeStyle = '#565e68';
    g.lineWidth = Math.max(2, CITY.roadWide * SCALE);
    for (const a of this.avenues) {
      g.beginPath(); g.moveTo(mapX(a), 0); g.lineTo(mapX(a), SIZE); g.stroke();
      g.beginPath(); g.moveTo(0, mapZ(a)); g.lineTo(SIZE, mapZ(a)); g.stroke();
    }

    // Uncollected sun discs: small steady amber dots — treasure, not alarm.
    const discs = world.missions?.discs;
    if (discs) {
      g.fillStyle = '#ffb02e';
      for (const disc of discs) {
        if (disc.taken) continue;
        g.beginPath();
        g.arc(mapX(disc.x), mapZ(disc.z), 2.1, 0, Math.PI * 2);
        g.fill();
      }
    }

    // Police blips, alternating blue and red like the light bars do.
    const flashBlue = Math.floor(performance.now() / 280) % 2 === 0;
    for (const car of world.cars) {
      if (car.driver !== 'police' || car.health <= 0) continue;
      g.fillStyle = flashBlue ? '#3f8cff' : '#ff5040';
      g.fillRect(mapX(car.x) - 2.5, mapZ(car.z) - 2.5, 5, 5);
    }

    // The player's car, marked for as long as they are away from it on foot.
    if (!world.playerVehicle && world.lastCar) {
      g.fillStyle = '#f7f3ea';
      g.fillRect(mapX(world.lastCar.x) - 2, mapZ(world.lastCar.z) - 2, 4, 4);
    }

    // Objective marker: a small diamond in the target's own colour.
    const target = world.missions?.target;
    if (target) {
      g.fillStyle = target.color ?? '#ffd23e';
      const tx = mapX(target.x);
      const tz = mapZ(target.z);
      g.beginPath();
      g.moveTo(tx, tz - 5);
      g.lineTo(tx + 4, tz);
      g.lineTo(tx, tz + 5);
      g.lineTo(tx - 4, tz);
      g.closePath();
      g.fill();
    }

    // Player arrow, turned to the heading of the player or of their car.
    const p = world.playerPos;
    const heading = world.playerVehicle ? world.playerVehicle.heading : world.player.heading;
    g.translate(mapX(p.x), mapZ(p.z));
    g.rotate(headingToMap(heading));
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

/** Convert a world heading (0 = +z/south, growing toward +x/east) for canvas. */
function headingToMap(heading) {
  // Canvas y runs downward (south) and x rightward (east), so a heading of 0
  // already points down the map and PI/2 points right: the up-arrow rotates
  // by the heading exactly as it stands.
  return heading;
}
