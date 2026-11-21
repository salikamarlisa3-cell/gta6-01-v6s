// explosions.js — vehicle damage and everything that burns. Cars smoke when
// hurt, catch fire when critical, and explode at zero health: a radial blast
// that damages nearby cars (chain reactions), pedestrians and the player,
// leaves a scorched, burning wreck in the world, and reports itself to the
// police crime queue. One shared particle pool serves smoke, fire, sparks
// and explosion bursts, scaled by the quality governor (S.particleMul).

import { S, clamp, dist, rand } from './util.js';
import { boomSnd } from './audio.js';

const MAXP = 1000;
const pool = {
  pts: null, pos: null, col: null, data: [], cursor: 0, light: null, lightT: 0,
};
const pending = [];   // {car, t} explosions scheduled a beat out (chains)

export function initExplosions(scene) {
  const geo = new THREE.BufferGeometry();
  pool.pos = new Float32Array(MAXP * 3);
  pool.col = new Float32Array(MAXP * 3);
  for (let i = 0; i < MAXP; i++) {
    pool.data.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, grav: 0, r: 1, g: 1, b: 1, fade: 1 });
    pool.pos[i * 3 + 1] = -100;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pool.pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(pool.col, 3));
  const mat = new THREE.PointsMaterial({ size: 1.5, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
  pool.pts = new THREE.Points(geo, mat);
  pool.pts.frustumCulled = false;
  scene.add(pool.pts);
  pool.light = new THREE.PointLight(0xff7733, 0, 26);
  pool.light.position.y = 3;
  scene.add(pool.light);
}

function spawnP(x, y, z, vx, vy, vz, life, r, g, b, grav) {
  const i = pool.cursor; pool.cursor = (pool.cursor + 1) % MAXP;
  const d = pool.data[i];
  d.life = life; d.max = life; d.vx = vx; d.vy = vy; d.vz = vz; d.grav = grav || 0;
  d.r = r; d.g = g; d.b = b;
  pool.pos[i * 3] = x; pool.pos[i * 3 + 1] = y; pool.pos[i * 3 + 2] = z;
}
export function burst(x, y, z, n, kind) {
  n = Math.round(n * S.particleMul);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = rand(1, kind === 'boom' ? 9 : 4);
    if (kind === 'boom') spawnP(x, y, z, Math.cos(a) * sp, rand(2, 8), Math.sin(a) * sp, rand(0.4, 1.1), 1, rand(0.3, 0.6), 0.1, -4);
    else if (kind === 'fire') spawnP(x + rand(-0.5, 0.5), y, z + rand(-0.5, 0.5), rand(-0.3, 0.3), rand(1.6, 3.2), rand(-0.3, 0.3), rand(0.3, 0.7), 1, rand(0.35, 0.6), 0.08, 2.5);
    else if (kind === 'smoke') spawnP(x + rand(-0.4, 0.4), y, z + rand(-0.4, 0.4), rand(-0.2, 0.2), rand(0.9, 1.7), rand(-0.2, 0.2), rand(0.9, 1.8), 0.16, 0.16, 0.16, 1.2);
    else if (kind === 'spark') spawnP(x, y, z, Math.cos(a) * sp, rand(1, 4), Math.sin(a) * sp, rand(0.15, 0.4), 1, 0.8, 0.3, -9);
    else if (kind === 'splash') spawnP(x, y, z, Math.cos(a) * sp * 0.5, rand(1.5, 3.5), Math.sin(a) * sp * 0.5, rand(0.3, 0.6), 0.5, 0.75, 0.9, -7);
  }
}

function crime(level, x, z) { if (S.crimeQueue) S.crimeQueue.push({ level, x, z }); }

// The single entry point for hurting a vehicle (crashes, gunfire, blasts).
export function applyDamage(car, dmg, cause) {
  if (!car || car.exploded || car.dead) return;
  if (cause === 'crash') dmg *= 1 - car.upgrades.plate * 0.18;
  car.health -= dmg;
  if (car.health < 62 && car.dmgState === 0) car.dmgState = 1;          // smoking
  if (car.health < 30 && car.dmgState === 1) { car.dmgState = 2; car.burning = true; } // on fire
  if (car.health <= 0) {
    car.health = 0;
    pending.push({ car, t: cause === 'explosion' ? 0.28 : 0.12 });
  }
}

