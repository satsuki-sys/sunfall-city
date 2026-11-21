// city.js — the static city: sky, sea, ground, roads, and every building.
// City.builds a three.js group from the seeded generator, so the layout is
// identical on every load. Buildings come in three facade families (sand,
// terracotta, slate glass) painted onto canvas textures; shops get striped
// awnings and hand-lettered signs; the landmark plots (café, warehouse, car
// lot, garage, hospital, station, park) are built to their own recipes. The
// city also hands back the building collision boxes and animates the water.

import * as THREE from 'three';
import {
  AVENUES_Z, STREETS_X, PLOT_COLS_X, PLOT_ROWS_Z, PLOT_KINDS, PLOT_HALF,
  ROAD_HALF, SHOP_SIGNS, CITY,
} from './config.js';

// One shared radial-gradient texture for every glow sprite in the game
// (streetlight halos, headlights, the sun's aura, police light bars).
let sharedGlow = null;
export function makeGlowTexture() {
  if (sharedGlow) return sharedGlow;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  sharedGlow = new THREE.CanvasTexture(c);
  return sharedGlow;
}

function glowSprite(color, scale, opacity = 0.8) {
  const mat = new THREE.SpriteMaterial({
    map: makeGlowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(scale);
  return sprite;
}

// A facade painted on canvas: a flat wall colour, a grid of windows (some of
// them lit warm, as if the evening were coming on), a darker plinth. Three
// families give the districts their different tempers.
function facadeTexture(rng, family, floors, cols) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const bases = ['#d9a45f', '#b4563e', '#5d7d8c'];
  const darks = ['#8a5f2e', '#74382a', '#33505e'];
  g.fillStyle = bases[family];
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = darks[family];
  g.fillRect(0, 236, 256, 20); // plinth
  const lit = family === 2 ? '#ffd98a' : '#ffe9b0';
  const unlit = family === 2 ? '#22333c' : '#4a3b2c';
  const ww = 256 / cols, wh = 256 / floors;
  for (let y = 0; y < floors; y++) {
    for (let x = 0; x < cols; x++) {
      g.fillStyle = rng() < 0.34 ? lit : unlit;
      g.fillRect(x * ww + ww * 0.24, y * wh + wh * 0.22, ww * 0.52, wh * 0.5);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A shop sign: the name lettered on a deep teal board, the way the cafés and
// garages around the harbour paint them.
function signTexture(name) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#274b63';
  g.fillRect(0, 0, 512, 96);
  g.strokeStyle = '#e8c877';
  g.lineWidth = 4;
  g.strokeRect(6, 6, 500, 84);
  g.fillStyle = '#f5e7c3';
  g.font = '600 44px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, 256, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A striped awning texture, red and cream.
function awningTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#f2e3c2' : '#c0452f';
    g.fillRect(i * 16, 0, 16, 32);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Asphalt with a dashed centre line, drawn along the canvas x axis.
function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#4c4741';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#57524b';
  for (let i = 0; i < 300; i++) g.fillRect(Math.random() * 256, Math.random() * 64, 2, 2);
  g.fillStyle = '#d9b84a';
  g.fillRect(16, 30, 96, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// The sea: pale streaks on blue-green, scrolled slowly for a shimmer.
function waterTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3d7f8c';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,240,200,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i < 60; i++) {
    const y = Math.random() * 256, x = Math.random() * 200, len = 20 + Math.random() * 40;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 12);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A palm frond: one tapered leaf shape, drawn once and reused on planes.
function frondTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 32);
  g.fillStyle = '#4d7d3a';
  g.beginPath();
  g.moveTo(0, 16);
  g.quadraticCurveTo(64, -6, 128, 20);
  g.quadraticCurveTo(64, 26, 0, 16);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
function box(mat, w, h, d, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(boxGeo, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export class City {
  constructor(scene, rng) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];   // {minX, maxX, minZ, maxZ} for every building
    this.waterTex = null;
    this.buildSky(scene);
    this.buildGround(rng);
    this.buildPlots(rng);
    this.buildStreetlights();
    this.buildPalms(rng);
  }

  // Gradient dome and a low, warm sun with a broad aura sprite.
  buildSky(scene) {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#5f96c4');
    grad.addColorStop(0.45, '#a8c4d8');
    grad.addColorStop(0.72, '#f7cf92');
    grad.addColorStop(1, '#f2a65e');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(640, 24, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
    );
    scene.add(dome);
    const sun = glowSprite(0xffdf9e, 190, 0.95);
    sun.position.set(-260, 210, 470);
    scene.add(sun);
    const core = glowSprite(0xfff3cf, 60, 1);
    core.position.copy(sun.position);
    scene.add(core);
  }

  buildGround(rng) {
    const g = this.group;
    const dry = new THREE.MeshStandardMaterial({ color: 0xa79b72, roughness: 1 });
    const beyond = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1100), dry);
    beyond.rotation.x = -Math.PI / 2;
    beyond.position.set(0, -0.05, 60);
    beyond.receiveShadow = true;
    g.add(beyond);

    const pavement = new THREE.MeshStandardMaterial({ color: 0xbfb096, roughness: 1 });
    const city = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.maxX - CITY.minX, CITY.boardwalkZ - CITY.minZ), pavement);
    city.rotation.x = -Math.PI / 2;
    city.position.set(0, 0, (CITY.minZ + CITY.boardwalkZ) / 2);
    city.receiveShadow = true;
    g.add(city);

    // Roads: avenues run the full width; streets stop at the boardwalk.
    const texA = roadTexture(); texA.repeat.set(10, 1);
    const texB = roadTexture(); texB.repeat.set(9, 1); texB.rotation = Math.PI / 2; texB.center.set(0.5, 0.5);
    const roadMatA = new THREE.MeshStandardMaterial({ map: texA, roughness: 0.95 });
    const roadMatB = new THREE.MeshStandardMaterial({ map: texB, roughness: 0.95 });
    for (const z of AVENUES_Z) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(384, ROAD_HALF * 2), roadMatA);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.03, z);
      road.receiveShadow = true;
      g.add(road);
    }
    for (const x of STREETS_X) {
      const len = CITY.boardwalkZ - CITY.minZ;
      const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, len), roadMatB);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.03, CITY.minZ + len / 2);
      road.receiveShadow = true;
      g.add(road);
    }

    // Boardwalk (timber), beach (sand) and the sea itself.
    const timber = new THREE.MeshStandardMaterial({ color: 0x9a744e, roughness: 1 });
    const walk = new THREE.Mesh(
      new THREE.PlaneGeometry(560, CITY.beachZ - CITY.boardwalkZ), timber);
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(0, 0.06, (CITY.boardwalkZ + CITY.beachZ) / 2);
    walk.receiveShadow = true;
    g.add(walk);
    const sand = new THREE.MeshStandardMaterial({ color: 0xe6cd96, roughness: 1 });
    const beach = new THREE.Mesh(
      new THREE.PlaneGeometry(560, CITY.waterZ - CITY.beachZ), sand);
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(0, 0.04, (CITY.beachZ + CITY.waterZ) / 2);
    beach.receiveShadow = true;
    g.add(beach);
    this.waterTex = waterTexture();
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 320),
      new THREE.MeshStandardMaterial({ map: this.waterTex, roughness: 0.55, metalness: 0.1 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.02, CITY.waterZ + 160);
    g.add(sea);

    // The pier: a low timber deck on posts, running out to the case spot.
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x8a6844, roughness: 1 });
    const deckLen = CITY.pierEndZ - CITY.beachZ;
    box(deckMat, 10, 0.25, deckLen, CITY.pierX, 0.12, CITY.beachZ + deckLen / 2, g);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5f4630, roughness: 1 });
    for (let z = CITY.beachZ + 6; z < CITY.pierEndZ; z += 12) {
      box(postMat, 0.5, 1.4, 0.5, CITY.pierX - 4.4, -0.5, z, g, false);
      box(postMat, 0.5, 1.4, 0.5, CITY.pierX + 4.4, -0.5, z, g, false);
    }
    for (const side of [-4.8, 4.8]) { // low rails
      box(deckMat, 0.18, 0.5, deckLen, CITY.pierX + side, 0.5, CITY.beachZ + deckLen / 2, g, false);
    }
    // A painted gold island under the avenue-median disc.
    const island = new THREE.Mesh(
      new THREE.CylinderGeometry(2.3, 2.3, 0.07, 20),
      new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.8 }));
    island.position.set(0, 0.05, 24);
    island.receiveShadow = true;
    g.add(island);
  }

  // One building on a plot. kind decides the recipe; family the facade.
  buildPlot(rng, cx, cz, kind, signName) {
    const g = this.group;
    const family = Math.floor(rng() * 3);
    let w = PLOT_HALF * 2, d = PLOT_HALF * 2, h;
    if (kind === 'warehouse') { h = 12; }
    else if (kind === 'hospital') { h = 17; }
    else if (kind === 'station') { h = 11; }
    else if (kind === 'cafe') { h = 8; }
    else if (kind === 'garage') { h = 7; }
    else if (kind === 'shop') { h = 7 + rng() * 4; }
    else { h = 17 + rng() * 26; } // towers
    const floors = Math.max(2, Math.round(h / 3.1));
    const cols = 6;
    const tex = facadeTexture(rng, family, floors, cols);
    const wallMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x6b5844, roughness: 1 });
    const mats = [wallMat, wallMat, roofMat, roofMat, wallMat, wallMat];
    const b = new THREE.Mesh(boxGeo, mats);
    b.scale.set(w, h, d);
    b.position.set(cx, h / 2, cz);
    b.castShadow = true;
    b.receiveShadow = true;
    g.add(b);
    // Cornice: a thin slab overhanging the roofline.
    const corniceMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc2, roughness: 0.85 });
    box(corniceMat, w + 1.2, 0.55, d + 1.2, cx, h + 0.2, cz, g);
    this.colliders.push({
      minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2,
    });

    const signed = kind === 'cafe' || kind === 'warehouse' || kind === 'garage' ||
      kind === 'hospital' || kind === 'station' || kind === 'shop';
    if (signed && signName) {
      const signMat = new THREE.MeshBasicMaterial({ map: signTexture(signName) });
      for (const rotY of [0, -Math.PI / 2]) { // south face, then west face
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(15, 2.8), signMat);
        const off = PLOT_HALF + 0.06;
        if (rotY === 0) sign.position.set(cx, h - 1.9, cz + off);
        else { sign.position.set(cx - off, h - 1.9, cz); sign.rotation.y = rotY; }
        g.add(sign);
      }
      // Striped awning over the pavement on the south side.
      const awnMat = new THREE.MeshStandardMaterial({ map: awningTexture(), roughness: 0.9 });
      const awn = box(awnMat, 13, 0.18, 3.2, cx, 3.1, cz + PLOT_HALF + 1.2, g);
      awn.rotation.x = 0.32;
    }
    if (kind === 'garage') { // a wide dark doorway on the south face
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 1 });
      box(doorMat, 9, 4.4, 0.3, cx, 2.2, cz + PLOT_HALF + 0.05, g, false);
    }
    if (kind === 'hospital') { // a red cross over the door
      const red = new THREE.MeshBasicMaterial({ color: 0xd23c2e });
      const v = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.6), red);
      v.position.set(cx, 5.4, cz + PLOT_HALF + 0.07);
      g.add(v);
      const hz = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.8), red);
      hz.position.copy(v.position);
      g.add(hz);
    }
  }

  buildPlots(rng) {
    let extraSigns = 6; // index into SHOP_SIGNS for non-landmark shops
    for (const cx of PLOT_COLS_X) {
      for (const cz of PLOT_ROWS_Z) {
        const key = `${cx},${cz}`;
        const kind = PLOT_KINDS[key] || (rng() < 0.42 ? 'shop' : 'tower');
        if (kind === 'park') {
          const grass = new THREE.MeshStandardMaterial({ color: 0x77a24e, roughness: 1 });
          const lawn = new THREE.Mesh(new THREE.PlaneGeometry(PLOT_HALF * 2, PLOT_HALF * 2), grass);
          lawn.rotation.x = -Math.PI / 2;
          lawn.position.set(cx, 0.045, cz);
          lawn.receiveShadow = true;
          this.group.add(lawn);
          continue;
        }
        if (kind === 'carlot') { // Shoreline Motors: open asphalt, no building
          const lot = new THREE.MeshStandardMaterial({ color: 0x5a564f, roughness: 1 });
          const pad = new THREE.Mesh(new THREE.PlaneGeometry(PLOT_HALF * 2 + 4, PLOT_HALF * 2 + 4), lot);
          pad.rotation.x = -Math.PI / 2;
          pad.position.set(cx, 0.045, cz);
          pad.receiveShadow = true;
          this.group.add(pad);
          const signMat = new THREE.MeshBasicMaterial({ map: signTexture('Shoreline Motors') });
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(15, 2.8), signMat);
          sign.position.set(cx, 4.6, cz + PLOT_HALF + 2);
          this.group.add(sign);
          const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a });
          box(poleMat, 0.3, 4.4, 0.3, cx - 6, 2.2, cz + PLOT_HALF + 2, this.group, false);
          box(poleMat, 0.3, 4.4, 0.3, cx + 6, 2.2, cz + PLOT_HALF + 2, this.group, false);
          continue;
        }
        let signName = null;
        if (kind === 'cafe') signName = SHOP_SIGNS[0];
        else if (kind === 'warehouse') signName = SHOP_SIGNS[1];
        else if (kind === 'garage') signName = SHOP_SIGNS[3];
        else if (kind === 'hospital') signName = SHOP_SIGNS[4];
        else if (kind === 'station') signName = SHOP_SIGNS[5];
        else if (kind === 'shop') {
          signName = SHOP_SIGNS[extraSigns % SHOP_SIGNS.length];
          extraSigns++;
        }
        this.buildPlot(rng, cx, cz, kind, signName);
      }
    }
  }

  // Lamps on two corners of every intersection, each with a warm halo.
  buildStreetlights() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2f3336, roughness: 0.7, metalness: 0.4 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe6b0 });
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.6, 6);
    const bulbGeo = new THREE.SphereGeometry(0.32, 10, 8);
    for (const x of STREETS_X) {
      for (const z of AVENUES_Z) {
        for (const [ox, oz] of [[10.5, 10.5], [-10.5, -10.5]]) {
          const pole = new THREE.Mesh(poleGeo, poleMat);
          pole.position.set(x + ox, 2.8, z + oz);
          pole.castShadow = true;
          this.group.add(pole);
          const bulb = new THREE.Mesh(bulbGeo, bulbMat);
          bulb.position.set(x + ox, 5.7, z + oz);
          this.group.add(bulb);
          const halo = glowSprite(0xffd9a0, 4.6, 0.5);
          halo.position.copy(bulb.position);
          this.group.add(halo);
        }
      }
    }
  }

  // Palms along the southern avenue and the boardwalk, plus the park plot.
  buildPalms(rng) {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 });
    const frondMat = new THREE.MeshBasicMaterial({
      map: frondTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide,
    });
    const frondGeo = new THREE.PlaneGeometry(4.6, 1.15);
    frondGeo.translate(2.1, 0, 0);
    const spots = [];
    for (let x = -180; x <= 180; x += 24) {
      spots.push([x + rng() * 3, 131]);
      spots.push([x + 12 + rng() * 3, 111]);
    }
    for (let i = 0; i < 7; i++) spots.push([-156 + rng() * 24, 36 + rng() * 24]);
    for (const [x, z] of spots) {
      const palm = new THREE.Group();
      const h = 5.4 + rng() * 1.6;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, h, 6), trunkMat);
      trunk.position.y = h / 2;
      trunk.rotation.z = (rng() - 0.5) * 0.14;
      trunk.castShadow = true;
      palm.add(trunk);
      for (let i = 0; i < 6; i++) {
        const frond = new THREE.Mesh(frondGeo, frondMat);
        frond.position.y = h;
        frond.rotation.y = (i / 6) * Math.PI * 2 + rng() * 0.4;
        frond.rotation.z = -0.5 - rng() * 0.3;
        palm.add(frond);
      }
      palm.position.set(x, 0, z);
      this.group.add(palm);
    }
  }

  // The sea shimmers: two slow scrolls beating against each other.
  update(dt, elapsed) {
    if (this.waterTex) {
      this.waterTex.offset.x = (elapsed * 0.014) % 1;
      this.waterTex.offset.y = Math.sin(elapsed * 0.24) * 0.012;
    }
  }
}
