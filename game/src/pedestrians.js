// pedestrians.js — the people of Solara Bay. Low-poly walkers who stroll the
// sidewalks, sit in traffic cars as drivers, stand guard on missions, and
// react like people: they flee fast cars, gunfire and explosions, get run
// down by careless driving, and (when carjacked) are dragged out of their
// cars. Movement for police/crew peds is owned by their own modules via the
// controlledBy flag; this module handles everyone else plus health/death.

import { S, rng, rand, pick, clamp, dist, angDiff, turnToward } from './util.js';
import { randomSidewalkPoint, collideCircle, isWater } from './world.js';

const SHIRTS = [0xd95f4b, 0x4b7fd9, 0x53b06a, 0xe3c04f, 0xd6d6d6, 0x8a5fc0, 0x3fb0ac, 0xd94b9e, 0xf0f0f0, 0x365a8a];
const SKINS = [0xf2c89b, 0xd9a066, 0xa06a35, 0x6e4520, 0xffe0bd];
const PANTS = [0x2c3440, 0x4a3b2c, 0x596068, 0x243028, 0x503a4a];
const legGeo = new THREE.BoxGeometry(0.21, 0.78, 0.24);
const torsoGeo = new THREE.BoxGeometry(0.56, 0.72, 0.3);
const headGeo = new THREE.BoxGeometry(0.34, 0.38, 0.34);
const shirtMats = SHIRTS.map(c => new THREE.MeshLambertMaterial({ color: c }));
const skinMats = SKINS.map(c => new THREE.MeshLambertMaterial({ color: c }));
const pantMats = PANTS.map(c => new THREE.MeshLambertMaterial({ color: c }));
const copMat = new THREE.MeshLambertMaterial({ color: 0x1d3350 });
const guardMat = new THREE.MeshLambertMaterial({ color: 0x40202a });
let _pid = 1;

export function spawnPed(x, z, opts) {
  opts = opts || {};
  const g = new THREE.Group();
  const role = opts.role || 'civ';
  const shirt = role === 'cop' ? copMat : role === 'guard' ? guardMat : pick(shirtMats);
  const legL = new THREE.Mesh(legGeo, pick(pantMats)); legL.position.set(-0.14, 0.39, 0);
  const legR = new THREE.Mesh(legGeo, legL.material); legR.position.set(0.14, 0.39, 0);
  const torso = new THREE.Mesh(torsoGeo, shirt); torso.position.y = 1.14; torso.castShadow = true;
  const head = new THREE.Mesh(headGeo, pick(skinMats)); head.position.y = 1.72;
  // pivot legs at the hip so the walk swing looks right
  legL.geometry = legGeo;
  g.add(legL); g.add(legR); g.add(torso); g.add(head);
  g.position.set(x, 0, z);
  const ped = {
    id: _pid++, group: g, legL, legR, torso, head,
    x, z, heading: rand(0, Math.PI * 2), speed: 0,
    hp: opts.hp || 100, maxHp: opts.hp || 100,
    role, inCar: opts.inCar || null,
    state: 'walk', target: randomSidewalkPoint(),
    fleeFrom: null, fleeT: 0, down: false, downT: 0,
    shooter: !!opts.shooter, shootCd: rand(0.5, 1.5),
    controlledBy: opts.controlledBy || null,
    animSpeed: 0, phase: rand(0, 6), name: opts.name || null,
    fightT: 0, alarmRaised: false,
  };
  if (ped.inCar) { ped.inCar.driver = ped; }
  S.peds.push(ped);
  return ped;
}

export function initPeds(scene, n) {
  for (let i = 0; i < n; i++) {
    const p = randomSidewalkPoint();
    const ped = spawnPed(p.x, p.z, {});
    scene.add(ped.group);
  }
}

export function pedFlee(ped, fromX, fromZ, dur) {
  if (ped.down || ped.inCar || ped.controlledBy) return;
  ped.fleeFrom = { x: fromX, z: fromZ };
  ped.fleeT = Math.max(ped.fleeT, dur || 3.5);
  ped.state = 'flee';
}

