// world.js — Solara Bay itself: a procedural island city on a 60-unit road
// grid. Builds every mesh (buildings with lit window facades, neon signs,
// beach, animated water, the Grand Pier, palm trees, street lights), fills
// the AABB collider list used by physics and line-of-sight, and answers
// spatial questions for the other systems: districtAt, isRoad, isWater,
// losBlocked, coverAt.

import { S, rng, rand, randi, pick, clamp, segHitsBox, pointInBox } from './util.js';

export const LAND = 280;                 // island half-size; water beyond
export const ROAD_HALF = 7;              // road half width
export const LINES = [-240, -180, -120, -60, 0, 60, 120, 180, 240];

export const DISTRICTS = [
  { name: 'Downtown Solara',  test: (x, z) => Math.abs(x) <= 95 && Math.abs(z) <= 95 },
  { name: 'Marina District',  test: (x, z) => z > 150 },
  { name: 'North Beach',      test: (x, z) => z < -150 },
  { name: 'Palmera Heights',  test: (x, z) => x < -150 },
  { name: 'Cargo Bay',        test: (x, z) => x > 150 },
  { name: 'Midtown Palms',    test: () => true },
];
export function districtAt(x, z) {
  for (const d of DISTRICTS) if (d.test(x, z)) return d;
  return DISTRICTS[DISTRICTS.length - 1];
}

// Named places other systems anchor to (shops, missions, respawns).
export const POIS = {
  safehouse:  { x: 34,  z: 208, name: 'Marina Safehouse' },
  hq:         { x: 196, z: -176, name: 'VBPD Headquarters' },
  hospital:   { x: -46, z: -208, name: 'Mercy Hospital' },
  gunShop:    { x: 38,  z: -38, name: 'Ammu-Mart' },
  garageShop: { x: 208, z: 66, name: 'Torque & Tone' },
  foodShop:   { x: 14,  z: 186, name: 'QuickBite Marina' },
  foodShop2:  { x: -84, z: -206, name: 'QuickBite North Beach' },
  casino:     { x: -208, z: -64, name: 'Palmera Casino' },
  tower:      { x: 0,   z: -30, name: 'Solara Tower' },
  pierHead:   { x: 0,   z: 286, name: 'Grand Pier' },
  pierEnd:    { x: 0,   z: 344, name: 'Grand Pier End' },
  lighthouse: { x: 296, z: 296, name: 'Lighthouse Point' },
  islet:      { x: 168, z: 392, name: 'Ferro Islet' },
  cabStand:   { x: -18, z: 228, name: 'Marina Cab Stand' },
  raceStart:  { x: 64,  z: -124, name: 'Palmera Grand Prix Start' },
  gasStation: { x: 124, z: -44, name: 'SolGas Station' },
  garage2:    { x: -38, z: 96, name: 'Midtown Parking Garage' },
};

export const WORLD = {
  colliders: [],     // {minX,maxX,minZ,maxZ,h} solid building AABBs
  coverZones: [],    // {minX,maxX,minZ,maxZ} roofed areas that break air LOS
  lampMat: null,     // street-light head material (night glow)
  windowMats: [],    // facade materials whose emissive rises at night
  signMats: [],
  water: null,
  waterBase: null,
  palms: [],
  built: false,
};

const facadeCache = [];
function facadeTexture(base, litRatio, seedSalt) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  const cols = 6, rows = 12, cw = 128 / cols, ch = 256 / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const r = rng();
    g.fillStyle = r < litRatio ? '#ffd98a' : 'rgba(18,24,34,0.85)';
    g.fillRect(i * cw + 3, j * ch + 4, cw - 6, ch - 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
function signTexture(text, fg, bg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 96);
  g.font = 'bold 52px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = fg; g.shadowBlur = 18; g.fillStyle = fg;
  g.fillText(text, 256, 50);
  return new THREE.CanvasTexture(c);
}

const boxGeoCache = new Map();
function boxGeo(w, h, d) {
  const k = w + '|' + h + '|' + d;
  if (!boxGeoCache.has(k)) boxGeoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return boxGeoCache.get(k);
}
function addBox(scene, mat, w, h, d, x, y, z, ry) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y, z); if (ry) m.rotation.y = ry;
  m.castShadow = false; m.receiveShadow = false;
  scene.add(m); return m;
}
function addCollider(x, z, w, d, h) {
  WORLD.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: h || 10 });
}
function addSign(scene, text, fg, bg, w, x, y, z, ry) {
  const mat = new THREE.MeshBasicMaterial({ map: signTexture(text, fg, bg) });
  WORLD.signMats.push(mat);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.1875), mat);
  m.position.set(x, y, z); m.rotation.y = ry || 0;
  scene.add(m); return m;
}

