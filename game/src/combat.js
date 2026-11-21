// combat.js — gunfire. Hitscan shots with visible tracers and muzzle
// flashes; a shot finds the best target along its ray (pedestrian, vehicle
// or the player), respects building line-of-sight, applies damage through
// each system's own path (ped hp, explosions.applyDamage for cars, the
// player damage hook), panics nearby civilians and reports gun crime to the
// police queue. Enemy shooters fire through the same code with an accuracy
// roll so firefights are dangerous but survivable.

import { S, rng, rand, clamp, dist } from './util.js';
import { losBlocked } from './world.js';
import { applyDamage } from './explosions.js';
import { shotSnd } from './audio.js';
import { pedFlee } from './pedestrians.js';

const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.9 });
const enemyTracerMat = new THREE.LineBasicMaterial({ color: 0xff9a7a, transparent: true, opacity: 0.9 });
const flashGeo = new THREE.SphereGeometry(0.16, 6, 5);
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffca6a, transparent: true, opacity: 0.95 });
const flashes = [];
let sceneRef = null;

export function initCombat(scene) {
  sceneRef = scene;
  for (let i = 0; i < 8; i++) {
    const f = new THREE.Mesh(flashGeo, flashMat.clone());
    f.visible = false; scene.add(f);
    flashes.push({ mesh: f, t: 0 });
  }
}

function addTracer(x1, y1, z1, x2, y2, z2, enemy) {
  if (!sceneRef) return;
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)]);
  const line = new THREE.Line(geo, enemy ? enemyTracerMat : tracerMat);
  sceneRef.add(line);
  S.tracers.push({ line, t: 0.09 });
}
function addFlash(x, y, z) {
  const f = flashes.find(f => f.t <= 0) || flashes[0];
  f.mesh.position.set(x, y, z);
  f.mesh.scale.setScalar(rand(0.8, 1.5));
  f.mesh.visible = true; f.t = 0.05;
}

