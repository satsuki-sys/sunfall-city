// A seeded random source (mulberry32) together with the small numeric
// helpers shared across the game. City generation and the staged
// screenshot scenes both pull from fixed seeds, so every visit — and
// every screenshot — meets exactly the same Sunfall City.

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
    /** A float in [min, max). */
    range: (min, max) => min + next() * (max - min),
    /** An integer in [min, max], both ends included. */
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    /** True with probability p. */
    chance: (p) => next() < p,
    /** One element of the array, chosen uniformly. */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

/** Pin v inside the closed interval [min, max]. */
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Interpolate from a toward b by the fraction t. */
export const lerp = (a, b, t) => a + (b - a) * t;

/** The shortest signed turn from angle a to angle b, within (-PI, PI]. */
export function angleDelta(a, b) {
  const full = Math.PI * 2;
  let d = (b - a) % full;
  if (d > Math.PI) d -= full;
  if (d < -Math.PI) d += full;
  return d;
}

/** Ground-plane distance between (ax, az) and (bx, bz). */
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
