// player.js — you. A low-poly smuggler in a teal jacket with health and
// armour, third-person on-foot movement (camera-relative, sprint on Shift),
// driving and boating through the vehicle modules, entering and exiting
// machines through carjack.js, and the damage hook every hostile system
// calls when it hurts the player (armour soaks 65% until it runs out).

import { S, clamp, dist, turnToward } from './util.js';
import { collideCircle, isWater, POIS } from './world.js';
import { keys, pressed } from './input.js';
import { stepCar, nearestCar } from './vehicles.js';
import { stepBoat, nearestBoat, BOATS } from './boats.js';
import { attemptEnterCar, exitCar } from './carjack.js';
import { setEngine, hurtSnd } from './audio.js';

export const PLAYER = {
  group: null, legL: null, legR: null, torso: null,
  x: POIS.safehouse.x - 4, z: POIS.safehouse.z - 16, heading: Math.PI,
  health: 100, armour: 0, inCar: null, inBoat: null,
  speed: 0, phase: 0, lastHurtT: -99, dead: false,
};

export function initPlayer(scene) {
  const g = new THREE.Group();
  const legMat = new THREE.MeshLambertMaterial({ color: 0x23272e });
  const jacket = new THREE.MeshLambertMaterial({ color: 0x0f7a72 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const cap = new THREE.MeshLambertMaterial({ color: 0xd8a93b });
  const legGeo = new THREE.BoxGeometry(0.22, 0.8, 0.25);
  PLAYER.legL = new THREE.Mesh(legGeo, legMat); PLAYER.legL.position.set(-0.14, 0.4, 0);
  PLAYER.legR = new THREE.Mesh(legGeo, legMat); PLAYER.legR.position.set(0.14, 0.4, 0);
  PLAYER.torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.74, 0.32), jacket);
  PLAYER.torso.position.y = 1.16; PLAYER.torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.38, 0.35), skin); head.position.y = 1.74;
  const capM = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.42), cap); capM.position.y = 1.95;
  g.add(PLAYER.legL); g.add(PLAYER.legR); g.add(PLAYER.torso); g.add(head); g.add(capM);
  g.position.set(PLAYER.x, 0, PLAYER.z);
  scene.add(g);
  PLAYER.group = g;
  S.playerRef = PLAYER;
  S.onPlayerDamage = (n, kind) => damagePlayer(n, kind);
  return PLAYER;
}

export function damagePlayer(n, kind) {
  if (S.over || PLAYER.dead || n <= 0) return;
  const absorbed = Math.min(PLAYER.armour, n * 0.65);
  PLAYER.armour -= absorbed;
  PLAYER.health -= (n - absorbed);
  PLAYER.lastHurtT = performance.now() / 1000;
  hurtSnd();
  if (PLAYER.health <= 0) {
    PLAYER.health = 0;
    if (S.onPlayerDeath) S.onPlayerDeath('wasted');
  }
  void kind;
}
export function healPlayer(n) { PLAYER.health = clamp(PLAYER.health + n, 0, 100); }
export function teleport(x, z, heading) {
  PLAYER.x = x; PLAYER.z = z;
  if (heading !== undefined) PLAYER.heading = heading;
  if (PLAYER.group) PLAYER.group.position.set(x, 0, z);
}
export function respawnAt(x, z) {
  if (S.playerCar) exitCar();
  if (PLAYER.inBoat) exitBoat();
  PLAYER.health = 100; PLAYER.dead = false;
  teleport(x, z, 0);
  PLAYER.group.visible = true;
}

function groundOk(x, z) {
  if (!isWater(x, z)) return true;
  if (Math.abs(x - POIS.islet.x) < 19 && Math.abs(z - POIS.islet.z) < 15) return true;
  if (Math.abs(x - POIS.lighthouse.x) < 14 && Math.abs(z - POIS.lighthouse.z) < 14) return true;
  for (const b of BOATS) if (dist(x, z, b.x, b.z) < 3.4) return true; // standing on a deck
  return false;
}

export function exitBoat() {
  const boat = PLAYER.inBoat;
  if (!boat) return;
  PLAYER.x = boat.x + 2.6; PLAYER.z = boat.z;
  // step onto a deck-side position; if that is open water the swim rules apply
  boat.driver = null;
  PLAYER.inBoat = null; S.playerBoat = null;
  PLAYER.group.visible = true;
}

