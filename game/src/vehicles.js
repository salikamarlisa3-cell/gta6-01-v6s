// vehicles.js — every drivable machine in Solara Bay. Defines the vehicle
// classes (compact, sedan, taxi, van, truck, muscle, sports, plus the two
// VBPD units), builds their low-poly bodies, and steps the arcade driving
// model: throttle/steer input, drag, building and car-to-car collisions,
// crash damage hand-off to explosions.js, wheel and lightbar animation.

import { S, rng, rand, pick, clamp, dist } from './util.js';
import { collideCircle } from './world.js';
import { applyDamage } from './explosions.js';
import { crashSnd } from './audio.js';

export const CLASSES = {
  comet:      { name: 'Comet Hatch',      top: 27, accel: 12.5, grip: 2.1, w: 1.8, l: 3.7, h: 1.5, mass: 1.0 },
  meridian:   { name: 'Meridian Sedan',   top: 31, accel: 13.0, grip: 2.0, w: 1.9, l: 4.4, h: 1.5, mass: 1.1 },
  taxi:       { name: 'Solara Cab',       top: 30, accel: 12.5, grip: 2.0, w: 1.9, l: 4.4, h: 1.5, mass: 1.1 },
  cargo:      { name: 'Cargo Van',        top: 25, accel: 10.0, grip: 1.6, w: 2.1, l: 5.2, h: 2.2, mass: 1.5 },
  hauler:     { name: 'Hauler Truck',     top: 21, accel: 7.5,  grip: 1.3, w: 2.4, l: 7.2, h: 2.9, mass: 2.4 },
  bandit:     { name: 'Bandit Muscle',    top: 38, accel: 16.5, grip: 1.9, w: 2.0, l: 4.8, h: 1.35, mass: 1.3 },
  vyper:      { name: 'Vyper GT',         top: 46, accel: 20.0, grip: 2.3, w: 2.0, l: 4.5, h: 1.15, mass: 1.15 },
  cruiser:    { name: 'VBPD Cruiser',     top: 37, accel: 15.5, grip: 2.1, w: 1.9, l: 4.6, h: 1.5, mass: 1.25 },
  interceptor:{ name: 'VBPD Interceptor', top: 48, accel: 21.0, grip: 2.4, w: 2.0, l: 4.6, h: 1.25, mass: 1.2 },
};
export const CLASS_KEYS = Object.keys(CLASSES);
const PAINTS = [0xc23b2e, 0x2e6dc2, 0x3fae5a, 0xe0a51c, 0xd8d8dc, 0x22242a, 0x7a3fa0, 0xe6e6e6, 0x1f7a78, 0xb0562a];

const glassMat = new THREE.MeshLambertMaterial({ color: 0x18222e, emissive: 0x0a1420 });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x14151a });
const chromeMat = new THREE.MeshLambertMaterial({ color: 0x9aa2ab });
export const HEADLIGHT_MAT = new THREE.MeshBasicMaterial({ color: 0x8a8558 });
const TAILLIGHT_MAT = new THREE.MeshBasicMaterial({ color: 0x661111 });
let _cid = 1;

