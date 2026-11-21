// Sunfall City itself: a sun-soaked coastal grid raised procedurally —
// pastel towers with lit windows beneath a gradient sunset sky, palm-lined
// avenues, named landmarks carrying hand-lettered signs, and to the south
// a boardwalk, a beach and a shimmering sea. Everything here is geometry
// and canvas textures painted on the spot; nothing is loaded from disk.

import * as THREE from 'three';
import { CITY, PALETTE, avenueLines, blockCentres } from './config.js';

export const POIS = {
  cafe:      { x: -132, z: -132, name: 'Café Solano' },
  garage:    { x: 132,  z: -88,  name: "Tito's Garage" },
  warehouse: { x: 176,  z: 176,  name: 'Dockside Warehouse' },
  pier:      { x: -88,  z: 220,  name: 'Palms Pier' },
  hospital:  { x: 0,    z: -176, name: 'Sunfall General' },
  station:   { x: 0,    z: 0,    name: 'Sunfall PD' },
  carLot:    { x: 132,  z: 176,  name: 'Shoreline Motors' },
};

/** Which block (grid index "bi,bj") hosts which landmark, and how it looks. */
const POI_BY_BLOCK = new Map([
  ['2,2', { poi: 'cafe', h: 11, tint: 0xf2b879 }],
  ['8,3', { poi: 'garage', h: 9, tint: 0x9fb7c9 }],
  ['9,9', { poi: 'warehouse', h: 13, tint: 0xb08968 }],
  ['3,10', { poi: 'pier', h: 10, tint: 0x7fb2d9 }],
  ['5,1', { poi: 'hospital', h: 20, tint: 0xf7f3ea }],
  ['5,5', { poi: 'station', h: 14, tint: 0x8d99ae }],
  ['8,9', { poi: 'carLot', h: 6, tint: 0xe8836b }],
]);

const SHOP_SIGNS = [
  'Palms Hotel', 'Surf & Sand', 'Banco del Sol', 'Cine Mar', 'Marina Books',
  'Hotel Brisa', 'La Ola Tacos', 'Sunset Realty', 'Café Solano', 'Bar Ola',
  'Dulce Vida', 'Pier 9 Gifts',
];

const CENTRES = blockCentres();

/** Walkable ground height at a point: block slabs ride 0.3 above the street. */
export function groundHeightAt(x, z) {
  // Out at Palms Pier the deck stands over the water.
  if (Math.abs(x - POIS.pier.x) < 5 && z > CITY.waterZ - 4 && z < CITY.waterZ + 48) return 0.7;
  if (z > CITY.beachZ - 8) return 0;
  const nearest = (v) => CENTRES[Math.max(0, Math.min(CITY.blocks - 1, Math.round((v + CITY.half - CITY.pitch / 2) / CITY.pitch)))];
  const cx = nearest(x);
  const cz = nearest(z);
  if (Math.abs(x - cx) < 17 && Math.abs(z - cz) < 17) return 0.3;
  return 0;
}

/** A canvas wrapped up as a texture; the `draw` callback paints it. */
function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/**
 * One building facade plus its emissive twin. The facade pass paints the
 * plaster and a grid of windows, noting which ones are lit; the emissive
 * pass repaints exactly those windows warm, so the towers glow at dusk.
 * `variant` shifts the window grid and the plaster tone, so no two streets
 * read as though they were stamped from the same mould.
 */
function facadeTextures(variant) {
  const cols = 5 + variant;          // 5, 6 or 7 windows across
  const rows = 10 + variant * 2;     // 10, 12 or 14 floors of windows
  const plaster = ['#ddd5c2', '#e3d9c8', '#d8cdb4'][variant];
  const lit = [];
  const facade = canvasTexture(128, 256, (g) => {
    g.fillStyle = plaster;
    g.fillRect(0, 0, 128, 256);
    const cw = 128 / cols;
    const rh = 256 / rows;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const on = Math.random() < 0.24;
        lit.push(on);
        g.fillStyle = on ? '#5a4632' : '#39434f';
        g.fillRect(4 + c * cw, 5 + r * rh, cw - 8, rh - 9);
      }
    }
  });
  let i = 0;
  const emissive = canvasTexture(128, 256, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 128, 256);
    const cw = 128 / cols;
    const rh = 256 / rows;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (lit[i]) { g.fillStyle = '#ffb45e'; g.fillRect(4 + c * cw, 5 + r * rh, cw - 8, rh - 9); }
        i += 1;
      }
    }
  });
  return { facade, emissive };
}

