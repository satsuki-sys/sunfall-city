// city.js — raises Sunfall City itself: the street grid, three families of
// pastel towers with lit windows, cornices and striped awnings, the named
// shopfronts, streetlights with halos, palms, the boardwalk, the beach, the
// pier and the sea. It also owns the ground's shape: how high the pavement
// is at a point, and the boxes things collide with.

import * as THREE from 'three';
import {
  AVENUES, STREETS, BLOCK_CENTERS, ROAD_HALF, BLOCK_HALF, COLORS,
  SHOP_SIGNS, mulberry32,
} from './config.js';

// --- shared canvas textures -------------------------------------------------

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A soft radial glow, used for streetlight halos, the sun's aura, headlight
// glare and the Sun Discs' shine.
export function glowTexture() {
  return canvasTexture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
}

function facadeTexture(base, trim, rng) {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = trim; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 8, w, 8);
    const cols = 6, rows = 8;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const lit = rng() < 0.42;
        g.fillStyle = lit ? '#ffd98c' : '#2c3e50';
        g.fillRect(14 + x * 40, 22 + y * 28, 22, 16);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(14 + x * 40, 22 + y * 28, 22, 3);
      }
    }
  });
}

function awningTexture(a, b) {
  const tex = canvasTexture(128, 32, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 16, 0, 16, h); }
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

