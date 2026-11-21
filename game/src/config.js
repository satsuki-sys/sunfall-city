// Sunfall City — the single home for every tuning constant in the game.
// All distances are metres, all durations seconds. Downtown is a square
// lattice of avenues: CITY.blocks blocks along each side, avenue
// centrelines CITY.pitch metres apart, and CITY.roadWide metres of street
// between the building plots. Large z is the southern edge of the grid,
// where the streets give way to boardwalk, sand and open water.

export const CITY = {
  blocks: 11,          // blocks along one side of the grid
  pitch: 44,           // centreline-to-centreline spacing of the avenues
  roadWide: 14,        // width of a street, plot edge to plot edge
  get half() { return (this.blocks * this.pitch) / 2; }, // 242: the grid spans -242..242
  beachZ: 252,         // z where the boardwalk and the sand begin
  waterZ: 292,         // z where the sea takes over
};

/** Centreline coordinates of every avenue, the same on both axes. */
export function avenueLines() {
  const lines = [];
  for (let i = 0; i <= CITY.blocks; i += 1) lines.push(-CITY.half + i * CITY.pitch);
  return lines;
}

/** Centre coordinates of the block plots that sit between the avenues. */
export function blockCentres() {
  const centres = [];
  for (let i = 0; i < CITY.blocks; i += 1) centres.push(-CITY.half + (CITY.pitch / 2) + i * CITY.pitch);
  return centres;
}

export const PLAYER = {
  radius: 0.45,
  walkSpeed: 5.2,
  sprintSpeed: 8.6,
  health: 100,
  reachCar: 3.4,       // how far from a car door the F key still works
};

export const CAR_TYPES = {
  sedan:  { len: 4.3, wid: 1.9, maxSpeed: 31, accel: 13, health: 100 },
  sport:  { len: 4.4, wid: 1.95, maxSpeed: 41, accel: 19, health: 90 },
  taxi:   { len: 4.3, wid: 1.9, maxSpeed: 30, accel: 13, health: 100 },
  truck:  { len: 5.6, wid: 2.2, maxSpeed: 24, accel: 9, health: 160 },
  police: { len: 4.4, wid: 1.95, maxSpeed: 37, accel: 17, health: 140 },
};

/** Civilian paint: mostly sun-bleached pastels, a few loud ones stirred in. */
export const CAR_COLORS = [
  0xf2e3c6, 0xe8836b, 0x63b3a6, 0xf2c14e, 0x7fb2d9, 0xd96c85,
  0x9bc53d, 0xf7f3ea, 0x5b8e7d, 0xe4572e, 0x8d99ae, 0x2a9d8f,
];

export const WANTED = {
  max: 5,
  decaySeconds: 26,    // quiet seconds, no fresh crime, before a star fades
  policeByStars: [0, 1, 2, 3, 4, 5],
};

/** The sun discs: twelve golden collectibles hidden around the city. */
export const PACKAGES = {
  count: 12,
  reward: 25,          // cash for each disc picked up
  fullBonus: 250,      // extra cash for completing the set
  radius: 2.6,         // pickup distance from the player
};

export const SAVE_KEY = 'sunfall-city.save.v1';

/** The golden-hour palette: the whole game is lit like 6:40 pm seaside. */
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