export function updatePlayer(dt, t) {
  const pl = PLAYER;
  if (S.over) return;
  // slow health regen after 6 quiet seconds
  if (pl.health > 0 && pl.health < 100 && performance.now() / 1000 - pl.lastHurtT > 6)
    pl.health = Math.min(100, pl.health + 1.6 * dt);

  if (pl.inCar) {
    const car = pl.inCar;
    const ctrl = {
      throttle: (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) + (keys['KeyS'] || keys['ArrowDown'] ? -1 : 0),
      steer: (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) + (keys['KeyD'] || keys['ArrowRight'] ? -1 : 0),
      brake: !!keys['Space'],
    };
    stepCar(car, dt, ctrl);
    pl.x = car.x; pl.z = car.z; pl.heading = car.heading;
    setEngine(true, Math.abs(car.speed) / car.cls.top);
    if (pressed('KeyF')) { exitCar(); setEngine(false, 0); }
    return;
  }
  if (pl.inBoat) {
    const boat = pl.inBoat;
    const ctrl = {
      throttle: (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) + (keys['KeyS'] || keys['ArrowDown'] ? -1 : 0),
      steer: (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) + (keys['KeyD'] || keys['ArrowRight'] ? -1 : 0),
    };
    stepBoat(boat, dt, ctrl, t);
    pl.x = boat.x; pl.z = boat.z; pl.heading = boat.heading;
    setEngine(true, Math.abs(boat.speed) / boat.top * 0.7);
    if (pressed('KeyF')) { exitBoat(); setEngine(false, 0); }
    return;
  }

  // --- on foot -------------------------------------------------------------
  setEngine(false, 0);
  let mx = 0, mz = 0;
  const f = { x: Math.sin(S.camYaw), z: Math.cos(S.camYaw) };
  const r = { x: -Math.cos(S.camYaw), z: Math.sin(S.camYaw) };
  if (keys['KeyW'] || keys['ArrowUp']) { mx += f.x; mz += f.z; }
  if (keys['KeyS'] || keys['ArrowDown']) { mx -= f.x; mz -= f.z; }
  if (keys['KeyA'] || keys['ArrowLeft']) { mx -= r.x; mz -= r.z; }
  if (keys['KeyD'] || keys['ArrowRight']) { mx += r.x; mz += r.z; }
  const moving = (mx !== 0 || mz !== 0);
  const swimming = !groundOk(pl.x, pl.z);
  const spd = swimming ? 1.7 : (keys['ShiftLeft'] || keys['ShiftRight'] ? 7.2 : 4.3);
  if (moving) {
    const len = Math.hypot(mx, mz); mx /= len; mz /= len;
    const moveHeading = Math.atan2(mx, mz);
    pl.heading = S.mouseDown ? S.camYaw : turnToward(pl.heading, moveHeading, 10 * dt);
    pl.x += mx * spd * dt; pl.z += mz * spd * dt;
    const fixed = collideCircle(pl.x, pl.z, 0.45);
    pl.x = fixed.x; pl.z = fixed.z;
    pl.x = clamp(pl.x, -300, 300); pl.z = clamp(pl.z, -300, 380);
    pl.speed = spd;
  } else {
    if (S.mouseDown) pl.heading = turnToward(pl.heading, S.camYaw, 12 * dt);
    pl.speed = 0;
  }
  pl.phase += dt * (2 + pl.speed * 2.2);
  const sw = clamp(pl.speed / 5, 0, 1) * 0.55;
  pl.legL.rotation.x = Math.sin(pl.phase) * sw;
  pl.legR.rotation.x = -Math.sin(pl.phase) * sw;
  pl.group.position.set(pl.x, swimming ? -0.55 : 0, pl.z);
  pl.group.rotation.y = pl.heading;

  // enter a car or boat
  if (pressed('KeyF')) {
    const scene = S.sceneRef;
    const car = nearestCar(pl.x, pl.z, 3.6, c => !c.exploded);
    if (car) { attemptEnterCar(car, scene); return; }
    const boat = nearestBoat(pl.x, pl.z, 4.2);
    if (boat && !boat.driver) {
      boat.driver = 'player';
      pl.inBoat = boat; S.playerBoat = boat;
      pl.x = boat.x; pl.z = boat.z; pl.heading = boat.heading;
      pl.group.visible = false;
      if (S.onToast) S.onToast('Marina Skiff — W/S throttle, A/D rudder');
    }
  }
}
