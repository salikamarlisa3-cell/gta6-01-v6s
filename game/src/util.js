// util.js — shared helpers, seeded RNG and the central game-state object S.
// Every module imports S from here so cross-system state (cash, wanted level,
// entity lists, mode flags) lives in exactly one place and circular imports
// stay harmless: modules only touch each other inside functions, never at
// module-evaluation time.

export const TAU = Math.PI * 2;

export function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smooth(a, b, k, dt) { return lerp(a, b, 1 - Math.exp(-k * dt)); }
export function dist2(x1, z1, x2, z2) { const dx = x2 - x1, dz = z2 - z1; return dx * dx + dz * dz; }
export function dist(x1, z1, x2, z2) { return Math.sqrt(dist2(x1, z1, x2, z2)); }
export function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
export function angLerp(a, b, t) { return a + angDiff(a, b) * t; }
export function turnToward(cur, target, maxStep) {
  const d = angDiff(cur, target);
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}
export function headingVec(h) { return { x: Math.sin(h), z: Math.cos(h) }; }

// Seeded RNG (mulberry32) so ?seed=1 shot scenes are perfectly deterministic.
let _s = 123456789;
export function setSeed(seed) { _s = (seed >>> 0) || 1; }
export function rng() {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function rand(a, b) { return a + rng() * (b - a); }
export function randi(a, b) { return Math.floor(rand(a, b + 1)); }
export function pick(arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }
export function chance(p) { return rng() < p; }

export function el(id) { return document.getElementById(id); }
export function fmtCash(n) { return '$' + Math.floor(n).toLocaleString('en-US'); }
export function fmtClock(mins) {
  const m = ((Math.floor(mins) % 1440) + 1440) % 1440;
  const hh = Math.floor(m / 60), mm = m % 60;
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

// Central mutable game state. Scalars that several systems read/write live
// here; richer entity state lives in the owning module but entity *lists*
// are shared here so any system can iterate cars / peds / cops.
export const S = {
  mode: 'title',          // 'title' | 'play'
  paused: false,
  uiOpen: false,          // a shop / wheel / dialogue owns the input
  over: null,             // null | 'busted' | 'wasted'
  overT: 0,
  timeMin: 10 * 60 + 15,  // game clock, minutes since midnight
  day: 1,
  timeScale: 1,           // the self-test raises this so waits stay short
  cash: 250,
  wanted: 0,              // VBPD wanted level 0..5 (owned by police.js)
  lastSeen: { x: 0, z: 0 },
  seenNow: false,
  unseenT: 0,             // seconds since any unit last saw the player
  bust: 0,                // 0..1 bust meter (owned by police.js)
  inSafehouse: false,
  cars: [],               // every vehicle entity (traffic, parked, police, player-driven)
  peds: [],               // every pedestrian entity (civilians, guards, crew, drivers)
  cops: [],               // police units: {kind:'car'|'foot', car?, ped?, state}
  tracers: [],            // live tracer lines for combat.js
  pickups: [],            // ammo pickups for weapons.js
  wrecks: [],             // burnt-out vehicle wrecks from explosions.js
  playerCar: null,        // car the player is driving right now
  playerBoat: null,
  missionDone: 0,         // story missions completed (mirrors missions.js)
  onMissionComplete: null,// hook installed by main.js (save + toast)
  onSafehouse: null,      // hook installed by main.js
  shotMode: false,
  testMode: false,
  started: false,
  camYaw: Math.PI,        // third-person camera orbit
  camPitch: 0.32,
  camDist: 7,
  fpsEMA: 60,             // governor input, maintained by render.js
  quality: 0,             // governor level 0..3 (0 = full quality)
  particleMul: 1,         // governor output consumed by explosions.js
  muted: false,
};

// Segment vs AABB intersection in the XZ plane (used for line-of-sight).
export function segHitsBox(x1, z1, x2, z2, b) {
  // Liang-Barsky clip of the segment against the box.
  const dx = x2 - x1, dz = z2 - z1;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dz, dz];
  const q = [x1 - b.minX, b.maxX - x1, z1 - b.minZ, b.maxZ - z1];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) return false; }
    else {
      const r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return t0 <= t1;
}

// Point-in-AABB with a small shrink so standing right at a wall is not "in".
export function pointInBox(x, z, b, shrink) {
  const s = shrink || 0;
  return x > b.minX + s && x < b.maxX - s && z > b.minZ + s && z < b.maxZ - s;
}
