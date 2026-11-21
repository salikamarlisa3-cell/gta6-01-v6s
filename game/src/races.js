// races.js — the repeatable money: three activities that stay live all game.
// The Palmera Grand Prix is an 8-checkpoint street race against your own
// best time; cab work from the Marina stand pays by distance with a tip for
// keeping the paint clean; and the VBPD's vigilante bounty (start it in a
// police car at HQ) pays for disabling a fleeing criminal's car. Activities
// run one at a time and yield the objective line while they are active.

import { S, rand, dist, clamp } from './util.js';
import { POIS, randomSidewalkPoint } from './world.js';
import { createCar, stepCar } from './vehicles.js';
import { spawnPed } from './pedestrians.js';
import { addRespect } from './progression.js';
import { cashSnd } from './audio.js';

export const ACT = { kind: null, step: 0, t: 0, pts: [], targetCar: null, passenger: null, startHealth: 100, beam: null, ring: null };
const STARTS = [
  { kind: 'race', x: POIS.raceStart.x, z: POIS.raceStart.z, label: 'Street Race — Palmera Grand Prix' },
  { kind: 'taxi', x: POIS.cabStand.x, z: POIS.cabStand.z, label: 'Cab Work — Marina Cab Stand' },
  { kind: 'vigilante', x: 182, z: -156, label: 'Vigilante Bounty — needs a police car' },
];
const RACE_PTS = [
  [64, -124], [150, -60], [124, 40], [30, 124], [-70, 150], [-150, 60], [-124, -50], [-40, -130],
];

export function initRaces(scene) {
  const beamGeo = new THREE.CylinderGeometry(1, 1, 24, 10, 1, true);
  ACT.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x3fd9ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  ACT.beam.position.y = 12; ACT.beam.visible = false;
  scene.add(ACT.beam);
  const ringGeo = new THREE.RingGeometry(1.5, 2.1, 24); ringGeo.rotateX(-Math.PI / 2);
  ACT.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x3fd9ff, transparent: true, opacity: 0.8 }));
  ACT.ring.position.y = 0.12; ACT.ring.visible = false;
  scene.add(ACT.ring);
  // permanent start rings
  for (const s of STARTS) {
    const r = new THREE.Mesh(ringGeo.clone(), new THREE.MeshBasicMaterial({ color: 0x3fd9ff, transparent: true, opacity: 0.45 }));
    r.position.set(s.x, 0.12, s.z);
    scene.add(r);
  }
}
function showBeam(x, z) {
  ACT.beam.visible = true; ACT.ring.visible = true;
  ACT.beam.position.x = x; ACT.beam.position.z = z;
  ACT.ring.position.x = x; ACT.ring.position.z = z;
}
function hideBeam() { ACT.beam.visible = false; ACT.ring.visible = false; }

export function startActivity(kind) {
  const pl = S.playerRef;
  if (kind === 'race') {
    ACT.kind = 'race'; ACT.step = 0; ACT.t = 0; ACT.pts = RACE_PTS;
    S.objective = { x: RACE_PTS[0][0], z: RACE_PTS[0][1], text: 'Grand Prix — checkpoint 1/8' };
    showBeam(RACE_PTS[0][0], RACE_PTS[0][1]);
    if (S.onToast) S.onToast('GRAND PRIX — 8 checkpoints. Beat ' + (S.raceBest ? S.raceBest.toFixed(1) + 's' : 'the clock'));
  } else if (kind === 'taxi') {
    const p = randomSidewalkPoint();
    ACT.kind = 'taxi'; ACT.step = 0; ACT.t = 0;
    ACT.passenger = spawnPed(p.x, p.z, { role: 'civ', controlledBy: 'activity' });
    if (S.sceneRef) S.sceneRef.add(ACT.passenger.group);
    ACT.pts = [[p.x, p.z]];
    S.objective = { x: p.x, z: p.z, text: 'Cab — pick up the passenger' };
    showBeam(p.x, p.z);
    if (S.onToast) S.onToast('CAB WORK — pick up the passenger (bring a car)');
  } else if (kind === 'vigilante') {
    if (!pl.inCar || !pl.inCar.isCop) { if (S.onToast) S.onToast('Vigilante bounty needs a police car'); return; }
    const a = rand(0, Math.PI * 2);
    const cx = pl.x + Math.sin(a) * 130, cz = pl.z + Math.cos(a) * 130;
    const car = createCar('bandit', clamp(cx, -250, 250), clamp(cz, -250, 250), rand(0, 6.28), { color: 0x30303a });
    if (S.sceneRef) S.sceneRef.add(car.group);
    const driver = spawnPed(car.x, car.z, { role: 'driver', inCar: car });
    if (S.sceneRef) S.sceneRef.add(driver.group);
    ACT.kind = 'vigilante'; ACT.targetCar = car; ACT.t = 0;
    S.objective = { x: car.x, z: car.z, text: 'Vigilante — disable the fleeing Bandit' };
    showBeam(car.x, car.z);
    if (S.onToast) S.onToast('VIGILANTE — disable the Bandit (wreck it or kill the driver)');
  }
}
function endActivity(pay, respect, msg) {
  if (pay) { S.cash += pay; cashSnd(); }
  if (respect) addRespect(respect, null);
  if (S.onToast) S.onToast(msg);
  if (ACT.passenger) {
    const i = S.peds.indexOf(ACT.passenger);
    if (i >= 0) S.peds.splice(i, 1);
    if (ACT.passenger.group.parent) ACT.passenger.group.parent.remove(ACT.passenger.group);
    ACT.passenger = null;
  }
  ACT.kind = null; ACT.targetCar = null;
  hideBeam();
  S.objective = null; // missions.js re-asserts its own objective next frame
  if (S.onMissionComplete) S.onMissionComplete(); // reuse the save hook
}