export function signTexture(text, bg = '#24303c', fg = '#ffd98c') {
  return canvasTexture(512, 96, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg;
    g.font = 'bold 44px Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

function roadTexture() {
  const tex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#3c4148'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 300; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    g.fillStyle = '#e8e4da';
    g.fillRect(4, 0, 3, h); g.fillRect(w - 7, 0, 3, h);
    g.fillStyle = '#f2c14e';
    g.fillRect(w / 2 - 3, 6, 6, 52);   // one dash per tile; tiles repeat
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function planksTexture() {
  const tex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#9a6b44'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) {
      g.fillStyle = y % 2 ? '#96683f' : '#a2714a';
      g.fillRect(0, y * 32, w, 30);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y * 32 + 30, w, 2);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function seaTexture() {
  const tex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#2f7ea6'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.08})`;
      const len = 8 + Math.random() * 26;
      g.fillRect(Math.random() * w, Math.random() * h, len, 2);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 6);
  return tex;
}

// --- collision ---------------------------------------------------------------
// Colliders are flat boxes {minX, maxX, minZ, maxZ}. A circle is pushed out
// along whichever face it penetrates least, which reads as sliding along a
// wall rather than sticking to it.

export function resolveCollisions(pos, radius, colliders) {
  for (const b of colliders) {
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    let dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // Centre inside the box: leave by the nearest face.
      const left = pos.x - b.minX, right = b.maxX - pos.x;
      const top = pos.z - b.minZ, bottom = b.maxZ - pos.z;
      const m = Math.min(left, right, top, bottom);
      if (m === left) pos.x = b.minX - radius;
      else if (m === right) pos.x = b.maxX + radius;
      else if (m === top) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    }
  }
}

export function groundHeightAt(x, z) {
  if (x >= -4.5 && x <= 4.5 && z >= 116 && z <= 197) return 0.55;   // pier deck
  for (const bx of BLOCK_CENTERS) for (const bz of BLOCK_CENTERS) {
    if (Math.abs(x - bx) <= 21 && Math.abs(z - bz) <= 21) return 0.12; // block slab
  }
  if (z >= 116 && z <= 128 && x >= -116 && x <= 116) return 0.12;      // boardwalk
  return 0;
}

// --- the build ----------------------------------------------------------------

const FACADES = [
  ['#e8c39a', '#b57e4e'],   // sand
  ['#e5a9a0', '#a9635c'],   // rose
  ['#a8cfc4', '#5f8a7d'],   // aqua
];

export function buildCity(scene, seed) {
  const rng = mulberry32(seed * 7919 + 13);
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const glow = glowTexture();

  const box = (w, h, d, mat, x, y, z, parent = group) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const collide = (cx, cz, w, d) => colliders.push({
    minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2,
  });

  // Sky: a gradient dome and the low sun's aura over the sea.
  const skyTex = canvasTexture(64, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#274b73');
    grad.addColorStop(0.45, '#2e6da8');
    grad.addColorStop(0.72, '#e8a56b');
    grad.addColorStop(0.82, '#ffd9a0');
    grad.addColorStop(1, '#ffca7a');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(640, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  group.add(sky);
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xffb45e, transparent: true, opacity: 0.95, fog: false, depthWrite: false,
  }));
  sunSprite.position.set(-260, 95, 520);
  sunSprite.scale.setScalar(340);
  group.add(sunSprite);

  // Base ground: warm concrete everywhere the roads and slabs don't cover.
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshLambertMaterial({ color: 0x9c8f7a }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.z = 60;
  base.receiveShadow = true;
  group.add(base);

  // Roads, with a dashed centre line that repeats along their length.
  const roadTex = roadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  for (const a of AVENUES) {
    const t = roadTex.clone(); t.needsUpdate = true; t.repeat.set(1, 15);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 240), new THREE.MeshLambertMaterial({ map: t }));
    m.rotation.x = -Math.PI / 2; m.position.set(a, 0.02, 0);
    m.receiveShadow = true; group.add(m);
  }
  for (const s of STREETS) {
    const t = roadTex.clone(); t.needsUpdate = true; t.repeat.set(15, 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(240, ROAD_HALF * 2), new THREE.MeshLambertMaterial({ map: t }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI / 2; m.position.set(0, 0.03, s);
    m.receiveShadow = true; group.add(m);
  }
  // The shore road runs on to the boardwalk's edge.
  const shore = new THREE.Mesh(new THREE.PlaneGeometry(240, 14), new THREE.MeshLambertMaterial({ color: COLORS.sidewalk }));
  shore.rotation.x = -Math.PI / 2; shore.position.set(0, 0.025, 113);
  shore.receiveShadow = true; group.add(shore);

  // Sea, beach and boardwalk.
  const seaTex = seaTexture();
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 300),
    new THREE.MeshLambertMaterial({ map: seaTex, transparent: true, opacity: 0.94 }),
  );
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.22, 158 + 150);
  group.add(sea);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 34),
    new THREE.MeshLambertMaterial({ color: COLORS.sand }),
  );
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.04, 143);
  sand.receiveShadow = true; group.add(sand);
  const planks = planksTexture(); planks.repeat.set(30, 2);
  const walk = new THREE.Mesh(
    new THREE.BoxGeometry(236, 0.12, 12),
    new THREE.MeshLambertMaterial({ map: planks }),
  );
  walk.position.set(0, 0.06, 122); walk.receiveShadow = true; group.add(walk);

  // The pier: a timber deck on posts, railings, lamps and a hut at the head.
  const pierMat = new THREE.MeshLambertMaterial({ map: planksTexture() });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 80), pierMat);
  deck.position.set(0, 0.4, 157); deck.castShadow = true; deck.receiveShadow = true;
  group.add(deck);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x6e4f30 });
  for (let z = 122; z <= 194; z += 9) {
    for (const x of [-3.8, 3.8]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.6, 6), postMat);
      post.position.set(x, -0.2, z); group.add(post);
    }
  }
  const railMat = new THREE.MeshLambertMaterial({ color: 0xd8cfc0 });
  for (const x of [-4.4, 4.4]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 78), railMat);
    rail.position.set(x, 1.35, 157); group.add(rail);
    const posts = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 78), railMat);
    posts.position.set(x, 0.95, 157); posts.material = new THREE.MeshLambertMaterial({ color: 0x8a7a66 });
    group.add(posts);
  }
  const hut = box(5, 3, 4, new THREE.MeshLambertMaterial({ color: 0x7a4a2b }), 0, 2.05, 193);
  hut.castShadow = true; collide(0, 193, 5.4, 4.4);
  colliders.push({ minX: -5.2, maxX: -4.2, minZ: 116, maxZ: 197 }); // west rail line
  colliders.push({ minX: 4.2, maxX: 5.2, minZ: 116, maxZ: 197 });   // east rail line

  // --- buildings -------------------------------------------------------------
  const facadeMats = FACADES.map(([base, trim]) => new THREE.MeshLambertMaterial({ map: facadeTexture(base, trim, rng) }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b5a48 });

  function building(cx, cz, w, d, h, variant) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), facadeMats[variant % 3]);
    body.position.y = h / 2; body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.7, d + 1.2), roofMat);
    cornice.position.y = h + 0.3; cornice.castShadow = true;
    g.add(cornice);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 1.6, d * 0.4), roofMat);
    cap.position.y = h + 1.4; g.add(cap);
    g.position.set(cx, 0.12, cz);
    group.add(g);
    collide(cx, cz, w + 0.4, d + 0.4);
    return g;
  }

  function awning(cx, cz, w, a, b, facing = 0) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.15, 3),
      new THREE.MeshLambertMaterial({ map: awningTexture(a, b) }),
    );
    m.position.set(cx, 3.1, cz);
    m.rotation.x = 0.5;
    m.rotation.y = facing;
    m.castShadow = true;
    group.add(m);
  }

  function sign(text, x, y, z, w = 13, facing = 0, bg, fg) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w * 0.1875),
      new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg), side: THREE.DoubleSide }),
    );
    m.position.set(x, y, z); m.rotation.y = facing;
    group.add(m);
    return m;
  }

  // Block slabs first: every block sits on a pale pavement plinth.
  const slabMat = new THREE.MeshLambertMaterial({ color: COLORS.sidewalk });
  for (const bx of BLOCK_CENTERS) for (const bz of BLOCK_CENTERS) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(42, 0.12, 42), slabMat);
    slab.position.set(bx, 0.06, bz); slab.receiveShadow = true;
    group.add(slab);
  }

  // The named places.
  // Café Brisa: a low café with a striped awning on the shore road.
  const cafe = box(24, 7, 13, new THREE.MeshLambertMaterial({ color: 0xf0dfba }), 26, 3.62, 87);
  cafe.castShadow = true; collide(26, 87, 24.4, 13.4);
  sign('Café Brisa', 26, 5.6, 93.8, 15);
  awning(26, 94.6, 22, '#c23a72', '#f2ead8');
  // Dockside Cold Storage: a wide, low warehouse in the north-east.
  const wh = box(32, 10, 24, new THREE.MeshLambertMaterial({ color: 0x8a97a3 }), 78, 5.12, -78);
  wh.castShadow = true; collide(78, -78, 32.4, 24.4);
  sign('Dockside Cold Storage', 78, 8, -65.7, 20, 0, '#33424f', '#ffd98c');
  const doorMat = new THREE.MeshLambertMaterial({ color: 0x4a5560 });
  for (const dx of [-9, 0, 9]) box(6, 5.5, 0.3, doorMat, 78 + dx, 2.85, -65.8);
  // Sunfall PD and Sunfall General: sober towers facing their forecourts.
  building(-26, -84, 22, 15, 15, 1); sign('Sunfall PD', -26, 11, -76.2, 14, 0, '#1d3a5f', '#cfe4ff');
  building(26, -84, 22, 15, 13, 2); sign('Sunfall General', 26, 10, -76.2, 15, 0, '#eef2ee', '#2f7d5a');
  // Berto's Body Shop: a garage with a wide open mouth (a dark inset).
  const berto = box(24, 7, 14, new THREE.MeshLambertMaterial({ color: 0xd8b25e }), 78, 3.62, 19);
  berto.castShadow = true; collide(78, 19, 24.4, 14.4);
  box(16, 4.6, 0.3, new THREE.MeshLambertMaterial({ color: 0x22262b }), 78, 2.4, 26.2);
  sign("Berto's Body Shop", 78, 6.2, 26.4, 16, 0, '#5a3a1a', '#ffd98c');
  // The two car lots: asphalt pads and tall pole signs; the cars come later.
  const lotMat = new THREE.MeshLambertMaterial({ color: 0x4a4f57 });
  for (const [lx, lz, name] of [[-78, 26, 'Aurora Motors'], [-78, -26, 'Sunset Motors']]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(38, 0.1, 38), lotMat);
    pad.position.set(lx, 0.14, lz); pad.receiveShadow = true; group.add(pad);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 9, 8),
      new THREE.MeshLambertMaterial({ color: 0x555c66 }));
    pole.position.set(lx + 14, 4.5, lz + 14); group.add(pole);
    sign(name, lx + 14, 9.4, lz + 14, 13, Math.PI / 4, '#24303c', '#ffd98c');
  }
  // Palmetto Park: grass, palms and benches, no building at all.
  const park = new THREE.Mesh(new THREE.BoxGeometry(40, 0.14, 40),
    new THREE.MeshLambertMaterial({ color: COLORS.grass }));
  park.position.set(-26, 0.13, 26); park.receiveShadow = true; group.add(park);
  // Founders Plaza: paving and a fountain, off-centre so the disc has room.
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(40, 0.14, 40),
    new THREE.MeshLambertMaterial({ color: COLORS.plaza }));
  plaza.position.set(26, 0.13, -26); plaza.receiveShadow = true; group.add(plaza);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.8, 1, 20),
    new THREE.MeshLambertMaterial({ color: 0x8a97a3 }));
  basin.position.set(17, 0.6, -33); basin.castShadow = true; group.add(basin);
  const waterDisc = new THREE.Mesh(new THREE.CircleGeometry(4.1, 20),
    new THREE.MeshLambertMaterial({ color: 0x63b3d6 }));
  waterDisc.rotation.x = -Math.PI / 2; waterDisc.position.set(17, 1.05, -33); group.add(waterDisc);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.6, 10),
    new THREE.MeshLambertMaterial({ color: 0x8a97a3 }));
  pillar.position.set(17, 1.8, -33); group.add(pillar);
  collide(17, -33, 9.4, 9.4);

  // Generic towers on the blocks that are left.
  const towerBlocks = [[-78, -78], [-26, -26], [78, -26], [26, 26], [-78, 78], [-26, 78], [78, 78]];
  let vi = 0;
  for (const [bx, bz] of towerBlocks) {
    const h = 17 + rng() * 20;
    building(bx, bz, 19 + rng() * 4, 19 + rng() * 4, h, vi++);
    if (rng() < 0.7) {
      const side = rng() < 0.5 ? -11 : 11;
      building(bx + side, bz + (rng() < 0.5 ? -10 : 10), 11, 11, 8 + rng() * 7, vi++);
    }
    // A shopfront sign on the street face of the main tower.
    const name = SHOP_SIGNS[3 + ((vi * 2) % 9)];
    sign(name, bx, 4.6, bz + 12.4, 11, 0);
    awning(bx, bz + 13.2, 13, '#2f6fb2', '#f2ead8');
  }
  // One more tower behind the café.
  building(38, 63, 13, 12, 19, 2);

  // Streetlights: a pole, a warm head and a halo, two to an intersection.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3d454e });
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const haloMat = new THREE.SpriteMaterial({ map: glow, color: 0xffc98a, transparent: true, opacity: 0.55, depthWrite: false });
  for (const a of AVENUES) for (const s of STREETS) {
    for (const [lx, lz] of [[a + 10, s + 10], [a - 10, s - 10]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.6, 6), poleMat);
      pole.position.set(lx, 2.8, lz); group.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), headMat);
      head.position.set(lx, 5.7, lz); group.add(head);
      const halo = new THREE.Sprite(haloMat);
      halo.position.set(lx, 5.7, lz); halo.scale.setScalar(4.2);
      group.add(halo);
    }
  }

  // Palms along the boardwalk and around the park.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x4e8a3f, side: THREE.DoubleSide });
  function palm(x, z, s = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 5.4, 6), trunkMat);
    trunk.position.y = 2.7; trunk.rotation.z = 0.08; trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.8), frondMat);
      const ang = (i / 6) * Math.PI * 2;
      frond.position.set(Math.cos(ang) * 1.4, 5.6, Math.sin(ang) * 1.4);
      frond.rotation.set(0.5, -ang, 0, 'YXZ');
      g.add(frond);
    }
    g.position.set(x, groundHeightAt(x, z), z);
    g.scale.setScalar(s);
    group.add(g);
  }
  for (let x = -104; x <= 104; x += 16) { palm(x, 117.5); palm(x + 8, 126.5, 0.9); }
  for (const [px, pz] of [[-42, 10], [-10, 10], [-42, 42], [-10, 42], [-26, 8], [-44, 26]]) palm(px, pz, 1.1);
  for (const [px, pz] of [[52, 136], [-44, 140], [88, 134]]) palm(px, pz);

  // Distant towers on the horizon, north and inland: silhouettes in the haze.
  const silhouette = new THREE.MeshLambertMaterial({ color: 0x51606e });
  for (let i = 0; i < 26; i++) {
    const ang = Math.PI + (i / 26) * Math.PI;   // the landward half
    const r = 260 + rng() * 90;
    const h = 30 + rng() * 60;
    const m = new THREE.Mesh(new THREE.BoxGeometry(22 + rng() * 18, h, 22), silhouette);
    m.position.set(Math.cos(ang) * r, h / 2, Math.sin(ang) * r - 40);
    group.add(m);
  }

  return {
    group,
    colliders,
    // The sea's shimmer: drift its texture a little each frame.
    update(dt) {
      seaTex.offset.x += dt * 0.008;
      seaTex.offset.y += dt * 0.003;
    },
  };
}
