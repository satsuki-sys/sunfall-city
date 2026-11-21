// A small seeded random generator (mulberry32) plus helpers. The city and the
// screenshot scenes are built from a fixed seed, so every visit — and every
// staged screenshot — sees the same Sunfall City.

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
    /** Integer in [min, max]. */
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    /** True with probability p. */
    chance: (p) => next() < p,
    /** A random element of the array. */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

/** Clamp a value into [min, max]. */
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Linear interpolation. */
export const lerp = (a, b, t) => a + (b - a) * t;

/** Shortest signed angle from a to b, in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Distance between two {x, z} points on the ground plane. */
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