export function initWorld(scene) {
  if (WORLD.built) return;
  WORLD.built = true;

  // --- island base, water, city slab -------------------------------------
  const sand = new THREE.MeshLambertMaterial({ color: 0xd9bd8a });
  addBox(scene, sand, LAND * 2 + 60, 2, LAND * 2 + 60, 0, -1.01, 0);
  const waterGeo = new THREE.PlaneGeometry(2400, 2400, 44, 44);
  waterGeo.rotateX(-Math.PI / 2);
  WORLD.waterBase = waterGeo.attributes.position.array.slice();
  WORLD.water = new THREE.Mesh(waterGeo, new THREE.MeshLambertMaterial({ color: 0x0d5a74, transparent: true, opacity: 0.94 }));
  WORLD.water.position.y = -0.55;
  scene.add(WORLD.water);
  const asphalt = new THREE.MeshLambertMaterial({ color: 0x33373d });
  addBox(scene, asphalt, 548, 0.06, 548, 0, 0.0, 0);
  const slab = new THREE.MeshLambertMaterial({ color: 0x848b90 });
  const grass = new THREE.MeshLambertMaterial({ color: 0x5d8a4a });

  // facades: 3 window-lit variants shared by every building
  const tintCols = [0xcfd6dd, 0xe3d3b8, 0xb8c9d9, 0xd9b8a6, 0xaebbb0, 0xd6cfcf];
  for (let v = 0; v < 3; v++) {
    const tex = facadeTexture('#8f979e', 0.42, v);
    const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffc873, emissiveMap: tex, emissiveIntensity: 0 });
    WORLD.windowMats.push(mat); facadeCache.push(tex);
  }
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x565b60 });

  // --- city blocks ---------------------------------------------------------
  const blockCenters = [];
  for (let i = 0; i < LINES.length - 1; i++)
    for (let j = 0; j < LINES.length - 1; j++)
      blockCenters.push({ x: (LINES[i] + LINES[i + 1]) / 2, z: (LINES[j] + LINES[j + 1]) / 2 });

  const poiBlocks = new Set(['0,-1', '-1,-3', '3,-3', '-3,-1', '3,1', '0,3']);
  for (const bc of blockCenters) {
    const dName = districtAt(bc.x, bc.z).name;
    const downtown = dName === 'Downtown Solara';
    // sidewalk / park slab
    const park = !downtown && rng() < 0.16;
    addBox(scene, park ? grass : slab, 52, 0.14, 52, bc.x, 0.07, bc.z);
    if (park) { plantPalms(scene, bc.x, bc.z, randi(3, 6)); continue; }
    const key = Math.round(bc.x / 60) + ',' + Math.round(bc.z / 60);
    if (poiBlocks.has(key)) continue; // landmark lots are dressed by hand below
    const n = downtown ? randi(2, 3) : randi(2, 4);
    for (let k = 0; k < n; k++) {
      const w = rand(12, 21), dep = rand(12, 21);
      const ox = n === 1 ? 0 : rand(-13, 13), oz = n === 1 ? 0 : rand(-13, 13);
      const hBase = downtown ? rand(20, 46) : (dName === 'Cargo Bay' ? rand(7, 13) : rand(8, 26));
      const h = hBase * rand(0.8, 1.15);
      const mat = WORLD.windowMats[randi(0, 2)];
      const b = new THREE.Mesh(boxGeo(w, h, dep), mat);
      b.position.set(bc.x + ox, h / 2 + 0.1, bc.z + oz);
      b.material = mat;
      scene.add(b);
      const roof = new THREE.Mesh(boxGeo(w + 0.4, 0.5, dep + 0.4), roofMat);
      roof.position.set(bc.x + ox, h + 0.35, bc.z + oz); scene.add(roof);
      addCollider(bc.x + ox, bc.z + oz, w, dep, h);
      if (rng() < 0.3) { // rooftop clutter
        addBox(scene, roofMat, rand(2, 4), rand(1, 2), rand(2, 4), bc.x + ox + rand(-4, 4), h + 1, bc.z + oz + rand(-4, 4));
      }
      void tintCols;
    }
  }

  dressLandmarks(scene);
  buildPier(scene);
  buildCoverStructures(scene);
  buildLamps(scene);
  plantPalms(scene, 0, 262, 7); plantPalms(scene, -120, -262, 6); plantPalms(scene, 150, 258, 5);
}