// Fire one hitscan round. origin {x,y,z}; yaw/pitch in radians.
// opts: {range, damage, owner:'player'|'enemy', kind, accuracy, pellets}
export function fireHitscan(origin, yaw, pitch, opts) {
  const pellets = opts.pellets || 1;
  let anyHit = false;
  for (let p = 0; p < pellets; p++) {
    const spread = opts.spread || 0;
    const y2 = yaw + rand(-spread, spread), p2 = pitch + rand(-spread, spread) * 0.6;
    const dir = { x: Math.sin(y2) * Math.cos(p2), y: Math.sin(p2), z: Math.cos(y2) * Math.cos(p2) };
    const miss = opts.owner !== 'player' && rng() > (opts.accuracy !== undefined ? opts.accuracy : 0.55);
    let bestT = opts.range, bestEnt = null, bestKind = null;
    if (!miss) {
      // pedestrians
      for (const ped of S.peds) {
        if (ped.down || ped.inCar) continue;
        if (opts.owner === 'player' && ped.role === 'crew') continue;
        const tx = ped.x - origin.x, ty = 1.25 - origin.y, tz = ped.z - origin.z;
        const along = tx * dir.x + ty * dir.y + tz * dir.z;
        if (along < 0.5 || along > bestT) continue;
        const px = origin.x + dir.x * along, py = origin.y + dir.y * along, pz = origin.z + dir.z * along;
        const perp = Math.hypot(ped.x - px, 1.25 - py, ped.z - pz);
        if (perp < 0.85 && !losBlocked(origin.x, origin.z, ped.x, ped.z)) { bestT = along; bestEnt = ped; bestKind = 'ped'; }
      }
      // the player (enemy fire only)
      if (opts.owner !== 'player' && S.playerRef && !S.playerRef.inCar) {
        const pl = S.playerRef;
        const tx = pl.x - origin.x, ty = 1.25 - origin.y, tz = pl.z - origin.z;
        const along = tx * dir.x + ty * dir.y + tz * dir.z;
        if (along > 0.5 && along < bestT) {
          const px = origin.x + dir.x * along, py = origin.y + dir.y * along, pz = origin.z + dir.z * along;
          if (Math.hypot(pl.x - px, 1.25 - py, pl.z - pz) < 0.9 && !losBlocked(origin.x, origin.z, pl.x, pl.z)) { bestT = along; bestEnt = pl; bestKind = 'player'; }
        }
      }
      // vehicles (bigger targets, checked last so a ped in front still wins)
      for (const car of S.cars) {
        if (car.removeMe) continue;
        if (opts.owner !== 'player' && car === S.playerCar) { /* shooting the player's car is allowed */ }
        const tx = car.x - origin.x, ty = 0.8 - origin.y, tz = car.z - origin.z;
        const along = tx * dir.x + ty * dir.y + tz * dir.z;
        if (along < 1 || along > bestT + car.radius) continue;
        const px = origin.x + dir.x * along, pz = origin.z + dir.z * along;
        const perp = Math.hypot(car.x - px, car.z - pz);
        if (perp < car.radius + 0.5 && !losBlocked(origin.x, origin.z, car.x, car.z)) { bestT = Math.max(1, along); bestEnt = car; bestKind = 'car'; }
      }
    }
    const hx = origin.x + dir.x * bestT, hy = origin.y + dir.y * bestT, hz = origin.z + dir.z * bestT;
    addTracer(origin.x, origin.y, origin.z, hx, hy, hz, opts.owner !== 'player');
    if (bestEnt) {
      anyHit = true;
      if (bestKind === 'ped') {
        bestEnt.hp -= opts.damage;
        if (bestEnt.role === 'civ' || bestEnt.role === 'driver') pedFlee(bestEnt, origin.x, origin.z, 4);
      } else if (bestKind === 'player') {
        if (S.onPlayerDamage) S.onPlayerDamage(opts.damage, 'bullet');
      } else if (bestKind === 'car') {
        applyDamage(bestEnt, opts.damage * 0.55, 'bullet');
        if (bestEnt.driver && bestEnt.driver !== 'player') pedFlee(bestEnt.driver, origin.x, origin.z, 3);
      }
    }
  }
  addFlash(origin.x, origin.y, origin.z);
  shotSnd(opts.kind);
  // gunfire panics civilians and is a reportable crime when the player fires
  for (const ped of S.peds) {
    if (ped.down || ped.inCar || ped.controlledBy) continue;
    if (dist(ped.x, ped.z, origin.x, origin.z) < 17) pedFlee(ped, origin.x, origin.z, 3);
  }
  if (opts.owner === 'player' && S.crimeQueue) S.crimeQueue.push({ level: anyHit ? 3 : 2, x: origin.x, z: origin.z });
  return anyHit;
}

// Fists: a short swing in front of the attacker.
export function meleeSwing(x, z, heading, owner) {
  const fx = x + Math.sin(heading) * 1.5, fz = z + Math.cos(heading) * 1.5;
  shotSnd('fists');
  for (const ped of S.peds) {
    if (ped.down || ped.inCar) continue;
    if (dist(ped.x, ped.z, fx, fz) < 1.1) { ped.hp -= 13; pedFlee(ped, x, z, 2.5); return true; }
  }
  if (owner !== 'player' && S.playerRef && dist(S.playerRef.x, S.playerRef.z, fx, fz) < 1.1) {
    if (S.onPlayerDamage) S.onPlayerDamage(5, 'fists');
    return true;
  }
  for (const car of S.cars) {
    if (dist(car.x, car.z, fx, fz) < car.radius + 0.6) { applyDamage(car, 3, 'melee'); return true; }
  }
  return false;
}

export function updateCombat(dt) {
  for (let i = S.tracers.length - 1; i >= 0; i--) {
    const t = S.tracers[i];
    t.t -= dt;
    if (t.t <= 0) {
      if (t.line.parent) t.line.parent.remove(t.line);
      t.line.geometry.dispose();
      S.tracers.splice(i, 1);
    }
  }
  for (const f of flashes) {
    if (f.t > 0) { f.t -= dt; if (f.t <= 0) f.mesh.visible = false; }
  }
}