export function updatePeds(dt) {
  for (const ped of S.peds) {
    if (ped.down) {
      ped.downT += dt;
      ped.group.rotation.x = Math.min(Math.PI / 2, ped.group.rotation.x + dt * 5);
      ped.group.position.y = 0.12;
      continue;
    }
    if (ped.hp <= 0) { ped.down = true; ped.state = 'down'; if (ped.inCar) { ped.inCar.driver = null; ped.inCar = null; } continue; }
    if (ped.inCar) {
      // riding: glued to the car; an explosion or wreck ejects the driver
      ped.x = ped.inCar.x; ped.z = ped.inCar.z; ped.heading = ped.inCar.heading;
      ped.group.position.set(ped.x, -3, ped.z); // hidden inside/under the car body
      if (ped.inCar.exploded || ped.inCar.health <= 0) {
        ped.inCar = null; ped.hp -= 15;
        ped.group.position.y = 0;
        pedFlee(ped, ped.x, ped.z, 4);
      }
      continue;
    }
    if (ped.controlledBy) { syncVisual(ped, dt); continue; }

    let moveX = 0, moveZ = 0, wantSpeed = 0;
    if (ped.fleeT > 0 && ped.fleeFrom) {
      ped.fleeT -= dt;
      const dx = ped.x - ped.fleeFrom.x, dz = ped.z - ped.fleeFrom.z;
      const d = Math.hypot(dx, dz) || 1;
      moveX = dx / d; moveZ = dz / d; wantSpeed = 6.4;
      if (ped.fleeT <= 0) { ped.state = 'walk'; ped.target = randomSidewalkPoint(); }
    } else if (ped.state === 'fight') {
      // a carjacked driver who chose violence: chase the player and swing
      const pl = S.playerRef;
      if (pl) {
        const d = dist(ped.x, ped.z, pl.x, pl.z);
        if (d > 1.4) { moveX = (pl.x - ped.x) / d; moveZ = (pl.z - ped.z) / d; wantSpeed = 5.2; }
        else {
          ped.fightT -= dt;
          if (ped.fightT <= 0) { ped.fightT = 0.9; if (S.onPlayerDamage) S.onPlayerDamage(4, 'fists'); }
        }
        ped.fightLife = (ped.fightLife || 6) - dt;
        if (ped.fightLife <= 0) { ped.state = 'walk'; ped.target = randomSidewalkPoint(); }
      }
    } else {
      const t = ped.target;
      const d = dist(ped.x, ped.z, t.x, t.z);
      if (d < 1.6) ped.target = randomSidewalkPoint();
      else { moveX = (t.x - ped.x) / d; moveZ = (t.z - ped.z) / d; wantSpeed = 1.55; }
    }
    if (wantSpeed > 0) {
      const targetHeading = Math.atan2(moveX, moveZ);
      ped.heading = turnToward(ped.heading, targetHeading, 6 * dt);
      ped.speed = wantSpeed;
      ped.x += Math.sin(ped.heading) * ped.speed * dt;
      ped.z += Math.cos(ped.heading) * ped.speed * dt;
      const fixed = collideCircle(ped.x, ped.z, 0.45);
      ped.x = fixed.x; ped.z = fixed.z;
      if (isWater(ped.x, ped.z)) { ped.x -= Math.sin(ped.heading) * ped.speed * dt * 1.4; ped.z -= Math.cos(ped.heading) * ped.speed * dt * 1.4; ped.target = randomSidewalkPoint(); }
    } else ped.speed = 0;
    ped.animSpeed = ped.speed;
    syncVisual(ped, dt);

    // run over by a moving car?
    if (ped.role === 'civ' || ped.role === 'driver') {
      for (const car of S.cars) {
        if (car.removeMe || Math.abs(car.speed) < 7) continue;
        if (dist(ped.x, ped.z, car.x, car.z) < car.radius + 0.45) {
          ped.hp = 0; ped.down = true; ped.state = 'down';
          if (car.driver === 'player' && S.crimeQueue) S.crimeQueue.push({ level: 2, x: ped.x, z: ped.z });
          break;
        }
      }
    }
    // panic near fast traffic
    if (ped.state === 'walk') {
      for (const car of S.cars) {
        if (Math.abs(car.speed) > 16 && dist(ped.x, ped.z, car.x, car.z) < 5) { pedFlee(ped, car.x, car.z, 2.2); break; }
      }
    }
  }
}

function syncVisual(ped, dt) {
  ped.group.position.set(ped.x, 0, ped.z);
  ped.group.rotation.y = ped.heading;
  ped.phase += dt * (2 + ped.animSpeed * 2.4);
  const sw = clamp(ped.animSpeed / 4, 0, 1) * 0.55;
  ped.legL.rotation.x = Math.sin(ped.phase) * sw;
  ped.legR.rotation.x = -Math.sin(ped.phase) * sw;
  ped.torso.position.y = 1.14 + Math.abs(Math.sin(ped.phase)) * 0.03 * (sw > 0 ? 1 : 0);
}

export function alivePeds() { return S.peds.filter(p => !p.down).length; }