function dressLandmarks(scene) {
  const conc = new THREE.MeshLambertMaterial({ color: 0xb9bfc4 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x3c4652 });
  // Solara Tower — tallest in the city, gold crown
  const tw = new THREE.Mesh(boxGeo(20, 62, 20), WORLD.windowMats[1]);
  tw.position.set(POIS.tower.x, 31, POIS.tower.z); scene.add(tw);
  const crown = addBox(scene, new THREE.MeshLambertMaterial({ color: 0xd8a93b, emissive: 0x694d08 }), 21, 2.2, 21, POIS.tower.x, 63, POIS.tower.z);
  crown.castShadow = false;
  addCollider(POIS.tower.x, POIS.tower.z, 20, 20, 62);
  addSign(scene, 'SOLARA TOWER', '#ffd76a', '#14181d', 18, POIS.tower.x, 40, POIS.tower.z + 10.2, 0);
  // Palmera Casino
  const cas = new THREE.Mesh(boxGeo(34, 14, 24), WORLD.windowMats[2]);
  cas.position.set(POIS.casino.x, 7, POIS.casino.z); scene.add(cas);
  addCollider(POIS.casino.x, POIS.casino.z, 34, 24, 14);
  addSign(scene, 'PALMERA CASINO', '#ff5fa2', '#160a12', 26, POIS.casino.x, 12, POIS.casino.z + 12.2, 0);
  // VBPD Headquarters
  const hq = new THREE.Mesh(boxGeo(30, 16, 22), dark);
  hq.position.set(POIS.hq.x, 8, POIS.hq.z); scene.add(hq);
  addCollider(POIS.hq.x, POIS.hq.z, 30, 22, 16);
  addSign(scene, 'VBPD HEADQUARTERS', '#7ec3ff', '#0a1018', 24, POIS.hq.x, 13, POIS.hq.z - 11.2, Math.PI);
  // Mercy Hospital
  const hosp = new THREE.Mesh(boxGeo(30, 18, 20), conc);
  hosp.position.set(POIS.hospital.x, 9, POIS.hospital.z); scene.add(hosp);
  addCollider(POIS.hospital.x, POIS.hospital.z, 30, 20, 18);
  addSign(scene, 'MERCY HOSPITAL', '#ff6b6b', '#101418', 22, POIS.hospital.x, 15, POIS.hospital.z + 10.2, 0);
  // Safehouse apartment
  const sh = new THREE.Mesh(boxGeo(18, 15, 14), WORLD.windowMats[0]);
  sh.position.set(POIS.safehouse.x, 7.5, POIS.safehouse.z - 10); scene.add(sh);
  addCollider(POIS.safehouse.x, POIS.safehouse.z - 10, 18, 14, 15);
  addSign(scene, 'MARINA SUITES', '#8affd1', '#0c1410', 13, POIS.safehouse.x, 9, POIS.safehouse.z - 2.8, 0);
  // Lighthouse on the south-east rocks
  const rock = new THREE.MeshLambertMaterial({ color: 0x6d6a63 });
  addBox(scene, rock, 26, 3, 26, POIS.lighthouse.x, 0.4, POIS.lighthouse.z);
  const lh = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.1, 17, 10),
    new THREE.MeshLambertMaterial({ color: 0xf2ede2, emissive: 0x443b28 }));
  lh.position.set(POIS.lighthouse.x, 10, POIS.lighthouse.z); scene.add(lh);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), lampMat);
  lamp.position.set(POIS.lighthouse.x, 19.4, POIS.lighthouse.z); scene.add(lamp);
  WORLD.lighthouseMat = lampMat;
  addCollider(POIS.lighthouse.x, POIS.lighthouse.z, 5, 5, 17);
  // Ferro Islet — a smuggler's rock with a shack, reached by boat
  addBox(scene, rock, 34, 2.5, 26, POIS.islet.x, 0.2, POIS.islet.z);
  const shack = new THREE.Mesh(boxGeo(9, 4, 7), new THREE.MeshLambertMaterial({ color: 0x7a5c38 }));
  shack.position.set(POIS.islet.x - 6, 3.4, POIS.islet.z); scene.add(shack);
  addCollider(POIS.islet.x - 6, POIS.islet.z, 9, 7, 4);
  addBox(scene, new THREE.MeshLambertMaterial({ color: 0x8a6f47 }), 16, 0.5, 4, POIS.islet.x + 8, 1.4, POIS.islet.z + 8);
}

