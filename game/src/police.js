// police.js — the Vista Bay Police Department. A 0-5 star wanted system
// fed by a witness-validated crime queue (quiet crimes need a witness with
// line of sight; loud ones carry), escalating dispatch of cruisers and
// interceptors, PIT units that aim for your rear quarter, roadblocks at
// four stars, foot officers who pile out when you run on foot, a search
// mode around your last seen position, a bust meter when you are cornered
// and slow, and star decay while you stay unseen — faster in the safehouse,
// slower once the helicopter (airunit.js) has eyes on you.

import { S, rng, rand, clamp, dist, angDiff } from './util.js';
import { randomRoadPoint, losBlocked, isWater } from './world.js';
import { createCar, stepCar, removeCar } from './vehicles.js';
import { spawnPed } from './pedestrians.js';
import { fireHitscan } from './combat.js';
import { setSiren, setAlarm } from './audio.js';
import { setAirActive } from './airunit.js';

const DISPATCH = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 5, 5: 6 };
let decayAcc = 0, roadblockT = 20, sirenTick = 0;

export function initPolice() {
  S.crimeQueue = [];
  S.wanted = 0; S.bust = 0; S.unseenT = 0; S.seenNow = false;
}
export function setWanted(n) {
  const w = clamp(Math.round(n), 0, 5);
  if (w > S.wanted) { S.unseenT = 0; decayAcc = 0; }
  S.wanted = w;
  if (w === 0) { S.bust = 0; }
}
export function reportCrime(level, x, z) {
  setWanted(Math.max(S.wanted, level));
  S.lastSeen = { x, z };
}
export function clearPolice() {
  for (const u of S.cops) {
    if (u.car) removeCar(u.car);
    if (u.ped) { u.ped.hp = 0; u.ped.down = true; const i = S.peds.indexOf(u.ped); if (i >= 0) S.peds.splice(i, 1); if (u.ped.group.parent) u.ped.group.parent.remove(u.ped.group); }
  }
  S.cops.length = 0;
  setWanted(0); S.bust = 0;
  setAirActive(false);
}

function spawnCopCar(scene, pit) {
  const pl = S.playerRef;
  let x = 0, z = 0, ok = false;
  for (let tries = 0; tries < 12 && !ok; tries++) {
    const p = randomRoadPoint();
    const d = dist(p.x, p.z, pl.x, pl.z);
    if (d > 62 && d < 120) { x = p.x; z = p.z; ok = true; }
  }
  if (!ok) { const p = randomRoadPoint(); x = p.x; z = p.z; }
  const cls = pit ? 'interceptor' : (S.wanted >= 4 && rng() < 0.4 ? 'interceptor' : 'cruiser');
  const car = createCar(cls, x, z, rand(0, 6.28), {});
  scene.add(car.group);
  const officer = spawnPed(x, z, { role: 'cop', inCar: car, controlledBy: 'police', hp: 120 });
  scene.add(officer.group);
  const unit = { kind: 'car', car, ped: officer, mode: 'drive', pit: !!pit, searchT: 0, shootCd: rand(0.5, 1.4), dead: false };
  car.copUnit = unit;
  S.cops.push(unit);
  return unit;
}
function spawnFootCop(scene, x, z, mode) {
  const ped = spawnPed(x, z, { role: 'cop', controlledBy: 'police', hp: 120, shooter: true });
  scene.add(ped.group);
  const unit = { kind: 'foot', ped, mode: mode || 'chase', shootCd: rand(0.4, 1.2), dead: false };
  S.cops.push(unit);
  return unit;
}

function spawnRoadblock(scene) {
  const pl = S.playerRef;
  if (!pl) return;
  const fx = Math.sin(pl.heading), fz = Math.cos(pl.heading);
  let bx = pl.x + fx * 58, bz = pl.z + fz * 58;
  if (isWater(bx, bz)) return;
  const perp = Math.atan2(fx, fz) + Math.PI / 2;
  for (const off of [-4.5, 4.5]) {
    const cx = bx + Math.sin(perp) * off, cz = bz + Math.cos(perp) * off;
    const car = createCar('cruiser', cx, cz, perp, {});
    car.parked = true;
    scene.add(car.group);
    const officer = spawnPed(cx, cz, { role: 'cop', inCar: car, controlledBy: 'police', hp: 120 });
    scene.add(officer.group);
    const unit = { kind: 'car', car, ped: officer, mode: 'block', dead: false, shootCd: rand(0.5, 1.3) };
    car.copUnit = unit;
    S.cops.push(unit);
    // the officers step out and take positions behind their cars
    officer.inCar = null; car.driver = null;
    officer.x = cx - fx * 3; officer.z = cz - fz * 3;
    officer.group.position.set(officer.x, 0, officer.z);
  }
  if (S.onToast) S.onToast('VBPD roadblock ahead!');
}

