// Sunfall City itself: a sun-soaked coastal grid built procedurally from a seed —
// pastel towers with lit windows, palm-lined avenues, named places of interest
// with hand-lettered signs, a boardwalk, a beach and the sea to the south.
// Everything is geometry and canvas textures made here; nothing is loaded.

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

const POI_BY_BLOCK = new Map([
  ['2,2', { poi: 'cafe', h: 11, tint: 0xf2b879 }],
  ['8,3', { poi: 'garage', h: 9, tint: 0x9fb7c9 }],
  ['9,9', { poi: 'warehouse', h: 13, tint: 0xb08968 }],
  ['3,10', { poi: 'pier', h: 10, tint: 0x7fb2d9 }],
  ['5,1', { poi: 'hospital', h: 20, tint: 0xf7f3ea }],
  ['5,5', { poi: 'station', h: 14, tint: 0x8d99ae }],
  ['8,9', { poi: 'carLot', h: 6, tint: 0xe8836b }],
]);

const SHOP_SIGNS = ['Palms Hotel', 'Surf & Sand', 'Banco del Sol', 'Cine Mar', 'Marina Books', 'Hotel Brisa', 'La Ola Tacos', 'Sunset Realty'];

const CENTRES = blockCentres();

/** Height of the walkable ground: sidewalks are raised slabs over the streets. */
export function groundHeightAt(x, z) {
  // The pier deck stands over the water at the Palms Pier.
  if (Math.abs(x - POIS.pier.x) < 5 && z > CITY.waterZ - 4 && z < CITY.waterZ + 48) return 0.7;
  if (z > CITY.beachZ - 8) return 0;
  const cx = CENTRES[Math.max(0, Math.min(CITY.blocks - 1, Math.round((x + CITY.half - CITY.pitch / 2) / CITY.pitch)))];
  const cz = CENTRES[Math.max(0, Math.min(CITY.blocks - 1, Math.round((z + CITY.half - CITY.pitch / 2) / CITY.pitch)))];
  if (Math.abs(x - cx) < 17 && Math.abs(z - cz) < 17) return 0.3;
  return 0;
}

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

/** Facade: pale plaster with a grid of windows; the emissive twin lights some. */
function facadeTextures() {
  const cols = 6;
  const rows = 12;
  const lit = [];
  const facade = canvasTexture(128, 256, (g) => {
    g.fillStyle = '#ddd5c2';
    g.fillRect(0, 0, 128, 256);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const on = Math.random() < 0.24;
        lit.push(on);
        g.fillStyle = on ? '#5a4632' : '#39434f';
        g.fillRect(8 + c * 20, 10 + r * 20, 12, 13);
      }
    }
  });
  let i = 0;
  const emissive = canvasTexture(128, 256, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 128, 256);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (lit[i]) { g.fillStyle = '#ffb45e'; g.fillRect(8 + c * 20, 10 + r * 20, 12, 13); }
        i += 1;
      }
    }
  });
  return { facade, emissive };
}

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

