// Sunfall City — fixed facts about the world, and the seeded generator every
// procedural choice in the game is drawn from. Same seed, same city: the RNG
// call order in city.js / traffic.js / peds.js is part of that promise, so
// nothing here may consume randomness at import time.

export const SAVE_KEY = 'sunfall-city.save.v1';
export const DEFAULT_SEED = 7;

// City geometry, in metres. Roads run on a 64 m lattice; the sea is south.
export const BLOCK = 64;
export const ROAD_HALF = 8;                       // half the width of a road
export const AVENUES = [-192, -128, -64, 0, 64, 128, 192]; // x of N–S roads
export const STREETS = [-192, -128, -64, 0, 64, 128];      // z of E–W roads
export const BOARDWALK_Z = 150;                   // promenade centreline
export const SAND_Z = 168;                        // beach begins
export const WATER_Z = 202;                       // waterline
export const PIER_X = 0;
export const PIER_Z0 = 192;                       // pier root
export const PIER_Z1 = 292;                       // pier head
export const LANE_OFF = 3.6;                      // lane offset from a road centre
export const CITY_MIN = -238;
export const CITY_MAX_X = 238;
export const CITY_MAX_Z = 300;

// Small numeric helpers shared by every system.
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function angleLerp(a, b, t) {
  return a + wrapAngle(b - a) * t;
}
// Heading convention: angle 0 faces -z (north); forward = (sin a, -cos a) in xz.
export function forwardOf(angle, out) {
  out.set(Math.sin(angle), 0, -Math.cos(angle));
  return out;
}

// mulberry32: a small, fast, seedable PRNG with a long enough period for a city.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
  chance(p) {
    return this.next() < p;
  }
}

// The golden-hour palette the whole city is dressed in.
export const PALETTE = {
  sky: 0x87b5e5,
  horizon: 0xffd9a0,
  sun: 0xffe3ae,
  fog: 0xf2c184,
  asphalt: 0x3d3f45,
  sidewalk: 0xb9ac9c,
  sand: 0xeccf9a,
  sea: 0x2b7d9d,
  grass: 0x77a657,
  facades: [0xf2d5b8, 0xefa08c, 0x9fc9c0, 0xf0e0ee, 0xf7e3a1],
  carPaints: [0xd94f3d, 0x3d7bd9, 0xf2b13d, 0x53b06a, 0xe8e4da, 0x8a5fc0, 0x37414f, 0xe2703a, 0x63c7c0],
};