function buildPier(scene) {
  const wood = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  const deck = new THREE.Mesh(boxGeo(13, 1, 76), wood);
  deck.position.set(POIS.pierHead.x, 0.15, 322); scene.add(deck);
  for (let i = 0; i < 6; i++) {
    addBox(scene, wood, 1, 3, 1, -5.5, -1, 292 + i * 11);
    addBox(scene, wood, 1, 3, 1, 5.5, -1, 292 + i * 11);
  }
  addSign(scene, 'GRAND PIER', '#ffe9a8', '#14202a', 12, 0, 6.5, 288, Math.PI);
  addBox(scene, wood, 10, 4.5, 12, 0, 2.6, 348); // pier-end kiosk
  addCollider(0, 348, 10, 12, 4.5);
}

function buildCoverStructures(scene) {
  const post = new THREE.MeshLambertMaterial({ color: 0x707880 });
  const roofM = new THREE.MeshLambertMaterial({ color: 0x4a5058 });
  // SolGas canopy — drive under it to break the helicopter's line of sight
  const g = POIS.gasStation;
  for (const [ox, oz] of [[-9, -6], [9, -6], [-9, 6], [9, 6]]) {
    addBox(scene, post, 0.8, 5.4, 0.8, g.x + ox, 2.7, g.z + oz);
    addCollider(g.x + ox, g.z + oz, 0.9, 0.9, 5.4);
  }
  addBox(scene, roofM, 22, 0.7, 15, g.x, 5.6, g.z);
  WORLD.coverZones.push({ minX: g.x - 11, maxX: g.x + 11, minZ: g.z - 7.5, maxZ: g.z + 7.5 });
  addSign(scene, 'SOLGAS', '#ffb14e', '#181008', 12, g.x, 7.4, g.z + 7.9, 0);
  addBox(scene, WORLD.windowMats[0], 12, 4, 6, g.x, 2, g.z - 12); // kiosk
  addCollider(g.x, g.z - 12, 12, 6, 4);
  // Midtown parking garage — two open decks, perfect police cover
  const p = POIS.garage2;
  addBox(scene, roofM, 34, 0.7, 24, p.x, 3.4, p.z);
  addBox(scene, roofM, 34, 0.7, 24, p.x, 7.2, p.z);
  for (const [ox, oz] of [[-16, -11], [16, -11], [-16, 11], [16, 11], [0, -11], [0, 11]]) {
    addBox(scene, post, 1, 7.4, 1, p.x + ox, 3.7, p.z + oz);
    addCollider(p.x + ox, p.z + oz, 1.1, 1.1, 7.4);
  }
  WORLD.coverZones.push({ minX: p.x - 17, maxX: p.x + 17, minZ: p.z - 12, maxZ: p.z + 12 });
  addSign(scene, 'PARKING', '#9fd8ff', '#0c1218', 11, p.x, 8.6, p.z + 12.2, 0);
  // Pier roof at the pier head
  addBox(scene, roofM, 13, 0.5, 10, 0, 4.6, 292);
  WORLD.coverZones.push({ minX: -6.5, maxX: 6.5, minZ: 287, maxZ: 297 });
}

function buildLamps(scene) {
  const spots = [];
  for (const lx of LINES) for (let z = -255; z <= 255; z += 51) spots.push([lx + 8.4, z]);
  for (const lz of LINES) for (let x = -255; x <= 255; x += 51) spots.push([x, lz + 8.4]);
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 5.6, 5);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
  const headGeo = new THREE.SphereGeometry(0.34, 6, 5);
  WORLD.lampMat = new THREE.MeshBasicMaterial({ color: 0x554e33 });
  const heads = new THREE.InstancedMesh(headGeo, WORLD.lampMat, spots.length);
  const m4 = new THREE.Matrix4();
  spots.forEach(([x, z], i) => {
    m4.makeTranslation(x, 2.8, z); poles.setMatrixAt(i, m4);
    m4.makeTranslation(x, 5.7, z); heads.setMatrixAt(i, m4);
  });
  scene.add(poles); scene.add(heads);
}