/** A shopfront sign: centred serif lettering on a dark board. */
function signTexture(text, bg, fg) {
  const tex = canvasTexture(512, 112, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 112);
    g.fillStyle = fg;
    g.font = '700 52px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 58);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Palm fronds: nine arcing strokes fanned across a transparent canvas. */
function frondTexture() {
  const tex = canvasTexture(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = '#3e7d3a';
    g.lineWidth = 5;
    g.lineCap = 'round';
    for (let k = 0; k < 9; k += 1) {
      const a = (k / 9) * Math.PI - Math.PI / 2;
      const x = 64 + Math.cos(a) * 58;
      const y = 118 - Math.abs(Math.sin(a)) * 66 - 14;
      g.beginPath();
      g.moveTo(64, 122);
      g.quadraticCurveTo(64 + Math.cos(a) * 34, 96, x, y + 16);
      g.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** A soft radial glow — lamp halos, the sun's aura, a disc's shine. */
export function glowTexture() {
  const tex = canvasTexture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.32)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** The sunset sky, painted as a vertical gradient down a canvas strip. */
function skyTexture() {
  const tex = canvasTexture(4, 512, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#5f8fce');   // zenith: deepening blue
    grad.addColorStop(0.38, '#a8c4e0');  // pale upper sky
    grad.addColorStop(0.62, '#f7c98a');  // the warm band
    grad.addColorStop(0.78, '#ff9e5e');  // horizon glow
    grad.addColorStop(0.86, '#f6a96b');  // down at the skyline
    grad.addColorStop(1.0, '#e88a54');   // below the horizon, unseen
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 512);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Sea sparkle: a teal field flecked with pale streaks that catch the sun. */
function waterTexture() {
  const tex = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#2e8fa3';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i += 1) {
      const a = Math.random();
      g.fillStyle = a < 0.5 ? 'rgba(255,240,200,0.20)' : 'rgba(20,90,110,0.25)';
      g.fillRect(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 9, 1.4);
    }
  });
  tex.repeat.set(26, 26);
  return tex;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const facades = [facadeTextures(0), facadeTextures(1), facadeTextures(2)];
  const glowTex = glowTexture();
  const tints = [0xf7f3ea, 0xf2c9a0, 0xe8836b, 0x9fd4c5, 0xf2e3c6, 0xd96c85, 0xa8c6df, 0xf2d16b];
  // Each tint is paired with one of the three facade variants, so window
  // grids vary from tower to tower rather than repeating a single stamp.
  const materials = tints.map((tint, i) => {
    const f = facades[i % facades.length];
    return new THREE.MeshStandardMaterial({
      color: tint, roughness: 0.92, metalness: 0.02,
      map: f.facade, emissive: 0xffb45e, emissiveIntensity: 0.38, emissiveMap: f.emissive,
    });
  });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a6f55, roughness: 1 });
  const awningMats = [0xc94f30, 0x2a7f76, 0xe8a13a, 0x7a4a6e].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }),
  );
  // One unit box, pivoted at its base, scaled into every building.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);

  const addBuilding = (x, z, w, h, d, mat) => {
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, 0.3, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    // Taller towers earn a pale cornice to catch the last of the sun.
    if (h > 14) {
      const trim = new THREE.Mesh(boxGeo, roofMat);
      trim.scale.set(w * 1.04, 0.5, d * 1.04);
      trim.position.set(x, 0.3 + h, z);
      trim.castShadow = true;
      scene.add(trim);
    }
    // Tall buildings sometimes grow a rooftop box as well.
    if (h > 18 && rng.chance(0.7)) {
      const prop = new THREE.Mesh(boxGeo, roofMat);
      prop.scale.set(w * 0.3, rng.range(1, 2.4), d * 0.3);
      prop.position.set(x + rng.range(-w / 5, w / 5), 0.3 + h, z + rng.range(-d / 5, d / 5));
      prop.castShadow = true;
      scene.add(prop);
    }
    return mesh;
  };

  /** A striped canvas awning over a ground-floor frontage, south face. */
  const addAwning = (x, z, w, faceDepth) => {
    const awning = new THREE.Mesh(boxGeo, rng.pick(awningMats));
    awning.scale.set(Math.min(w * 0.72, 11), 0.16, 2.1);
    awning.position.set(x, 3.05, z + faceDepth / 2 + 0.9);
    awning.rotation.x = 0.38;
    awning.castShadow = true;
    scene.add(awning);
  };

  const addSign = (text, x, y, z, ry, w = 13) => {
    const tex = signTexture(text, '#20303a', '#ffd98f');
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w * 0.22),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
    );
    sign.position.set(x, y, z);
    sign.rotation.y = ry;
    scene.add(sign);
  };

  // --- The sky: a gradient dome the size of the world, sun disc inside it ---
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(880, 24, 14),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  skyDome.renderOrder = -10;
  scene.add(skyDome);

  // --- Ground cover: grass underneath everything, roads laid over it ------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1700, 1700), new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  scene.add(ground);

  const asphaltTex = canvasTexture(64, 256, (g) => {
    g.fillStyle = '#3c4148';
    g.fillRect(0, 0, 64, 256);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 260; i += 1) g.fillRect(Math.random() * 64, Math.random() * 256, 2, 2);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fillRect(1, 0, 2, 256);
    g.fillRect(61, 0, 2, 256);
    g.fillStyle = '#e8c96a';
    g.fillRect(30, 20, 4, 62);
    g.fillRect(30, 148, 4, 62);
  });
  const roadMatV = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.96 });
  asphaltTex.repeat.set(1, 30);
  const roadMatH = roadMatV.clone();
  roadMatH.map = asphaltTex.clone();
  roadMatH.map.rotation = Math.PI / 2;
  roadMatH.map.center.set(0.5, 0.5);
  roadMatH.map.repeat.set(1, 30);
  const roadGeoV = new THREE.PlaneGeometry(CITY.roadWide, CITY.half * 2 + 30);
  const roadGeoH = new THREE.PlaneGeometry(CITY.half * 2 + 30, CITY.roadWide);
  for (const a of avenueLines()) {
    const v = new THREE.Mesh(roadGeoV, roadMatV);
    v.rotation.x = -Math.PI / 2;
    v.position.set(a, 0, 0);
    v.receiveShadow = true;
    scene.add(v);
    const hMesh = new THREE.Mesh(roadGeoH, roadMatH);
    hMesh.rotation.x = -Math.PI / 2;
    hMesh.position.set(0, 0.01, a);
    hMesh.receiveShadow = true;
    scene.add(hMesh);
  }

  // --- Sidewalk slabs, one per block ----------------------------------------
  const slabMat = new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk, roughness: 1 });
  const slabGeo = new THREE.BoxGeometry(34, 0.3, 34);
  const centres = blockCentres();
  for (const cx of centres) {
    for (const cz of centres) {
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.position.set(cx, 0.15, cz);
      slab.receiveShadow = true;
      scene.add(slab);
    }
  }

  // --- Buildings block by block; POI blocks get a landmark and its signs ---
  let shopIndex = 0;
  centres.forEach((cx, bi) => {
    centres.forEach((cz, bj) => {
      const poiDef = POI_BY_BLOCK.get(`${bi},${bj}`);
      if (poiDef) {
        const poi = Object.values(POIS).find((p) => p.x === cx && p.z === cz);
        const f = facades[(bi + bj) % facades.length];
        const mat = new THREE.MeshStandardMaterial({
          color: poiDef.tint, roughness: 0.9, map: f.facade,
          emissive: 0xffb45e, emissiveIntensity: 0.4, emissiveMap: f.emissive,
        });
        if (poiDef.poi === 'carLot') {
          // An open lot: a low office hut only — the cars are the scenery.
          addBuilding(cx - 10, cz - 10, 9, poiDef.h, 8, mat);
          addSign(poi.name, cx - 10, 4.6, cz - 5.8, 0, 10);
        } else {
          addBuilding(cx, cz, 26, poiDef.h, 20, mat);
          addSign(poi.name, cx, poiDef.h * 0.72, cz + 10.2, 0, 15);
          addSign(poi.name, cx - 13.2, poiDef.h * 0.72, cz, -Math.PI / 2, 15);
          if (poiDef.poi !== 'station' && poiDef.poi !== 'hospital') addAwning(cx, cz, 26, 20);
        }
        return;
      }
      // Ordinary blocks roll one of three layouts.
      const pattern = rng.next();
      const mat = () => rng.pick(materials);
      if (pattern < 0.34) {
        addBuilding(cx, cz, rng.range(15, 21), rng.range(24, 52), rng.range(15, 21), mat());
        if (rng.chance(0.5)) addAwning(cx, cz, 15, 17);
      } else if (pattern < 0.72) {
        for (const ox of [-8, 8]) for (const oz of [-8, 8]) {
          if (rng.chance(0.85)) addBuilding(cx + ox, cz + oz, rng.range(10, 13), rng.range(7, 30), rng.range(10, 13), mat());
        }
        if (rng.chance(0.4)) addAwning(cx - 8, cz + 8, 11, 11);
      } else {
        addBuilding(cx - 8, cz, rng.range(11, 14), rng.range(9, 34), rng.range(16, 24), mat());
        addBuilding(cx + 9, cz + 2, rng.range(10, 13), rng.range(6, 20), rng.range(12, 18), mat());
        if (rng.chance(0.4)) addAwning(cx - 8, cz, 18, 20);
      }
      if (rng.chance(0.45) && shopIndex < SHOP_SIGNS.length) {
        addSign(SHOP_SIGNS[shopIndex], cx, rng.range(3.4, 4.6), cz + 15.4, 0, 11);
        shopIndex += 1;
        // Busy corners carry a second sign around the side.
        if (rng.chance(0.4) && shopIndex < SHOP_SIGNS.length) {
          addSign(SHOP_SIGNS[shopIndex], cx + 15.4, rng.range(3.4, 4.6), cz, Math.PI / 2, 11);
          shopIndex += 1;
        }
      }
    });
  });

  // --- Palms: a beach row, plus sidewalk corners here and there ------------
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6f55, roughness: 1 });
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 4.6, 6);
  trunkGeo.translate(0, 2.3, 0);
  const frondMat = new THREE.MeshStandardMaterial({
    map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1,
  });
  const frondGeo = new THREE.PlaneGeometry(4.6, 4.6);
  const addPalm = (x, z) => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.rotation.z = rng.range(-0.09, 0.09);
    trunk.castShadow = true;
    g.add(trunk);
    for (let k = 0; k < 3; k += 1) {
      const fronds = new THREE.Mesh(frondGeo, frondMat);
      fronds.position.y = 4.55;
      fronds.rotation.set(-Math.PI / 2 + 0.5 + rng.range(-0.12, 0.12), 0, (k * Math.PI) / 3);
      g.add(fronds);
    }
    g.scale.setScalar(rng.range(0.85, 1.25));
    g.position.set(x, groundHeightAt(x, z), z);
    scene.add(g);
  };
  for (let x = -CITY.half + 6; x < CITY.half; x += rng.range(15, 24)) addPalm(x, CITY.beachZ + 4);
  for (const cx of centres) for (const cz of centres) {
    if (rng.chance(0.4)) addPalm(cx + 15.5, cz + 15.5);
    if (rng.chance(0.25)) addPalm(cx - 15.5, cz - 15.5);
  }

  // --- Streetlights along the avenues, haloed at dusk -----------------------
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.7, metalness: 0.4 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd98f });
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 5.4, 5);
  poleGeo.translate(0, 2.7, 0);
  const lampGeo = new THREE.SphereGeometry(0.22, 8, 6);
  const lampGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xffc978, transparent: true, opacity: 0.34,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  let lampCount = 0;
  for (const a of avenueLines()) {
    for (let t = -CITY.half + 22; t < CITY.half; t += 44) {
      for (const [x, z] of [[a + 7.6, t], [t, a - 7.6]]) {
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, 0, z);
        scene.add(pole);
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(x, 5.4, z);
        scene.add(lamp);
        // Every other lamp wears a halo sprite: enough glow to read as dusk
        // without doubling the draw calls.
        lampCount += 1;
        if (lampCount % 2 === 0) {
          const halo = new THREE.Sprite(lampGlowMat);
          halo.scale.setScalar(2.6);
          halo.position.set(x, 5.4, z);
          scene.add(halo);
        }
      }
    }
  }

  // --- The shore: boardwalk, beach, pier and the sea -------------------------
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xa0784f, roughness: 1 });
  const boardwalk = new THREE.Mesh(new THREE.BoxGeometry(CITY.half * 2 + 40, 0.25, 7), woodMat);
  boardwalk.position.set(0, 0.12, CITY.beachZ);
  boardwalk.receiveShadow = true;
  scene.add(boardwalk);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(1700, 70), new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, -0.02, CITY.beachZ + 38);
  sand.receiveShadow = true;
  scene.add(sand);
  const seaTex = waterTexture();
  const waterMat = new THREE.MeshStandardMaterial({
    color: PALETTE.water, roughness: 0.32, metalness: 0.12,
    transparent: true, opacity: 0.94, map: seaTex,
    emissive: 0x1d4e5e, emissiveIntensity: 0.25, emissiveMap: seaTex,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1700, 700), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.5, CITY.waterZ + 350);
  scene.add(water);
  const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(10, 0.4, 52), woodMat);
  pierDeck.position.set(POIS.pier.x, 0.5, CITY.waterZ + 22);
  scene.add(pierDeck);

  // --- Sky dressing: the sun disc, its aura, and drifting clouds ------------
  const sun = new THREE.Mesh(new THREE.CircleGeometry(26, 24), new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }));
  sun.position.set(-620, 150, 420);
  sun.lookAt(0, 40, 0);
  scene.add(sun);
  const sunAura = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffbe78, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  sunAura.scale.setScalar(190);
  sunAura.position.copy(sun.position);
  scene.add(sunAura);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xfff4e0, transparent: true, opacity: 0.85 });
  const clouds = [];
  for (let i = 0; i < 9; i += 1) {
    const cloud = new THREE.Group();
    for (let k = 0; k < 3; k += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rng.range(9, 17), 10, 8), cloudMat);
      puff.scale.y = 0.36;
      puff.position.set(k * rng.range(10, 15) - 14, rng.range(-1, 1), rng.range(-4, 4));
      cloud.add(puff);
    }
    cloud.position.set(rng.range(-600, 600), rng.range(110, 170), rng.range(-500, 500));
    scene.add(cloud);
    clouds.push(cloud);
  }

  // --- Parked-car spots: nose-in along avenue edges, plus the dealer lot ----
  const parkedSpots = [];
  for (const a of avenueLines()) {
    for (let t = -CITY.half + 30; t < CITY.half - 10; t += 26) {
      if (rng.chance(0.42)) parkedSpots.push({ x: a + 5.6, z: t, heading: Math.PI });
      if (rng.chance(0.42)) parkedSpots.push({ x: t, z: a - 5.6, heading: Math.PI / 2 });
    }
  }
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 5; c += 1) {
      parkedSpots.push({ x: POIS.carLot.x - 12 + c * 6, z: POIS.carLot.z + 2 + r * 7, heading: 0, lot: true });
    }
  }

  return {
    colliders,
    parkedSpots,
    /** Bob the waterline, scroll the sea sparkle and drift the clouds. */
    update(dt, t) {
      water.position.y = -0.5 + Math.sin(t * 0.7) * 0.07;
      seaTex.offset.x = (t * 0.008) % 1;
      seaTex.offset.y = Math.sin(t * 0.23) * 0.012;
      for (const cloud of clouds) {
        cloud.position.x += dt * 1.1;
        if (cloud.position.x > 680) cloud.position.x = -680;
      }
    },
  };
}
