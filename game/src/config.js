// config.js — every fixed fact about Sunfall City lives here: the street grid,
// the landmark plots, the twelve sun disc hiding places, the shop signs and
// the tuning numbers the rest of the game reads. Nothing in this file touches
// the DOM or three.js; it also carries the seeded random generator the whole
// city is built from, so one seed always raises the same city.

// A tiny deterministic generator (mulberry32). The world builder, the traffic
// spawner and the crowd all draw from streams made by this, in a fixed order,
// which is what makes a seed reproduce the same city layout every load.
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SAVE_KEY = 'sunfall-city.save.v1';
export const START_CASH = 60;

// The grid. Streets run north-south at these x positions, avenues run
// east-west at these z positions; building plots sit in the squares between.
export const PITCH = 48;          // distance between neighbouring road lines
export const ROAD_HALF = 8;       // roads are 16 wide
export const PLOT_HALF = 13;      // building plots are 26 across
export const STREETS_X = [-168, -120, -72, -24, 24, 72, 120, 168];
export const AVENUES_Z = [-168, -120, -72, -24, 24, 72, 120];
export const PLOT_COLS_X = [-144, -96, -48, 0, 48, 96, 144];
export const PLOT_ROWS_Z = [-144, -96, -48, 0, 48, 96];

export const CITY = {
  minX: -192, maxX: 192,        // hard edges of the built-up ground
  minZ: -192, boardwalkZ: 132,  // pavement runs to the boardwalk
  beachZ: 148, waterZ: 172,     // then sand, then the sea
  pierX: -120, pierEndZ: 218,   // the pier runs south from the beach
};

// Special plots, keyed "cx,cz". Anything not listed is a tower or a shop
// chosen by the seeded builder in city.js.
export const PLOT_KINDS = {
  '48,96': 'cafe',        // Café Solano, where Marisol holds court
  '-144,-144': 'warehouse',
  '144,0': 'carlot',      // Shoreline Motors
  '-48,48': 'garage',     // Tito's Garage
  '96,-96': 'hospital',   // Sunfall General
  '-48,-96': 'station',   // Sunfall PD
  '-144,48': 'park',
};

// The twelve signed shopfronts. The first six belong to the landmark plots
// above; the rest dress ordinary shop plots around town.
export const SHOP_SIGNS = [
  'Café Solano', 'Dockside Warehouse', 'Shoreline Motors', "Tito's Garage",
  'Sunfall General', 'Sunfall PD', 'Palma Records', 'Hotel Brisa',
  'Banco del Sol', 'Mercado Nueve', 'Ola Gym', 'Cine Faro',
];

// Named places the missions, the HUD and the respawn logic point at.
export const PLACES = {
  spawn: { x: 33, z: 126, heading: Math.PI },          // facing north, up the avenue
  marisol: { x: 40, z: 110 },                          // café corner, first meeting
  warehouseDoor: { x: -129, z: -129 },                 // delivery forecourt
  carlot: { x: 144, z: 0 },                            // Shoreline Motors lot
  vireoSpot: { x: 144, z: -6, heading: -Math.PI / 2 }, // the coral Vireo GT waits here
  garageDoor: { x: -33, z: 62 },                       // Tito's forecourt
  pierCase: { x: -120, z: 196 },                       // the case on the pier
  hospitalDoor: { x: 96, z: -79 },                     // respawn after being downed
  stationDoor: { x: -30, z: -90 },                     // respawn after a bust
};

// The twelve sun discs: golden coins hidden at landmarks, $25 each and a
// $250 bonus for the full set. Every spot is open ground, so each one can be
// walked to or driven through.
export const DISC_SPOTS = [
  { name: 'Pier end', x: -120, z: 210 },
  { name: 'Boardwalk', x: 72, z: 140 },
  { name: 'Beach', x: -48, z: 160 },
  { name: 'Car lot', x: 130, z: 13 },
  { name: 'Café corner', x: 33, z: 110 },
  { name: 'Hospital steps', x: 96, z: -81 },
  { name: 'Station forecourt', x: -33, z: -81 },
  { name: 'Warehouse yard', x: -160, z: -160 },
  { name: 'Avenue median', x: 0, z: 24 },
  { name: 'Downtown corner', x: 160, z: 80 },
  { name: 'Beach east', x: 168, z: 160 },
  { name: 'Palm park', x: -144, z: 48 },
];
export const DISC_VALUE = 25;
export const DISC_SET_BONUS = 250;

// Player and vehicle tuning, in metres and seconds.
export const TUNE = {
  walkSpeed: 5.4,
  sprintSpeed: 8.6,
  playerRadius: 0.55,
  carRadius: 1.55,
  enterCarRange: 3.4,
  discPickupRange: 1.7,
  objectiveRange: 3.4,
  cameraBaseFov: 62,
  cameraFastFov: 71,
  cameraDistance: 7.4,
  cameraHeight: 3.2,
  trafficCount: 13,
  parkedCount: 11,
  pedCount: 36,
  bustFillSeconds: 2.6,
  wantedDecaySeconds: 26,
};

// Paint jobs for the traffic fleet and the parked cars.
export const CAR_COLORS = [
  0xc94f42, 0x3f7fbf, 0xe0a83c, 0x4da167, 0xd8d3c3, 0x707880,
  0x8e5ea2, 0x2f9e97, 0xd4698b, 0x445566, 0xb8b0a0, 0x7a4a2b,
];
export const VIREO_COLOR = 0xff7a5c; // coral, the car Marisol wants stolen
