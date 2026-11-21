// The city itself: sky, sea, streets, buildings, signs, palms and lamps,
// raised from the seeded generator so every visitor gets the same Sunfall.
// Nothing here moves except the water; the module hands back the facts the
// gameplay systems need — colliders, landmarks, parking spots — and an
// update() that keeps the sea shimmering.

import * as THREE from 'three';
import {
  AVENUES, STREETS, BLOCK, ROAD_HALF, BOARDWALK_Z, SAND_Z, WATER_Z,
  PIER_X, PIER_Z0, PIER_Z1, PALETTE, Rng, clamp,
} from './config.js';

// A soft radial glow, drawn once and shared by every halo sprite in the game.
let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}
export function glowSprite(color, scale, opacity) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(scale, scale, 1);
  return s;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// --- facade & sign painting ---------------------------------------------------
function facadeTexture(baseHex, rng, density) {
  const base = new THREE.Color(baseHex);
  return canvasTexture(128, 256, (g) => {
    g.fillStyle = `#${base.getHexString()}`;
    g.fillRect(0, 0, 128, 256);
    g.fillStyle = 'rgba(0,0,0,0.13)';
    g.fillRect(0, 236, 128, 20); // shadowed ground floor
    const cols = 6, rows = 11;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (rng.next() > density) continue;
        const lit = rng.chance(0.24);
        g.fillStyle = lit ? '#ffd98a' : '#31435c';
        g.fillRect(8 + x * 20, 12 + y * 21, 12, 14);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(8 + x * 20, 12 + y * 21, 12, 3);
      }
    }
  });
}
function signTexture(text, bg = '#173f3a', fg = '#ffd98a') {
  return canvasTexture(512, 80, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 80);
    g.strokeStyle = fg;
    g.lineWidth = 4;
    g.strokeRect(6, 6, 500, 68);
    g.fillStyle = fg;
    g.font = 'bold 40px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 44);
  });
}
function stripedTexture(a, b) {
  return canvasTexture(128, 32, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? a : b;
      g.fillRect(i * 16, 0, 16, 32);
    }
  });
}

const SHOP_SIGNS = [
  'Marina Taqueria', 'Palma Records', 'Hotel Verano',
  'Solana Surf Co.', 'Bar El Faro', 'Farmacia Sol',
];

// Height of the ground under a point: the pier deck and boardwalk sit proud.
export function groundHeightAt(x, z) {
  if (Math.abs(x - PIER_X) < 4.4 && z >= PIER_Z0 - 2 && z <= PIER_Z1) return 0.55;
  if (z >= BOARDWALK_Z - 8 && z < SAND_Z - 4) return 0.12;
  return 0;
}

