// traffic.js — Solara Bay's everyday drivers. AI cars pick a lane on the
// road grid (right-hand traffic), cruise between junctions, brake for
// anything in front of them, and turn at intersections. Each car carries a
// real driver pedestrian — the person a carjacking will drag out. Cars far
// from the player are recycled to roads near the action so the city always
// feels alive where it matters.

import { S, rng, rand, pick, clamp, dist, angDiff } from './util.js';
import { LINES, randomRoadPoint } from './world.js';
import { createCar, stepCar } from './vehicles.js';
import { spawnPed } from './pedestrians.js';

const TRAFFIC_CLASSES = ['comet', 'meridian', 'meridian', 'taxi', 'cargo', 'bandit', 'comet'];
export const trafficCars = [];

export function initTraffic(scene, n) {
  for (let i = 0; i < n; i++) {
    const p = randomRoadPoint();
    const vert = Math.abs(p.x % 60) < 4 || LINES.includes(Math.round(p.x));
    const car = createCar(pick(TRAFFIC_CLASSES), p.x, p.z, 0, {});
    car.ai = makeRoute(p.x, p.z);
    car.heading = car.ai.heading;
    car.group.rotation.y = car.heading;
    const driver = spawnPed(p.x, p.z, { role: 'driver', inCar: car });
    scene.add(driver.group);
    scene.add(car.group);
    trafficCars.push(car);
  }
}

function makeRoute(x, z) {
  // choose a travel axis aligned to the nearest road line
  const vert = rng() < 0.5;
  const dir = rng() < 0.5 ? 1 : -1;
  const line = pick(LINES);
  const fx = vert ? 0 : dir, fz = vert ? dir : 0;
  const rx = -fz, rz = fx; // right-hand side
  return {
    vert, dir,
    laneLine: line,
    heading: Math.atan2(fx, fz),
    laneX: vert ? line + rx * 3.1 : x,
    laneZ: vert ? z : line + rz * 3.1,
    cruise: rand(0.45, 0.8),
  };
}

function nearestLine(v) {
  let best = LINES[0], bd = 1e9;
  for (const l of LINES) { const d = Math.abs(v - l); if (d < bd) { bd = d; best = l; } }
  return best;
}

export function updateTraffic(dt) {
  const pl = S.playerRef;
  for (const car of trafficCars) {
    if (car.removeMe || car.exploded) continue;
    if (car.driver === 'player' || car === S.playerCar) continue;
    if (!car.driver) { // driver gone (carjacked/ejected): car is abandoned
      stepCar(car, dt, { throttle: 0, steer: 0, brake: true });
      continue;
    }
    // recycle far-away cars to keep density around the player
    if (pl && dist(car.x, car.z, pl.x, pl.z) > 250) {
      const p = randomRoadPoint();
      let tries = 0;
      while (dist(p.x, p.z, pl.x, pl.z) < 90 && tries++ < 8) Object.assign(p, randomRoadPoint());
      car.x = p.x; car.z = p.z; car.speed = 0;
      car.ai = makeRoute(p.x, p.z); car.heading = car.ai.heading;
      car.group.position.set(car.x, 0, car.z);
      continue;
    }
    const ai = car.ai;
    // junction proximity: the crossing line coordinate along travel axis
    const along = ai.vert ? car.z : car.x;
    const junction = nearestLine(along);
    const distToJunction = Math.abs(junction - along);
    if (distToJunction < 3.2 && !ai.turnedAt) {
      ai.turnedAt = junction;
      if (rng() < 0.45) {
        // turn onto the crossing road
        const crossLine = ai.vert ? nearestLine(car.x) : nearestLine(car.z);
        const newDir = rng() < 0.5 ? 1 : -1;
        ai.vert = !ai.vert; ai.dir = newDir;
        ai.laneLine = crossLine;
        const fx = ai.vert ? 0 : newDir, fz = ai.vert ? newDir : 0;
        ai.heading = Math.atan2(fx, fz);
      }
    }
    if (distToJunction > 8) ai.turnedAt = null;
    // steering target: a point ahead, pulled to the lane line
    const fx = Math.sin(ai.heading), fz = Math.cos(ai.heading);
    const rx = -fz, rz = fx;
    let tx, tz;
    if (ai.vert) { tx = ai.laneLine + rx * 3.1; tz = car.z + fz * 14; }
    else { tz = ai.laneLine + rz * 3.1; tx = car.x + fx * 14; }
    const desired = Math.atan2(tx - car.x, tz - car.z);
    const steer = clamp(angDiff(car.heading, desired) * 2.2, -1, 1);
    // obstacle braking: anything slow/stopped in the lane ahead
    let throttle = ai.cruise, brake = false;
    for (const other of S.cars) {
      if (other === car || other.removeMe) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const ahead = dx * fx + dz * fz, side = Math.abs(dx * rx + dz * rz);
      if (ahead > 0 && ahead < 9 && side < 2.2) { throttle = ahead < 5 ? -0.4 : 0; brake = ahead < 4.2; break; }
    }
    if (!brake) for (const ped of S.peds) {
      if (ped.inCar || ped.down) continue;
      const dx = ped.x - car.x, dz = ped.z - car.z;
      const ahead = dx * fx + dz * fz, side = Math.abs(dx * rx + dz * rz);
      if (ahead > 0 && ahead < 6.5 && side < 1.8) { throttle = -0.3; brake = true; break; }
    }
    if (car.alarmT > 0) car.alarmT -= dt;
    stepCar(car, dt, { throttle, steer, brake });
  }
}
