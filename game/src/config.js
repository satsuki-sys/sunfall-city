// Sunfall City — all of the game's tuning numbers live in this one module.
// Units are metres and seconds throughout. The city is a square grid of
// avenues: CITY.blocks blocks per side, CITY.pitch metres apart, with streets
// CITY.roadWide wide between the building plots. The south edge (high z) runs
// down to the boardwalk, the beach and the sea.

export const CITY = {
  blocks: 11,          // blocks per side
  pitch: 44,           // distance between avenue centrelines
  roadWide: 14,        // street width
  get half() { return (this.blocks * this.pitch) / 2; }, // 242: the grid spans -242..242
  beachZ: 252,         // the boardwalk and sand start here
  waterZ: 292,         // the sea starts here
};

/** Avenue centrelines — the same coordinates on both axes: -242, -198, ..., 242. */
export function avenueLines() {
  const lines = [];
  for (let i = 0; i <= CITY.blocks; i += 1) lines.push(-CITY.half + i * CITY.pitch);
  return lines;
}

/** Centres of the block plots that sit between the avenues: -220, -176, ..., 220. */
export function blockCentres() {
  const centres = [];
  for (let i = 0; i < CITY.blocks; i += 1) centres.push(-CITY.half + CITY.pitch / 2 + i * CITY.pitch);
  return centres;
}

export const PLAYER = {
  radius: 0.45,
  walkSpeed: 5.2,
  sprintSpeed: 8.6,
  health: 100,
  reachCar: 3.4,       // how close to a car door the F key still works
};

export const CAR_TYPES = {
  sedan:  { len: 4.3, wid: 1.9, maxSpeed: 31, accel: 13, health: 100 },
  sport:  { len: 4.4, wid: 1.95, maxSpeed: 41, accel: 19, health: 90 },
  taxi:   { len: 4.3, wid: 1.9, maxSpeed: 30, accel: 13, health: 100 },
  truck:  { len: 5.6, wid: 2.2, maxSpeed: 24, accel: 9, health: 160 },
  police: { len: 4.4, wid: 1.95, maxSpeed: 37, accel: 17, health: 140 },
};

/** Paint jobs for civilian cars: sun-bleached pastels, plus a few loud ones. */
export const CAR_COLORS = [
  0xf2e3c6, 0xe8836b, 0x63b3a6, 0xf2c14e, 0x7fb2d9, 0xd96c85,
  0x9bc53d, 0xf7f3ea, 0x5b8e7d, 0xe4572e, 0x8d99ae, 0x2a9d8f,
];

export const WANTED = {
  max: 5,
  decaySeconds: 26,    // quiet time, with no fresh crime, before one star fades
  policeByStars: [0, 1, 2, 3, 4, 5],
};

/** Hidden sun discs: golden collectibles scattered over the city's corners. */
export const PACKAGES = {
  count: 12,
  reward: 25,          // cash for each disc picked up
  fullBonus: 250,      // extra cash for completing the set
  radius: 2.6,         // pickup distance from the player's position
};

export const SAVE_KEY = 'sunfall-city.save.v1';

/** The golden-hour palette: the whole game is lit like 6:40 pm on the coast. */
export const PALETTE = {
  sky: 0xffc98a,
  fog: 0xf6a96b,
  sun: 0xffdf9e,
  sand: 0xeed9a4,
  water: 0x2e8fa3,
  asphalt: 0x3c4148,
  sidewalk: 0xcfc4ae,
  grass: 0x8fae5d,
};