export function buildCity(scene, seed) {
  const rng = new Rng(seed * 7919 + 13);
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);
  const addCollider = (x, z, w, d) => {
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  };

  // --- sky, sun, light --------------------------------------------------------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x5f97d6) },
      mid: { value: new THREE.Color(0xa8c6e8) },
      low: { value: new THREE.Color(PALETTE.horizon) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vP;' +
      'void main(){ float h = normalize(vP).y; vec3 c = h > 0.18 ? mix(mid, top, smoothstep(0.18, 0.65, h)) : mix(low, mid, smoothstep(-0.06, 0.18, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(680, 24, 14), skyMat);
  group.add(sky);

  const sunDir = new THREE.Vector3(-0.42, 0.30, 0.62).normalize();
  const sunSprite = glowSprite(0xffdf9e, 260, 0.95);
  sunSprite.position.copy(sunDir).multiplyScalar(600);
  group.add(sunSprite);
  const sunCore = glowSprite(0xfff3cf, 90, 1);
  sunCore.position.copy(sunDir).multiplyScalar(600);
  group.add(sunCore);

  const hemi = new THREE.HemisphereLight(0xbfd4f2, 0xffe2b8, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdfae, 1.75);
  sun.position.copy(sunDir).multiplyScalar(220);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // --- ground, roads, shore ---------------------------------------------------
  const groundMat = new THREE.MeshLambertMaterial({ color: 0xa79b8a });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(560, 470), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -25);
  ground.receiveShadow = true;
  group.add(ground);

  const asphaltTex = canvasTexture(64, 128, (g) => {
    g.fillStyle = '#3d3f45';
    g.fillRect(0, 0, 64, 128);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 260; i++) g.fillRect(Math.random() * 64, Math.random() * 128, 2, 2);
    g.fillStyle = '#e8c85a';
    g.fillRect(30, 8, 4, 44);
    g.fillRect(30, 76, 4, 44);
  });
  asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping;

  const roadMat = new THREE.MeshLambertMaterial({ map: asphaltTex });
  const roadY = 0.02;
  for (const x of AVENUES) {
    const len = 400;
    const tex = asphaltTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, len / 32);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, len), new THREE.MeshLambertMaterial({ map: tex }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, roadY, -24);
    m.receiveShadow = true;
    group.add(m);
  }
  for (const z of STREETS) {
    const len = 480;
    const tex = asphaltTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, len / 32);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, len), new THREE.MeshLambertMaterial({ map: tex }));
    m.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    m.position.set(0, roadY, z);
    m.receiveShadow = true;
    group.add(m);
  }
  // Intersection pads so the dashes do not cross.
  const padMat = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
  for (const x of AVENUES) {
    for (const z of STREETS) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, ROAD_HALF * 2), padMat);
      p.rotation.x = -Math.PI / 2;
      p.position.set(x, roadY + 0.002, z);
      p.receiveShadow = true;
      group.add(p);
    }
  }

  // Boardwalk: warm planks between the last street and the sand.
  const plankTex = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#9a6b44';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#a5764c' : '#8f623d';
      g.fillRect(0, i * 16, 128, 15);
    }
  });
  plankTex.wrapS = plankTex.wrapT = THREE.RepeatWrapping;
  plankTex.repeat.set(24, 1);
  const boardwalk = new THREE.Mesh(
    new THREE.BoxGeometry(500, 0.24, 16),
    new THREE.MeshLambertMaterial({ map: plankTex }),
  );
  boardwalk.position.set(0, 0.0, BOARDWALK_Z);
  boardwalk.receiveShadow = true;
  group.add(boardwalk);

  // Sand and sea.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 64),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, SAND_Z + 22);
  sand.receiveShadow = true;
  group.add(sand);

  const seaTex = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#2b7d9d';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      const y = 8 + i * 14;
      g.moveTo(0, y);
      for (let x = 0; x <= 128; x += 16) g.lineTo(x, y + Math.sin(x * 0.3 + i) * 3);
      g.stroke();
    }
  });
  seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping;
  seaTex.repeat.set(18, 6);
  const seaMat = new THREE.MeshPhongMaterial({
    map: seaTex, color: 0xbfe2ee, shininess: 140, specular: 0xffedb8, transparent: true, opacity: 0.94,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(620, 190), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.06, WATER_Z + 88);
  group.add(sea);
  const glint = glowSprite(0xffe9b0, 190, 0.5);
  glint.position.set(-40, 2.5, WATER_Z + 60);
  group.add(glint);

  // The pier: deck, posts, rails, a lamp at the head.
  const pierMat = new THREE.MeshLambertMaterial({ map: plankTex });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.5, PIER_Z1 - PIER_Z0 + 8), pierMat);
  deck.position.set(PIER_X, 0.3, (PIER_Z0 + PIER_Z1) / 2);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);
  const postGeo = new THREE.CylinderGeometry(0.28, 0.28, 1.6, 6);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x6e4f30 });
  for (let z = PIER_Z0; z <= PIER_Z1; z += 12) {
    for (const sx of [-3.9, 3.9]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(PIER_X + sx, -0.3, z);
      group.add(post);
    }
  }
  const railMat = new THREE.MeshLambertMaterial({ color: 0x7d5a38 });
  for (const sx of [-4.3, 4.3]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, PIER_Z1 - PIER_Z0), railMat);
    rail.position.set(PIER_X + sx, 1.0, (PIER_Z0 + PIER_Z1) / 2);
    group.add(rail);
  }

  // --- buildings ----------------------------------------------------------------
  const facadeMats = PALETTE.facades.slice(0, 3).map((hex, i) =>
    new THREE.MeshLambertMaterial({ map: facadeTexture(hex, rng, 0.85 - i * 0.12) }));
  const whiteMat = new THREE.MeshLambertMaterial({ map: facadeTexture(0xf4f1ea, rng, 0.7) });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6e5847 });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0xfff2dc });
  const awningMats = [
    new THREE.MeshLambertMaterial({ map: stripedTexture('#c8452c', '#f7ead8') }),
    new THREE.MeshLambertMaterial({ map: stripedTexture('#1f7a72', '#f7ead8') }),
    new THREE.MeshLambertMaterial({ map: stripedTexture('#31597f', '#f7ead8') }),
  ];
  const signMats = new Map();
  const signMatFor = (text, bg, fg) => {
    if (!signMats.has(text)) signMats.set(text, new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg) }));
    return signMats.get(text);
  };

  function building(x, z, w, d, h, opts = {}) {
    const g = new THREE.Group();
    const mat = opts.white ? whiteMat : facadeMats[opts.variant ?? rng.int(0, 2)];
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.7, d + 0.8), trimMat);
    cornice.position.y = h + 0.2;
    cornice.castShadow = true;
    g.add(cornice);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w - 1.2, 0.5, d - 1.2), roofMat);
    roof.position.y = h + 0.6;
    g.add(roof);
    if (opts.awning) {
      const awn = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 0.18, 2.6), awningMats[rng.int(0, 2)]);
      awn.position.set(0, 3.1, d / 2 + 1.1);
      awn.rotation.x = -0.42;
      awn.castShadow = true;
      g.add(awn);
    }
    if (opts.sign) {
      const sw = Math.max(7, opts.sign.length * 0.78);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(sw, sw / 6.4),
        signMatFor(opts.sign, opts.signBg, opts.signFg),
      );
      sign.position.set(0, opts.signY ?? 4.6, d / 2 + 0.14);
      g.add(sign);
      const back = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.3, sw / 6.4 + 0.3, 0.18),
        new THREE.MeshLambertMaterial({ color: 0x22332f }));
      back.position.set(0, opts.signY ?? 4.6, d / 2 + 0.04);
      g.add(back);
    }
    g.position.set(x, 0, z);
    group.add(g);
    addCollider(x, z, w + 0.4, d + 0.4);
    return g;
  }

  // Cell centres of the street grid.
  const cellXs = [-160, -96, -32, 32, 96, 160];
  const cellZs = [-160, -96, -32, 32, 96];
  const key = (x, z) => `${x},${z}`;
  const landmarkCells = new Set([
    key(32, 32),     // Café Brisa
    key(160, 96),    // Dockside Cold Storage
    key(-160, 32),   // Aurora Motors lot
    key(-96, 96),    // Berto's Body Shop
    key(96, -32),    // Sunfall General
    key(32, -160),   // Central Station
    key(-96, -32),   // Palm Court park
  ]);
  const padMats = {
    walk: new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk }),
    grass: new THREE.MeshLambertMaterial({ color: PALETTE.grass }),
    yard: new THREE.MeshLambertMaterial({ color: 0x99917f }),
    lot: new THREE.MeshLambertMaterial({ color: 0x53545a }),
  };
  let shopSignIdx = 0;
  for (const cx of cellXs) {
    for (const cz of cellZs) {
      const isPark = key(cx, cz) === key(-96, -32);
      const isLot = key(cx, cz) === key(-160, 32);
      const pad = new THREE.Mesh(
        new THREE.PlaneGeometry(BLOCK - ROAD_HALF * 2 - 1, BLOCK - ROAD_HALF * 2 - 1),
        isPark ? padMats.grass : isLot ? padMats.lot : landmarkCells.has(key(cx, cz)) ? padMats.yard : padMats.walk,
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(cx, 0.035, cz);
      pad.receiveShadow = true;
      group.add(pad);
      if (landmarkCells.has(key(cx, cz)) || isPark) continue;
      // Generic buildings: one tower or a pair, taller toward the middle.
      const centrality = 1 - clamp((Math.abs(cx) + Math.abs(cz)) / 420, 0, 0.55);
      const pair = rng.chance(0.45);
      const spots = pair
        ? [[cx - 12, cz - 10], [cx + 12, cz + 11]]
        : [[cx + rng.range(-3, 3), cz + rng.range(-3, 3)]];
      for (const [bx, bz] of spots) {
        const w = rng.range(15, 21), d = rng.range(14, 20);
        const h = rng.range(9, 17) * (0.7 + centrality) + rng.range(0, 9);
        const sign = shopSignIdx < SHOP_SIGNS.length && rng.chance(0.5) ? SHOP_SIGNS[shopSignIdx++] : null;
        building(bx, bz, w, d, h, { awning: rng.chance(0.5), sign });
      }
    }
  }
  // Any shop signs not placed by chance get a home on the last generic cells.
  // (Deterministic: the loop above consumes the RNG in a fixed order.)

  // --- landmarks ------------------------------------------------------------------
  building(20, 22, 24, 17, 9, { sign: 'Café Brisa', awning: true, variant: 1 });
  building(160, 88, 46, 30, 13, { sign: 'DOCKSIDE COLD STORAGE', signY: 9.5, variant: 2 });
  building(-102, 86, 27, 19, 8, { sign: "BERTO'S BODY SHOP", signBg: '#4a2c14', signFg: '#ffd98a', variant: 0 });
  building(96, -38, 36, 24, 16, { sign: 'SUNFALL GENERAL', signBg: '#eef2f0', signFg: '#c0392b', white: true });
  building(32, -166, 46, 15, 11, { sign: 'CENTRAL STATION', signBg: '#27354a', variant: 1 });
  // Hospital steps and station forecourt slabs.
  const slabMat = new THREE.MeshLambertMaterial({ color: 0xcfc4b2 });
  const steps = new THREE.Mesh(new THREE.BoxGeometry(20, 0.5, 5), slabMat);
  steps.position.set(96, 0.25, -22);
  steps.receiveShadow = true;
  group.add(steps);
  // Aurora Motors: a proud sign over an open lot.
  const lotSign = new THREE.Mesh(new THREE.PlaneGeometry(17, 2.7), signMatFor('AURORA MOTORS', '#5c2140', '#ffd98a'));
  lotSign.position.set(-160, 6.4, 55);
  group.add(lotSign);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x37414f });
  for (const px of [-167, -153]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 6.4, 6), poleMat);
    pole.position.set(px, 3.2, 55);
    group.add(pole);
  }

  // --- palms ------------------------------------------------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x4e8f3f, side: THREE.DoubleSide });
  const frondGeo = new THREE.PlaneGeometry(0.7, 3.4);
  frondGeo.translate(0, 1.7, 0);
  function palm(x, z, s = 1) {
    const g = new THREE.Group();
    const h = rng.range(5.5, 7.5) * s;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, h, 6), trunkMat);
    trunk.position.y = h / 2;
    trunk.rotation.z = rng.range(-0.1, 0.1);
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(frondGeo, frondMat);
      f.position.y = h;
      f.rotation.y = (i / 6) * Math.PI * 2 + rng.range(-0.3, 0.3);
      f.rotation.x = rng.range(0.7, 1.05);
      g.add(f);
    }
    g.position.set(x, groundHeightAt(x, z), z);
    group.add(g);
    colliders.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
  }
  for (let x = -228; x <= 228; x += 24) palm(x + rng.range(-3, 3), BOARDWALK_Z - 5.5, 0.95);
  for (let i = 0; i < 7; i++) palm(-96 + rng.range(-18, 18), -32 + rng.range(-18, 18), 1.05);
  for (let i = 0; i < 6; i++) palm(rng.range(-210, 210), rng.range(176, 192), 0.9);
  palm(-6, PIER_Z1 - 6, 0.8);
  palm(6, PIER_Z1 - 6, 0.8);

  // Beach umbrellas.
  const umbMats = [0xd94f3d, 0x3d7bd9, 0xf2b13d].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  for (let i = 0; i < 7; i++) {
    const x = rng.range(-200, 200), z = rng.range(176, 194);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5), poleMat);
    pole.position.set(x, 1.2, z);
    group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.7, 8), umbMats[i % 3]);
    top.position.set(x, 2.5, z);
    top.castShadow = true;
    group.add(top);
  }

  // --- streetlights -------------------------------------------------------------------
  const lampPoleGeo = new THREE.CylinderGeometry(0.09, 0.13, 5.6, 5);
  const lampHeadGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe2ae });
  function streetlight(x, z) {
    const pole = new THREE.Mesh(lampPoleGeo, poleMat);
    pole.position.set(x, 2.8, z);
    group.add(pole);
    const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
    head.position.set(x, 5.7, z);
    group.add(head);
    const halo = glowSprite(0xffd9a0, 4.4, 0.30);
    halo.position.set(x, 5.7, z);
    group.add(halo);
  }
  for (const x of AVENUES) {
    let side = 1;
    for (let z = -224; z <= 140; z += 32) {
      streetlight(x + side * (ROAD_HALF + 1.4), z);
      side = -side;
    }
  }
  for (const z of STREETS) {
    let side = 1;
    for (let x = -224; x <= 224; x += 32) {
      if (Math.abs(x % 64) === 0) continue; // keep intersections clear
      streetlight(x, z + side * (ROAD_HALF + 1.4));
      side = -side;
    }
  }
  const pierLamp = glowSprite(0xffd9a0, 5.5, 0.4);
  pierLamp.position.set(PIER_X, 3.4, PIER_Z1 - 2);
  group.add(pierLamp);

  // --- parking: the Aurora lot and kerbside spots --------------------------------------
  const lotSpots = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      lotSpots.push({ x: -176 + c * 10.5, z: 22 + r * 15, angle: Math.PI });
    }
  }
  const parkedSpots = [];
  const parkEdges = [
    { x: 64 - ROAD_HALF + 1.7, z: -100, angle: Math.PI }, { x: 64 + ROAD_HALF - 1.7, z: -30, angle: 0 },
    { x: -64 + ROAD_HALF - 1.7, z: 40, angle: 0 }, { x: 128 - ROAD_HALF + 1.7, z: 90, angle: Math.PI },
    { x: -128 + ROAD_HALF - 1.7, z: -140, angle: 0 }, { x: 30, z: 64 - ROAD_HALF + 1.7, angle: Math.PI / 2 },
    { x: -60, z: 64 + ROAD_HALF - 1.7, angle: -Math.PI / 2 }, { x: 150, z: -64 + ROAD_HALF - 1.7, angle: -Math.PI / 2 },
    { x: -190, z: 0 - ROAD_HALF + 1.7, angle: Math.PI / 2 }, { x: 96, z: 128 + ROAD_HALF - 1.7, angle: -Math.PI / 2 },
    { x: 0 - ROAD_HALF + 1.7, z: -180, angle: Math.PI }, { x: 192 + ROAD_HALF - 1.7, z: 20, angle: 0 },
  ];
  for (const s of parkEdges) parkedSpots.push(s);

  const landmarks = {
    cafeDoor: new THREE.Vector3(38, 0, 44),
    warehouseYard: new THREE.Vector3(166, 0, 112),
    garageForecourt: new THREE.Vector3(-90, 0, 106),
    lot: new THREE.Vector3(-160, 0, 34),
    gtSpot: { x: -145, z: 37, angle: Math.PI },
    hospitalSteps: new THREE.Vector3(96, 0, -19),
    stationForecourt: new THREE.Vector3(32, 0, -142),
    pierEnd: new THREE.Vector3(0, 0.55, 284),
    park: new THREE.Vector3(-96, 0, -32),
    beach: new THREE.Vector3(90, 0, 184),
    boardwalk: new THREE.Vector3(-40, 0.12, 150),
  };

  return {
    group,
    colliders,
    landmarks,
    lotSpots,
    parkedSpots,
    update(dt, t) {
      seaTex.offset.set(t * 0.014, Math.sin(t * 0.22) * 0.012);
      glint.material.opacity = 0.38 + Math.sin(t * 1.7) * 0.12;
    },
  };
}

// Circle vs building AABBs: push the circle out along its smallest escape.
export function collideCircle(pos, radius, colliders) {
  for (const c of colliders) {
    const nx = clamp(pos.x, c.minX, c.maxX);
    const nz = clamp(pos.z, c.minZ, c.maxZ);
    let dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * radius;
      pos.z = nz + (dz / d) * radius;
    } else {
      // Centre inside the box: leave by the nearest face.
      const left = pos.x - c.minX, right = c.maxX - pos.x;
      const top = pos.z - c.minZ, bottom = c.maxZ - pos.z;
      const m = Math.min(left, right, top, bottom);
      if (m === left) pos.x = c.minX - radius;
      else if (m === right) pos.x = c.maxX + radius;
      else if (m === top) pos.z = c.minZ - radius;
      else pos.z = c.maxZ + radius;
    }
  }
}
