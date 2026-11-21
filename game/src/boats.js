// boats.js — the water half of Solara Bay's vehicle set. A drivable skiff
// class with buoyancy bob, wake spray and water-only movement: boats slide
// along the shore and bump the pier instead of climbing onto land. Boats
// moor at the Grand Pier and at Ferro Islet, and one story mission's escape
// leg depends on them.

import { S, clamp, dist } from './util.js';
import { isWater } from './world.js';
import { burst } from './explosions.js';

export const BOATS = [];
const hullMat = new THREE.MeshLambertMaterial({ color: 0xe8e4da });
const trimMat = new THREE.MeshLambertMaterial({ color: 0x1f6f8a });
const motorMat = new THREE.MeshLambertMaterial({ color: 0x22242a });

export function createBoat(x, z, heading) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 5.6), hullMat);
  hull.position.y = 0.35; hull.castShadow = true; g.add(hull);
  const bow = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 1.4), trimMat);
  bow.position.set(0, 0.4, 3.2); bow.rotation.y = Math.PI / 4; bow.scale.set(0.75, 1, 1); g.add(bow);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 0.7), trimMat);
  bench.position.set(0, 0.85, -0.4); g.add(bench);
  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.4), motorMat);
  motor.position.set(0, 0.75, -3.0); g.add(motor);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.1, 5.7), trimMat);
  rail.position.y = 0.8; g.add(rail);
  g.position.set(x, 0, z); g.rotation.y = heading;
  const boat = {
    kind: 'boat', name: 'Marina Skiff', x, z, heading, speed: 0,
    driver: null, group: g, radius: 2.7, top: 17, accel: 7.5, wakeAcc: 0, removeMe: false,
  };
  g.userData.boat = boat;
  BOATS.push(boat);
  return boat;
}

export function spawnBoats(scene) {
  const b1 = createBoat(7.5, 322, Math.PI); scene.add(b1.group);   // Grand Pier
  const b2 = createBoat(182, 380, -0.6); scene.add(b2.group);      // Ferro Islet dock
  const b3 = createBoat(-14, 296, 0.4); scene.add(b3.group);       // marina shore
  return [b1, b2, b3];
}

export function stepBoat(boat, dt, ctrl, t) {
  if (ctrl.throttle > 0) boat.speed += boat.accel * ctrl.throttle * dt;
  else if (ctrl.throttle < 0) boat.speed += boat.accel * 0.5 * ctrl.throttle * dt;
  boat.speed -= boat.speed * 0.5 * dt;
  boat.speed = clamp(boat.speed, -4, boat.top);
  boat.heading += ctrl.steer * 0.85 * dt * clamp(boat.speed / 5, -1, 1);
  const nx = boat.x + Math.sin(boat.heading) * boat.speed * dt;
  const nz = boat.z + Math.cos(boat.heading) * boat.speed * dt;
  // boats stay on water: the shoreline and pier posts are hard stops
  if (isWater(nx, nz) || (Math.abs(nx) < 8 && nz > 282 && nz < 352)) {
    boat.x = nx; boat.z = nz;
  } else {
    boat.speed *= 0.3;
  }
  boat.x = clamp(boat.x, -420, 420); boat.z = clamp(boat.z, -420, 460);
  boat.group.position.set(boat.x, Math.sin(t * 1.7 + boat.x * 0.05) * 0.07 - 0.05, boat.z);
  boat.group.rotation.set(Math.sin(t * 1.3 + boat.z * 0.04) * 0.02 + boat.speed * 0.004, boat.heading, Math.sin(t * 1.5) * 0.025 - ctrl.steer * 0.03);
  if (Math.abs(boat.speed) > 3) {
    boat.wakeAcc += dt;
    if (boat.wakeAcc > 0.09) {
      boat.wakeAcc = 0;
      burst(boat.x - Math.sin(boat.heading) * 3, 0.15, boat.z - Math.cos(boat.heading) * 3, 2, 'splash');
    }
  }
}

export function updateBoats(dt, t) {
  for (const b of BOATS) {
    if (b.driver === 'player') continue; // player path steps it with input
    b.group.position.y = Math.sin(t * 1.6 + b.x * 0.05) * 0.07 - 0.05;
  }
}

export function nearestBoat(x, z, maxD) {
  let best = null, bd = maxD;
  for (const b of BOATS) {
    const d = dist(x, z, b.x, b.z);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