export function createCar(clsKey, x, z, heading, opts) {
  opts = opts || {};
  const cls = CLASSES[clsKey];
  const g = new THREE.Group();
  const color = opts.color !== undefined ? opts.color : (clsKey === 'taxi' ? 0xf2b21b : (clsKey === 'cruiser' || clsKey === 'interceptor') ? 0xf0f2f4 : pick(PAINTS));
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(cls.w, cls.h * 0.52, cls.l), bodyMat);
  body.position.y = cls.h * 0.38; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(cls.w * 0.84, cls.h * 0.46, cls.l * 0.44), glassMat);
  cabin.position.set(0, cls.h * 0.82, -cls.l * 0.04); g.add(cabin);
  if (clsKey === 'cargo' || clsKey === 'hauler') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(cls.w * 0.98, cls.h * 0.62, cls.l * 0.52), bodyMat);
    box.position.set(0, cls.h * 0.62, cls.l * 0.2); g.add(box);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-cls.w / 2, cls.l / 2 - 0.75], [cls.w / 2, cls.l / 2 - 0.75], [-cls.w / 2, -cls.l / 2 + 0.75], [cls.w / 2, -cls.l / 2 + 0.75]]) {
    const w = new THREE.Mesh(wheelGeo, tyreMat);
    w.position.set(wx, 0.36, wz); g.add(w); wheels.push(w);
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(cls.w * 0.8, 0.14, 0.06), HEADLIGHT_MAT);
  hl.position.set(0, cls.h * 0.42, cls.l / 2 + 0.02); g.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(cls.w * 0.8, 0.12, 0.06), TAILLIGHT_MAT);
  tl.position.set(0, cls.h * 0.44, -cls.l / 2 - 0.02); g.add(tl);
  let lightbar = null, barRed = null, barBlue = null;
  if (clsKey === 'cruiser' || clsKey === 'interceptor') {
    lightbar = new THREE.Group();
    barRed = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    barBlue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    barRed.position.x = -0.3; barBlue.position.x = 0.3;
    lightbar.add(barRed); lightbar.add(barBlue);
    lightbar.position.set(0, cls.h * 1.12, -cls.l * 0.04);
    g.add(lightbar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(cls.w + 0.02, 0.3, cls.l * 0.7), new THREE.MeshLambertMaterial({ color: 0x1c2f4a }));
    stripe.position.y = cls.h * 0.4; g.add(stripe);
  }
  if (clsKey === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    sign.position.set(0, cls.h * 1.12, -cls.l * 0.04); g.add(sign);
  }
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(cls.w * 0.96, 0.18, 0.25), chromeMat);
  bumper.position.set(0, 0.32, cls.l / 2 + 0.05); g.add(bumper);
  g.position.set(x, 0, z); g.rotation.y = heading;

  const car = {
    id: _cid++, clsKey, cls, group: g, bodyMat, wheels, lightbar, barRed, barBlue,
    x, z, heading, speed: 0, steerVis: 0,
    driver: null,            // null | ped object | 'player'
    parked: !!opts.parked,
    isCop: clsKey === 'cruiser' || clsKey === 'interceptor',
    health: 100, dmgState: 0, burning: false, exploded: false, fireT: 0, smokeAcc: 0,
    alarmT: 0, upgrades: { tune: 0, plate: 0 },
    color, radius: Math.max(cls.w, cls.l) * 0.40,
    dead: false, removeMe: false,
  };
  g.userData.car = car;
  S.cars.push(car);
  return car;
}

export function removeCar(car) {
  car.removeMe = true;
  if (car.group.parent) car.group.parent.remove(car.group);
  const i = S.cars.indexOf(car); if (i >= 0) S.cars.splice(i, 1);
}

