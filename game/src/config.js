// config.js — Sunfall City's fixed facts: the seeded generator every system
// shares, the street grid's dimensions, the palette of a city held at golden
// hour, and the names painted on its shopfronts. Nothing here touches the DOM
// or three.js; it is the one place the city's numbers live.

// A small deterministic generator (mulberry32). The world is built from a
// seed, so the same seed raises the same streets, the same towers and the
// same parked cars on every load.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Heading convention for the whole game: an angle in radians where the
// forward vector is (sin h, 0, cos h). h = 0 faces +z (the sea), h = -PI/2
// faces +x. Yaw differences are wrapped to [-PI, PI] before use.
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function turnToward(current, target, maxStep) {
  const d = wrapAngle(target - current);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

// --- The grid -------------------------------------------------------------
// Avenues run north-south at x = a * PITCH, streets run east-west at
// z = s * PITCH. Blocks sit in the squares between roads.
export const PITCH = 52;
export const ROAD_HALF = 8;              // a road is 16 wide, kerb to kerb
export const BLOCK_HALF = 18;            // a block is 36 across
export const AVENUES = [-104, -52, 0, 52, 104];
export const STREETS = [-104, -52, 0, 52, 104];
export const BLOCK_CENTERS = [-78, -26, 26, 78];
export const CITY_EDGE = 116;            // pavement ends; boardwalk begins
export const BOARDWALK_Z = 122;          // the boardwalk's centre line
export const BEACH_Z = 143;              // sand
export const WATER_Z = 158;              // the sea starts here
export const PIER_END_Z = 196;           // the pier head

// --- Palette ---------------------------------------------------------------
export const COLORS = {
  sky: 0x2e6da8,
  skyHorizon: 0xffd9a0,
  sun: 0xffb45e,
  fog: 0xf2c894,
  asphalt: 0x3c4148,
  sidewalk: 0xb8ab98,
  sand: 0xe8cf9f,
  sea: 0x2f7ea6,
  boardwalk: 0x9a6b44,
  grass: 0x77a24f,
  plaza: 0xcbb894,
};

export const CAR_COLORS = [
  0xd94f30, 0x2f6fb2, 0xe8b93c, 0x3f9e63, 0xd8d3c8, 0x7048a0,
  0xc23a72, 0x37a6a0, 0x8a8f96, 0x24303c, 0xe07b28, 0x7a4a2b,
];

export const SHOP_SIGNS = [
  'Café Brisa', 'Aurora Motors', "Berto's Body Shop", 'Dockside Cold Storage',
  'Sunfall PD', 'Sunfall General', 'Sunset Motors', 'Hotel Miramar',
  'Panadería Sol', 'Marina Chandlery', 'Tidepool Books', 'Gelato Loma',
];

// The twelve Sun Discs, one per landmark, in the order the HUD counts them.
// Positions are on open ground the player can walk to.
export const DISC_SPOTS = [
  { name: 'the pier head', x: 0, z: 190 },
  { name: 'the boardwalk', x: 16, z: 120 },
  { name: 'the east beach', x: 60, z: 140 },
  { name: 'the west beach', x: -70, z: 138 },
  { name: 'Aurora Motors', x: -78, z: 14 },
  { name: 'the Café Brisa corner', x: 12, z: 99 },
  { name: 'the hospital steps', x: 26, z: -56 },
  { name: 'the station forecourt', x: -26, z: -56 },
  { name: 'the warehouse yard', x: 96, z: -60 },
  { name: 'Palmetto Park', x: -26, z: 26 },
  { name: 'Founders Plaza', x: 26, z: -26 },
  { name: 'Sunset Motors', x: -78, z: -34 },
];

export const DISC_VALUE = 25;
export const DISC_SET_BONUS = 250;
export const SAVE_KEY = 'sunfall-city.save.v1';

// Places the story and the respawns revolve around.
export const PLACES = {
  cafe: { x: 20, z: 99, label: 'Café Brisa' },
  storage: { x: 78, z: -56, label: 'Dockside Cold Storage' },
  aurora: { x: -78, z: 26, label: 'Aurora Motors' },
  berto: { x: 78, z: 46, label: "Berto's Body Shop" },
  pierHead: { x: 0, z: 188, label: 'the pier head' },
  station: { x: -26, z: -56, label: 'Sunfall PD' },
  hospital: { x: 26, z: -56, label: 'Sunfall General' },
  spawn: { x: 8, z: 120, heading: Math.PI / 2, label: 'the boardwalk' },
};