function processCrimeQueue() {
  if (!S.crimeQueue) return;
  for (const c of S.crimeQueue) {
    // a crime counts when someone saw it, or it was too loud to miss
    let witnessed = c.loud;
    if (!witnessed) {
      for (const ped of S.peds) {
        if (ped.down || ped.inCar || ped.role === 'cop') continue;
        if (dist(ped.x, ped.z, c.x, c.z) < 21 && !losBlocked(ped.x, ped.z, c.x, c.z)) { witnessed = true; break; }
      }
      if (!witnessed) for (const u of S.cops) {
        const e = u.car || u.ped;
        if (e && dist(e.x, e.z, c.x, c.z) < 34) { witnessed = true; break; }
      }
    }
    if (witnessed) {
      reportCrime(c.level, S.playerRef ? S.playerRef.x : c.x, S.playerRef ? S.playerRef.z : c.z);
    }
  }
  S.crimeQueue.length = 0;
}

function copSeesPlayer() {
  const pl = S.playerRef;
  if (!pl) return false;
  if (S.heliLit) return true;
  for (const u of S.cops) {
    const e = u.car || u.ped;
    if (!e || u.dead) continue;
    const d = dist(e.x, e.z, pl.x, pl.z);
    if (d < 68 && !losBlocked(e.x, e.z, pl.x, pl.z)) return true;
  }
  return false;
}

export function updatePolice(dt, scene) {
  const pl = S.playerRef;
  if (!pl) return;
  processCrimeQueue();
  // --- perception ---------------------------------------------------------
  S.seenNow = S.wanted > 0 && copSeesPlayer();
  if (S.seenNow) { S.lastSeen = { x: pl.x, z: pl.z }; S.unseenT = 0; decayAcc = 0; }
  else S.unseenT += dt;
  // --- decay ---------------------------------------------------------------
  if (S.wanted > 0 && S.unseenT > 7) {
    let interval = 9;
    if (S.inSafehouse) interval = 3;
    if (S.decayBonus) interval *= 0.75;
    decayAcc += dt;
    if (decayAcc >= interval) { decayAcc = 0; setWanted(S.wanted - 1); if (S.wanted === 0) clearPolice(); }
  }
  // --- dispatch ------------------------------------------------------------
  const wantCars = DISPATCH[S.wanted] || 0;
  const carUnits = S.cops.filter(u => u.kind === 'car' && u.mode !== 'block' && !u.dead);
  if (S.wanted > 0 && carUnits.length < wantCars) {
    const pit = S.wanted >= 3 && !carUnits.some(u => u.pit);
    spawnCopCar(scene, pit);
  }
  setAirActive(S.wanted >= 4);
  // roadblocks
  roadblockT -= dt;
  if (S.wanted >= 4 && roadblockT <= 0 && pl.inCar) {
    roadblockT = 38;
    if (S.cops.filter(u => u.mode === 'block').length < 2) spawnRoadblock(scene);
  }
  // --- unit behaviour ------------------------------------------------------
  let nearestCopD = 1e9, bustPressure = false;
  for (let i = S.cops.length - 1; i >= 0; i--) {
    const u = S.cops[i];
    const e = u.car || u.ped;
    if (!e) { S.cops.splice(i, 1); continue; }
    if (u.ped && u.ped.hp <= 0 && !u.dead) {
      u.dead = true;
      if (u.car) { u.car.copUnit = null; if (u.car.driver === u.ped) u.car.driver = null; }
      if (S.wanted >= 2 && S.crimeQueue) { /* killing an officer is already priced into dispatch */ }
    }
    const d = dist(e.x, e.z, pl.x, pl.z);
    nearestCopD = Math.min(nearestCopD, d);
    // despawn units hopelessly far behind when the heat is low
    if (d > 240 && S.wanted <= 2) {
      if (u.car) removeCar(u.car);
      if (u.ped) { u.ped.hp = 0; u.ped.down = true; const pi = S.peds.indexOf(u.ped); if (pi >= 0) S.peds.splice(pi, 1); if (u.ped.group.parent) u.ped.group.parent.remove(u.ped.group); }
      S.cops.splice(i, 1);
      continue;
    }
    if (u.dead) continue;
    if (u.kind === 'car' && u.mode === 'drive') driveCop(u, dt, pl);
    else if (u.kind === 'car' && u.mode === 'block') blockCopShoot(u, dt, pl);
    else if (u.kind === 'foot' || (u.kind === 'car' && u.mode === 'foot')) footCop(u, dt, pl);
    // bust pressure: a live unit close to a slow/cornered player
    const plSpeed = pl.inCar ? Math.abs(pl.inCar.speed) : (pl.speed || 0);
    if (d < 4.4 && plSpeed < 2.2 && !pl.inBoat) bustPressure = true;
  }
  if (bustPressure && S.wanted > 0) {
    S.bust += dt / 2.1;
    if (S.bust >= 1) { S.bust = 0; if (S.onPlayerDeath) S.onPlayerDeath('busted'); }
  } else S.bust = Math.max(0, S.bust - dt * 0.55);
  // audio: sirens by nearest unit, alarms from any jacked car still wailing
  sirenTick -= dt;
  if (sirenTick <= 0) {
    sirenTick = 0.15;
    setSiren(S.cops.length ? clamp(1 - nearestCopD / 95, 0, 1) : 0);
    setAlarm(S.cars.some(c => c.alarmT > 0));
  }
}

