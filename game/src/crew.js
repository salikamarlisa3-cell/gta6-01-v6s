// crew.js — your people. Rico Tanaka (key 6) is the backup driver: he rolls
// up in a fast car, falls in behind you and spends his minute ramming
// whoever is chasing you. Zara Lindqvist (key 7) is the shooter: she takes
// position at your shoulder and engages police and mission guards with a
// pistol until her time runs out. Both run on cooldowns, and respect rank
// upgrades them — longer tours, and Rico graduates to an Interceptor-class
// ride at Shot Caller.

import { S, clamp, dist, angDiff, rand } from './util.js';
import { randomRoadPoint, losBlocked } from './world.js';
import { createCar, stepCar, removeCar } from './vehicles.js';
import { spawnPed } from './pedestrians.js';
import { fireHitscan } from './combat.js';
import { rankIdx } from './progression.js';

export const CREW = {
  rico: { cd: 0, activeT: 0, ped: null, car: null, name: 'Rico (driver)' },
  zara: { cd: 0, activeT: 0, ped: null, shootCd: 0, name: 'Zara (shooter)' },
};
const COOLDOWN = 75;

export function callCrew(who) {
  const pl = S.playerRef;
  if (!pl || S.over) return;
  const c = CREW[who];
  if (c.activeT > 0) { if (S.onToast) S.onToast(c.name + ' is already out'); return; }
  if (c.cd > 0) { if (S.onToast) S.onToast(c.name + ' — back in ' + Math.ceil(c.cd) + 's'); return; }
  const durMul = rankIdx() >= 3 ? 1.5 : 1;
  if (who === 'rico') {
    const p = randomRoadPoint();
    const cls = rankIdx() >= 4 ? 'interceptor' : 'vyper';
    const car = createCar(cls, p.x, p.z, 0, { color: 0x0f7a72 });
    if (S.sceneRef) S.sceneRef.add(car.group);
    const ped = spawnPed(p.x, p.z, { role: 'crew', inCar: car, controlledBy: 'crew', hp: 400, name: 'Rico' });
    if (S.sceneRef) S.sceneRef.add(ped.group);
    c.car = car; c.ped = ped; c.activeT = 60 * durMul;
    if (S.onToast) S.onToast('Rico is rolling — escort inbound');
  } else {
    const ped = spawnPed(pl.x + 2.5, pl.z + 1, { role: 'crew', controlledBy: 'crew', hp: 400, shooter: true, name: 'Zara' });
    if (S.sceneRef) S.sceneRef.add(ped.group);
    c.ped = ped; c.activeT = 45 * durMul; c.shootCd = 0.5;
    if (S.onToast) S.onToast('Zara has your back');
  }
}

function dismiss(who) {
  const c = CREW[who];
  if (c.car) { removeCar(c.car); c.car = null; }
  if (c.ped) {
    const i = S.peds.indexOf(c.ped);
    if (i >= 0) S.peds.splice(i, 1);
    if (c.ped.group.parent) c.ped.group.parent.remove(c.ped.group);
    c.ped = null;
  }
  c.cd = COOLDOWN;
}

export function updateCrew(dt) {
  const pl = S.playerRef;
  if (!pl) return;
  for (const who of ['rico', 'zara']) {
    const c = CREW[who];
    if (c.cd > 0) c.cd -= dt;
    if (c.activeT <= 0) continue;
    c.activeT -= dt;
    if (c.activeT <= 0 || (c.ped && c.ped.hp <= 0)) { dismiss(who); continue; }
    if (who === 'rico' && c.car) {
      const car = c.car;
      // escort: chase the player; if police are closer, chase them instead
      let tx = pl.x - Math.sin(pl.heading) * 7, tz = pl.z - Math.cos(pl.heading) * 7;
      let nearestCop = null, nd = 26;
      for (const u of S.cops) {
        const e = u.car || u.ped;
        if (e && !u.dead) { const d = dist(car.x, car.z, e.x, e.z); if (d < nd) { nd = d; nearestCop = e; } }
      }
      if (nearestCop) { tx = nearestCop.x; tz = nearestCop.z; }
      const d = dist(car.x, car.z, tx, tz);
      const desired = Math.atan2(tx - car.x, tz - car.z);
      const steer = clamp(angDiff(car.heading, desired) * 2.4, -1, 1);
      stepCar(car, dt, { throttle: d > 6 ? 1 : 0.3, steer, brake: d < 3.5 });
      if (c.ped) { c.ped.x = car.x; c.ped.z = car.z; }
    }
    if (who === 'zara' && c.ped) {
      const ped = c.ped;
      const d = dist(ped.x, ped.z, pl.x, pl.z);
      if (d > 3) {
        const spd = d > 30 ? 9.5 : 5.6;
        ped.heading = Math.atan2(pl.x - ped.x, pl.z - ped.z);
        ped.x += Math.sin(ped.heading) * spd * dt;
        ped.z += Math.cos(ped.heading) * spd * dt;
        ped.animSpeed = spd;
      } else ped.animSpeed = 0;
      ped.group.position.set(ped.x, 0, ped.z);
      ped.group.rotation.y = ped.heading;
      // engage the nearest hostile
      c.shootCd -= dt;
      if (c.shootCd <= 0) {
        let target = null, td = 36;
        for (const u of S.cops) {
          const e = u.ped && !u.ped.down ? u.ped : null;
          if (e) { const dd = dist(ped.x, ped.z, e.x, e.z); if (dd < td) { td = dd; target = { x: e.x, z: e.z, ped: e }; } }
        }
        for (const p of S.peds) {
          if (p.role === 'guard' && !p.down && p.hp > 0) { const dd = dist(ped.x, ped.z, p.x, p.z); if (dd < td) { td = dd; target = { x: p.x, z: p.z, ped: p }; } }
        }
        if (target && !losBlocked(ped.x, ped.z, target.x, target.z)) {
          c.shootCd = 0.85;
          ped.heading = Math.atan2(target.x - ped.x, target.z - ped.z);
          fireHitscan({ x: ped.x, y: 1.4, z: ped.z }, ped.heading, 0, { range: 38, damage: 13, owner: 'player', kind: 'pistol', accuracy: 1 });
        } else c.shootCd = 0.3;
      }
    }
  }
}