export function updateRaces(dt) {
  const pl = S.playerRef;
  if (!pl) return;
  if (ACT.ring) ACT.ring.rotation.y += dt;
  if (!ACT.kind) {
    // standing in a start ring (and not mid-mission) begins the activity
    if (S.missionActive || S.uiOpen || S.over) return;
    for (const s of STARTS) {
      const inRing = dist(pl.x, pl.z, s.x, s.z) < 2.6;
      const ready = s.kind === 'vigilante' ? (pl.inCar && pl.inCar.isCop) : !pl.inBoat;
      if (inRing && ready && !pl.inBoat) { startActivity(s.kind); return; }
    }
    return;
  }
  ACT.t += dt;
  if (ACT.kind === 'race') {
    const [cx, cz] = ACT.pts[ACT.step];
    if (pl.inCar && dist(pl.x, pl.z, cx, cz) < 8) {
      ACT.step++;
      if (ACT.step >= ACT.pts.length) {
        const t = ACT.t;
        const pay = Math.max(200, Math.round(750 - t * 1.6));
        const best = !S.raceBest || t < S.raceBest;
        if (best) S.raceBest = t;
        endActivity(pay, 15, 'GRAND PRIX FINISH — ' + t.toFixed(1) + 's · +$' + pay + (best ? ' · NEW BEST!' : ''));
        return;
      }
      showBeam(ACT.pts[ACT.step][0], ACT.pts[ACT.step][1]);
      S.objective = { x: ACT.pts[ACT.step][0], z: ACT.pts[ACT.step][1], text: 'Grand Prix — checkpoint ' + (ACT.step + 1) + '/8 · ' + ACT.t.toFixed(0) + 's' };
    }
    if (ACT.t > 300) endActivity(0, 0, 'Grand Prix abandoned');
  } else if (ACT.kind === 'taxi') {
    if (ACT.step === 0) {
      const [px, pz] = ACT.pts[0];
      if (pl.inCar && dist(pl.x, pl.z, px, pz) < 6 && Math.abs(pl.inCar.speed) < 1.5) {
        ACT.step = 1;
        ACT.startHealth = pl.inCar.health;
        const d = randomSidewalkPoint();
        ACT.pts[1] = [d.x, d.z];
        if (ACT.passenger) { ACT.passenger.hp = 0; ACT.passenger.down = false; const i = S.peds.indexOf(ACT.passenger); if (i >= 0) S.peds.splice(i, 1); if (ACT.passenger.group.parent) ACT.passenger.group.parent.remove(ACT.passenger.group); ACT.passenger = null; }
        showBeam(d.x, d.z);
        S.objective = { x: d.x, z: d.z, text: 'Cab — take the passenger across the bay' };
        if (S.onToast) S.onToast('Passenger aboard — keep the paint clean for a tip');
      }
    } else {
      const [dx, dz] = ACT.pts[1];
      if (pl.inCar && dist(pl.x, pl.z, dx, dz) < 7 && Math.abs(pl.inCar.speed) < 1.5) {
        const fare = Math.round(dist(ACT.pts[0][0], ACT.pts[0][1], dx, dz) * 0.9) + 25;
        const tip = Math.max(0, Math.round(35 - (ACT.startHealth - pl.inCar.health)));
        endActivity(fare + tip, 8, 'CAB FARE — +$' + fare + (tip ? ' · tip +$' + tip : ' · no tip (rough ride)'));
        return;
      }
    }
    if (ACT.t > 360) endActivity(0, 0, 'Cab job abandoned');
  } else if (ACT.kind === 'vigilante') {
    const car = ACT.targetCar;
    if (!car || car.removeMe) { endActivity(0, 0, 'The Bandit got away'); return; }
    showBeam(car.x, car.z);
    S.objective = { x: car.x, z: car.z, text: 'Vigilante — disable the fleeing Bandit' };
    // the criminal flees the player
    const d = dist(car.x, car.z, pl.x, pl.z);
    const away = Math.atan2(car.x - pl.x, car.z - pl.z);
    const steer = clamp(((away - car.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1, 1);
    if (!car.exploded && car.driver) stepCar(car, dt, { throttle: 0.95, steer: steer * 1.4, brake: false });
    const driverDead = !car.driver || (car.driver.hp !== undefined && car.driver.hp <= 0);
    if (car.exploded || car.health < 32 || driverDead) {
      endActivity(500, 20, 'VIGILANTE BOUNTY PAID — +$500');
      return;
    }
    if (ACT.t > 150 || d > 320) endActivity(0, 0, 'The Bandit got away');
  }
}