function driveCop(u, dt, pl) {
  const car = u.car;
  const target = S.seenNow ? { x: pl.x, z: pl.z } : S.lastSeen;
  let tx = target.x, tz = target.z;
  // PIT units aim at the player's rear quarter, not the bumper
  if (u.pit && pl.inCar && S.seenNow) {
    const back = 2.6;
    tx = pl.x - Math.sin(pl.heading) * back + Math.cos(pl.heading) * (u.pitSide || 1) * 1.1;
    tz = pl.z - Math.cos(pl.heading) * back - Math.sin(pl.heading) * (u.pitSide || 1) * 1.1;
    if (!u.pitSide) u.pitSide = rng() < 0.5 ? 1 : -1;
  }
  const d = dist(car.x, car.z, tx, tz);
  const desired = Math.atan2(tx - car.x, tz - car.z);
  let steer = clamp(angDiff(car.heading, desired) * 2.4, -1, 1);
  let throttle = 1;
  if (!S.seenNow) {
    // search: roll to the last seen point, then crawl and scan
    if (d < 7) {
      u.searchT += dt;
      throttle = 0.25;
      steer = clamp(angDiff(car.heading, car.heading + 0.6) * 2, -1, 1);
      if (u.searchT > 9) { u.searchT = 0; S.lastSeen = { x: car.x + rand(-30, 30), z: car.z + rand(-30, 30) }; }
    }
  }
  // if the player is on foot nearby, the officer gets out and gives chase
  if (!pl.inCar && !pl.inBoat && d < 8.5 && Math.abs(car.speed) < 4) {
    u.mode = 'foot';
    const ped = u.ped;
    ped.inCar = null; car.driver = null;
    ped.x = car.x + 1.6; ped.z = car.z;
    ped.group.position.set(ped.x, 0, ped.z);
    return;
  }
  if (isWater(tx, tz)) { throttle = d < 10 ? 0 : 0.7; } // they will not follow into the bay
  stepCar(car, dt, { throttle, steer, brake: false });
}

function blockCopShoot(u, dt, pl) {
  const ped = u.ped;
  if (!ped || ped.down) return;
  ped.heading = Math.atan2(pl.x - ped.x, pl.z - ped.z);
  ped.group.rotation.y = ped.heading;
  u.shootCd -= dt;
  const d = dist(ped.x, ped.z, pl.x, pl.z);
  if (u.shootCd <= 0 && d < 40 && S.wanted >= 3 && !losBlocked(ped.x, ped.z, pl.x, pl.z)) {
    u.shootCd = rand(0.8, 1.4);
    fireHitscan({ x: ped.x, y: 1.4, z: ped.z }, ped.heading, 0, { range: 42, damage: 5, owner: 'enemy', kind: 'pistol', accuracy: 0.42 });
  }
}

function footCop(u, dt, pl) {
  const ped = u.ped;
  if (!ped || ped.down) return;
  const d = dist(ped.x, ped.z, pl.x, pl.z);
  // if the suspect drives off, the officer sprints back to the car
  if (u.kind === 'car' && pl.inCar && d > 42 && u.car && !u.car.exploded) {
    ped.x = u.car.x + 1.2; ped.z = u.car.z;
    ped.inCar = u.car; u.car.driver = ped;
    ped.group.position.y = -3;
    u.mode = 'drive';
    return;
  }
  const target = S.seenNow ? pl : S.lastSeen;
  const td = dist(ped.x, ped.z, target.x, target.z);
  let mvx = 0, mvz = 0, spd = 0;
  if (td > 1.7) {
    mvx = (target.x - ped.x) / td; mvz = (target.z - ped.z) / td;
    spd = (S.wanted >= 3 && d < 15) ? 2.2 : 5.7;
    ped.heading = Math.atan2(mvx, mvz);
  }
  ped.x += mvx * spd * dt; ped.z += mvz * spd * dt;
  ped.animSpeed = spd;
  ped.group.position.set(ped.x, 0, ped.z);
  ped.group.rotation.y = ped.heading;
  // foot officers shoot runners at 3+ stars
  u.shootCd -= dt;
  if (u.shootCd <= 0 && S.wanted >= 3 && d < 34 && d > 6 && !losBlocked(ped.x, ped.z, pl.x, pl.z) && S.seenNow) {
    u.shootCd = rand(0.9, 1.5);
    fireHitscan({ x: ped.x, y: 1.4, z: ped.z }, Math.atan2(pl.x - ped.x, pl.z - ped.z), 0, { range: 36, damage: 5, owner: 'enemy', kind: 'pistol', accuracy: 0.4 });
  }
}