// One physics step for a car under control input ctrl {throttle, steer, brake}.
export function stepCar(car, dt, ctrl) {
  if (car.exploded || car.dead) { car.speed = 0; return; }
  const tuneMul = 1 + car.upgrades.tune * 0.12;
  const top = car.cls.top * tuneMul;
  const accel = car.cls.accel * (1 + car.upgrades.tune * 0.15);
  if (ctrl.throttle > 0) car.speed += accel * ctrl.throttle * dt;
  else if (ctrl.throttle < 0) car.speed += (car.speed > 0.5 ? -22 : accel * 0.55 * ctrl.throttle) * dt;
  if (ctrl.brake) car.speed -= Math.sign(car.speed) * 26 * dt;
  car.speed -= car.speed * 0.55 * dt;                       // drag + rolling resistance
  if (Math.abs(car.speed) < 0.04 && !ctrl.throttle) car.speed = 0;
  car.speed = clamp(car.speed, -9, top);
  const spdFrac = clamp(car.speed / 10, -1, 1);
  car.heading += ctrl.steer * car.cls.grip * 0.62 * dt * spdFrac * (car.speed < 0 ? -1 : 1);
  car.steerVis = ctrl.steer;
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const px = car.x, pz = car.z;
  car.x += fx * car.speed * dt;
  car.z += fz * car.speed * dt;
  car.x = clamp(car.x, -292, 292); car.z = clamp(car.z, -292, 372);
  // building collision — a hard correction at speed is a crash
  const fixed = collideCircle(car.x, car.z, car.radius * 0.82);
  const corr = dist(fixed.x, fixed.z, car.x, car.z);
  if (corr > 0.05) {
    car.x = fixed.x; car.z = fixed.z;
    if (Math.abs(car.speed) > 9 && corr > 0.25) {
      applyDamage(car, (Math.abs(car.speed) - 7) * 1.5, 'crash');
      crashSnd(clamp(Math.abs(car.speed) / 30, 0.2, 1));
      car.speed *= -0.22;
    } else if (Math.abs(car.speed) > 2) {
      car.speed *= 0.55;
    }
  }
  // water is a wall for cars (except the pier deck corridor)
  if (Math.abs(car.x) > 282 && Math.abs(car.z) <= 282 || Math.abs(car.z) > 282 && !(Math.abs(car.x) < 8 && car.z > 282 && car.z < 356)) {
    car.x = px; car.z = pz; car.speed *= 0.4;
  }
  // visuals
  car.group.position.set(car.x, car.exploded ? 0.02 : 0, car.z);
  car.group.rotation.y = car.heading;
  const wr = car.speed * dt / 0.36;
  for (let i = 0; i < 4; i++) {
    car.wheels[i].rotation.x += wr;
    if (i < 2) car.wheels[i].rotation.y = car.steerVis * 0.42;
  }
  if (car.lightbar) {
    const ph = (performance.now() / 280 + car.id) % 1 < 0.5;
    car.barRed.material.color.setHex(ph ? 0xff3333 : 0x551111);
    car.barBlue.material.color.setHex(ph ? 0x113377 : 0x3377ff);
  }
  void px; void pz;
}

// Pairwise car-to-car bumps: push apart, trade momentum, damage on hard hits.
export function updateCarCollisions(dt) {
  const cars = S.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i]; if (a.removeMe) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j]; if (b.removeMe) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const rr = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 > rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), push = (rr - d) / 2, nx = dx / d, nz = dz / d;
      if (!a.exploded) { a.x -= nx * push; a.z -= nz * push; }
      if (!b.exploded) { b.x += nx * push; b.z += nz * push; }
      const rel = Math.abs(a.speed - b.speed);
      if (rel > 7) {
        applyDamage(a, (rel - 5) * 1.1, 'crash');
        applyDamage(b, (rel - 5) * 1.1, 'crash');
        crashSnd(clamp(rel / 26, 0.2, 1));
        a.speed *= 0.55; b.speed *= 0.55;
      }
    }
  }
  void dt;
}

export function nearestCar(x, z, maxD, filter) {
  let best = null, bd = maxD;
  for (const c of S.cars) {
    if (c.removeMe || c.exploded) continue;
    if (filter && !filter(c)) continue;
    const d = dist(x, z, c.x, c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// Parked cars sprinkled along the road edges for the player to steal.
export function spawnParkedCars(scene, n) {
  const keys = ['comet', 'meridian', 'meridian', 'cargo', 'bandit', 'vyper', 'taxi'];
  for (let i = 0; i < n; i++) {
    const vert = rng() < 0.5;
    const line = pick([-240, -180, -120, -60, 0, 60, 120, 180, 240]);
    const t = rand(-250, 250);
    const off = (rng() < 0.5 ? -1 : 1) * 5.1;
    const x = vert ? line + off : t, z = vert ? t : line + off;
    const heading = vert ? (off > 0 ? Math.PI : 0) : (off > 0 ? -Math.PI / 2 : Math.PI / 2);
    const car = createCar(pick(keys), x, z, heading, { parked: true });
    scene.add(car.group);
  }
}