export function buildCity(scene, rng) {
  const colliders = [];
  const { facade, emissive } = facadeTextures();
  const tints = [0xf7f3ea, 0xf2c9a0, 0xe8836b, 0x9fd4c5, 0xf2e3c6, 0xd96c85, 0xa8c6df, 0xf2d16b];
  const materials = tints.map((tint) => new THREE.MeshStandardMaterial({
    color: tint, roughness: 0.92, metalness: 0.02,
    map: facade, emissive: 0xffb45e, emissiveIntensity: 0.38, emissiveMap: emissive,
  }));
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a6f55, roughness: 1 });
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
    if (h > 18 && rng.chance(0.7)) {
      const prop = new THREE.Mesh(boxGeo, roofMat);
      prop.scale.set(w * 0.3, rng.range(1, 2.4), d * 0.3);
      prop.position.set(x + rng.range(-w / 5, w / 5), 0.3 + h, z + rng.range(-d / 5, d / 5));
      prop.castShadow = true;
      scene.add(prop);
    }
    return mesh;
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

  // Ground, roads, sidewalks.
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
    const h = new THREE.Mesh(roadGeoH, roadMatH);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.01, a);
    h.receiveShadow = true;
    scene.add(h);
  }

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

  // Buildings, block by block; POI blocks get one landmark and a sign.
  let shopIndex = 0;
  centres.forEach((cx, bi) => {
    centres.forEach((cz, bj) => {
      const key = `${bi},${bj}`;
      const poiDef = POI_BY_BLOCK.get(key);
      if (poiDef) {
        const poi = Object.values(POIS).find((p) => p.x === cx && p.z === cz);
        const mat = new THREE.MeshStandardMaterial({
          color: poiDef.tint, roughness: 0.9, map: facade,
          emissive: 0xffb45e, emissiveIntensity: 0.4, emissiveMap: emissive,
        });
        if (poiDef.poi === 'carLot') {
          // An open lot: low office hut only, the cars are the scenery.
          addBuilding(cx - 10, cz - 10, 9, poiDef.h, 8, mat);
          addSign(poi.name, cx - 10, 4.6, cz - 5.8, 0, 10);
        } else {
          addBuilding(cx, cz, 26, poiDef.h, 20, mat);
          addSign(poi.name, cx, poiDef.h * 0.72, cz + 10.2, 0, 15);
          addSign(poi.name, cx - 13.2, poiDef.h * 0.72, cz, -Math.PI / 2, 15);
        }
        return;
      }
      const pattern = rng.next();
      const mat = () => rng.pick(materials);
      if (pattern < 0.34) {
        addBuilding(cx, cz, rng.range(15, 21), rng.range(24, 52), rng.range(15, 21), mat());
      } else if (pattern < 0.72) {
        for (const ox of [-8, 8]) for (const oz of [-8, 8]) {
          if (rng.chance(0.85)) addBuilding(cx + ox, cz + oz, rng.range(10, 13), rng.range(7, 30), rng.range(10, 13), mat());
        }
      } else {
        addBuilding(cx - 8, cz, rng.range(11, 14), rng.range(9, 34), rng.range(16, 24), mat());
        addBuilding(cx + 9, cz + 2, rng.range(10, 13), rng.range(6, 20), rng.range(12, 18), mat());
      }
      if (rng.chance(0.3) && shopIndex < SHOP_SIGNS.length) {
        addSign(SHOP_SIGNS[shopIndex], cx, rng.range(3.4, 4.6), cz + 15.4, 0, 11);
        shopIndex += 1;
      }
    });
  });

  // Palms: beach row plus sidewalk corners.
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
    const s = rng.range(0.85, 1.25);
    g.scale.setScalar(s);
    g.position.set(x, groundHeightAt(x, z), z);
    scene.add(g);
  };
  for (let x = -CITY.half + 6; x < CITY.half; x += rng.range(15, 24)) addPalm(x, CITY.beachZ + 4);
  for (const cx of centres) for (const cz of centres) {
    if (rng.chance(0.4)) addPalm(cx + 15.5, cz + 15.5);
    if (rng.chance(0.25)) addPalm(cx - 15.5, cz - 15.5);
  }

  // Streetlights along the avenues.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.7, metalness: 0.4 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd98f });
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 5.4, 5);
  poleGeo.translate(0, 2.7, 0);
  const lampGeo = new THREE.SphereGeometry(0.22, 8, 6);
  for (const a of avenueLines()) {
    for (let t = -CITY.half + 22; t < CITY.half; t += 44) {
      for (const [x, z] of [[a + 7.6, t], [t, a - 7.6]]) {
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, 0, z);
        scene.add(pole);
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(x, 5.4, z);
        scene.add(lamp);
      }
    }
  }

  // Boardwalk, beach, pier and the sea.
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
  const waterMat = new THREE.MeshStandardMaterial({ color: PALETTE.water, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.94 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1700, 700), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.5, CITY.waterZ + 350);
  scene.add(water);
  const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(10, 0.4, 52), woodMat);
  pierDeck.position.set(POIS.pier.x, 0.5, CITY.waterZ + 22);
  scene.add(pierDeck);

  // Sun disc and drifting clouds.
  const sun = new THREE.Mesh(new THREE.CircleGeometry(26, 24), new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }));
  sun.position.set(-620, 150, 420);
  sun.lookAt(0, 40, 0);
  scene.add(sun);
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

  // Parked-car spots: nose-in along avenue edges plus the Shoreline Motors lot.
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
    update(dt, t) {
      water.position.y = -0.5 + Math.sin(t * 0.7) * 0.07;
      for (const cloud of clouds) {
        cloud.position.x += dt * 1.1;
        if (cloud.position.x > 680) cloud.position.x = -680;
      }
    },
  };
}