function explode(car) {
  if (car.exploded) return;
  car.exploded = true; car.burning = true; car.fireT = 0; car.speed = 0;
  car.bodyMat.color.setHex(0x17181c);
  car.group.position.y = 0.02;
  if (car.driver && car.driver !== 'player') { car.driver.hp -= 60; car.driver = null; }
  S.wrecks.push(car);
  burst(car.x, 1.2, car.z, 46, 'boom');
  burst(car.x, 1, car.z, 22, 'fire');
  boomSnd();
  pool.light.position.set(car.x, 3, car.z);
  pool.light.intensity = 3.2; pool.lightT = 0.5;
  crime(3, car.x, car.z);
  // radial damage — this is what makes chain reactions happen
  for (const other of S.cars) {
    if (other === car || other.exploded) continue;
    const d = dist(car.x, car.z, other.x, other.z);
    if (d < 9.5) applyDamage(other, 62 * (1 - d / 11), 'explosion');
  }
  for (const ped of S.peds) {
    if (ped.inCar || ped.down) continue;
    const d = dist(car.x, car.z, ped.x, ped.z);
    if (d < 8) { ped.hp -= 48 * (1 - d / 9); ped.fleeFrom = { x: car.x, z: car.z }; ped.fleeT = 4; }
  }
  if (S.playerRef) {
    const d = dist(car.x, car.z, S.playerRef.x, S.playerRef.z);
    if (d < 8.5 && S.onPlayerDamage) S.onPlayerDamage(40 * (1 - d / 9.5), 'explosion');
  }
}

export function updateExplosions(dt) {
  // scheduled explosions (chain delay)
  for (let i = pending.length - 1; i >= 0; i--) {
    pending[i].t -= dt;
    if (pending[i].t <= 0) { explode(pending[i].car); pending.splice(i, 1); }
  }
  for (const car of S.cars) {
    if (car.removeMe) continue;
    if (car.dmgState === 1 && !car.exploded) {
      car.smokeAcc += dt;
      if (car.smokeAcc > 0.14) { car.smokeAcc = 0; burst(car.x, car.cls.h * 0.8, car.z, 1, 'smoke'); }
    }
    if (car.burning && !car.exploded) {
      car.fireT += dt;
      car.health -= dt * 3.5;                       // fire finishes the job
      if (car.health <= 0) { car.health = 0; pending.push({ car, t: 0.1 }); }
      if (Math.random() < dt * 22 * S.particleMul) burst(car.x, car.cls.h * 0.7, car.z, 2, 'fire');
      // fire spreads to a car parked/trucked right beside it
      for (const other of S.cars) {
        if (other === car || other.exploded) continue;
        if (dist(car.x, car.z, other.x, other.z) < 3.6) applyDamage(other, dt * 7, 'fire');
      }
      if (S.playerRef && dist(car.x, car.z, S.playerRef.x, S.playerRef.z) < 3 && S.onPlayerDamage)
        S.onPlayerDamage(dt * 6, 'fire');
    }
    if (car.exploded) {
      car.fireT += dt;
      if (car.fireT < 16 && Math.random() < dt * 16 * S.particleMul) burst(car.x, 1, car.z, 2, 'fire');
      else if (car.fireT < 40 && Math.random() < dt * 6) burst(car.x, 1.2, car.z, 1, 'smoke');
    }
  }
  // wreck cleanup: keep at most 14, remove the oldest beyond that
  while (S.wrecks.length > 14) {
    const old = S.wrecks.shift();
    if (old !== S.playerCar) { old.dead = true; if (old.group.parent) old.group.parent.remove(old.group); const i = S.cars.indexOf(old); if (i >= 0) S.cars.splice(i, 1); }
  }
  // explosion light decay
  if (pool.lightT > 0) { pool.lightT -= dt; pool.light.intensity = Math.max(0, pool.lightT * 6.4); }
  // particle simulation
  if (pool.pts) {
    for (let i = 0; i < MAXP; i++) {
      const d = pool.data[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { pool.pos[i * 3 + 1] = -100; continue; }
      d.vy += (d.grav || 0) * dt;
      pool.pos[i * 3] += d.vx * dt;
      pool.pos[i * 3 + 1] += d.vy * dt;
      pool.pos[i * 3 + 2] += d.vz * dt;
      const f = d.life / d.max;
      pool.col[i * 3] = d.r * f; pool.col[i * 3 + 1] = d.g * f; pool.col[i * 3 + 2] = d.b * f;
    }
    pool.pts.geometry.attributes.position.needsUpdate = true;
    pool.pts.geometry.attributes.color.needsUpdate = true;
  }
}