function plantPalms(scene, cx, cz, n) {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7d3a });
  for (let i = 0; i < n; i++) {
    const x = cx + rand(-20, 20), z = cz + rand(-20, 20);
    const h = rand(5, 8);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, h, 5), trunkMat);
    trunk.position.set(x, h / 2, z); trunk.rotation.z = rand(-0.08, 0.08); scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(2.5, 7, 5), leafMat);
    crown.scale.set(1, 0.42, 1);
    crown.position.set(x, h + 0.35, z); scene.add(crown);
    WORLD.palms.push({ x, z });
  }
}

// --- spatial queries -------------------------------------------------------
export function isRoad(x, z) {
  if (Math.abs(x) > 268 || Math.abs(z) > 268) return false;
  for (const l of LINES) if (Math.abs(x - l) < ROAD_HALF || Math.abs(z - l) < ROAD_HALF) return true;
  return false;
}
export function isWater(x, z) {
  if (Math.abs(x) <= LAND + 8 && Math.abs(z) <= LAND + 8) {
    // the pier deck corridor stays walkable/drivable ground for boats to dock
    if (Math.abs(x) < 9 && z > LAND && z < 356) return false;
    return false;
  }
  return true;
}
export function groundHeight(x, z) { return isWater(x, z) ? -0.55 : 0; }
export function losBlocked(x1, z1, x2, z2) {
  for (const b of WORLD.colliders) if (segHitsBox(x1, z1, x2, z2, b)) return true;
  return false;
}
export function coverAt(x, z) {
  for (const c of WORLD.coverZones) if (pointInBox(x, z, c, 0)) return true;
  return false;
}
export function collideCircle(x, z, r) {
  // Push a circle (entity) out of every building AABB; returns corrected pos.
  let nx = x, nz = z;
  for (const b of WORLD.colliders) {
    const cx = clamp(nx, b.minX, b.maxX), cz = clamp(nz, b.minZ, b.maxZ);
    const dx = nx - cx, dz = nz - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) { const d = Math.sqrt(d2); nx = cx + (dx / d) * r; nz = cz + (dz / d) * r; }
      else { // inside the box: push out along the smallest penetration axis
        const pl = nx - b.minX, pr = b.maxX - nx, pt = nz - b.minZ, pb = b.maxZ - nz;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) nx = b.minX - r; else if (m === pr) nx = b.maxX + r;
        else if (m === pt) nz = b.minZ - r; else nz = b.maxZ + r;
      }
    }
  }
  return { x: nx, z: nz };
}
export function randomRoadPoint() {
  const vert = rng() < 0.5;
  const line = pick(LINES), t = rand(-255, 255);
  return vert ? { x: line + rand(-3, 3), z: t } : { x: t, z: line + rand(-3, 3) };
}
export function randomSidewalkPoint() {
  // a point on a random block's sidewalk ring
  const bx = pick(LINES.slice(0, -1)) + 30, bz = pick(LINES.slice(0, -1)) + 30;
  const side = randi(0, 3), t = rand(-24, 24);
  if (side === 0) return { x: bx + t, z: bz - 25 };
  if (side === 1) return { x: bx + t, z: bz + 25 };
  if (side === 2) return { x: bx - 25, z: bz + t };
  return { x: bx + 25, z: bz + t };
}

const _wv = null;
export function updateWorld(dt, t) {
  // animated water: gentle swell on the shared plane geometry
  if (WORLD.water) {
    const pos = WORLD.water.geometry.attributes.position;
    const base = WORLD.waterBase;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3], bz = base[i * 3 + 2];
      pos.array[i * 3 + 1] = Math.sin(bx * 0.021 + t * 0.9) * 0.22 + Math.cos(bz * 0.017 + t * 0.7) * 0.22;
    }
    pos.needsUpdate = true;
  }
  if (WORLD.lighthouseMat) {
    const pulse = 0.65 + 0.35 * Math.sin(t * 2.2);
    WORLD.lighthouseMat.color.setRGB(1 * pulse + 0.3, 0.91 * pulse + 0.25, 0.66 * pulse + 0.15);
  }
}
