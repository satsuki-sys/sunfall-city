// A small seeded random generator (mulberry32) and the numeric helpers the
// rest of the game shares. City generation and the staged screenshot scenes
// draw from fixed seeds, so every visit — and every screenshot — sees the
// same Sunfall City.

export function makeRng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Float in [min, max). */
    range: (min, max) => min + next() * (max - min),
    /** Integer in [min, max], both ends included. */
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    /** True with probability p. */
    chance: (p) => next() < p,
    /** One element of the array, chosen uniformly. */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

/** Clamp v into the closed interval [min, max]. */
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Linear interpolation between a and b by t. */
export const lerp = (a, b, t) => a + (b - a) * t;

/** Shortest signed angle from a to b, in radians, in (-PI, PI]. */
export function angleDelta(a, b) {
  const full = Math.PI * 2;
  let d = (b - a) % full;
  if (d > Math.PI) d -= full;
  if (d < -Math.PI) d += full;
  return d;
}

/** Straight-line distance between two points on the ground plane. */
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
