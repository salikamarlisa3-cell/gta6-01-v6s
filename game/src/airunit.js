// airunit.js — the VBPD helicopter. At four stars and up it joins the hunt:
// it orbits the player from 27 metres, paints them with a searchlight cone,
// and being caught in that light counts as being seen — ground units get
// your position for as long as it holds you. Break it the honest ways:
// slip under a roof (the gas-station canopy, the parking garage, the pier
// roof — world.coverZones), duck behind the skyline, or simply outrun its
// orbit until it falls back to searching your last seen position.

import { S, clamp, dist, rand } from './util.js';
import { losBlocked, coverAt } from './world.js';

export const HELI = {
  active: false, group: null, rotor: null, tailRotor: null, cone: null, light: null,
  x: 0, z: 0, alt: 27, orbitA: 0, mode: 'off', loseT: 0, spotX: 0, spotZ: 0, scene: null,
};

export function initAirunit(scene) {
  HELI.scene = scene;
  S.heliRef = HELI;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xf0f2f4 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c2f4a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.9, 5.2), bodyMat); g.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.6, 5.25), darkMat); stripe.position.y = -0.2; g.add(stripe);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 4.6), bodyMat); tail.position.set(0, 0.25, -4.6); g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.3, 0.8), darkMat); fin.position.set(0, 0.7, -6.7); g.add(fin);
  HELI.rotor = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.08, 0.7), darkMat);
  HELI.rotor.position.y = 1.25; g.add(HELI.rotor);
  HELI.tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.3), darkMat);
  HELI.tailRotor.position.set(0.35, 0.7, -6.7); g.add(HELI.tailRotor);
  const skidMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  for (const sx of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 4.4), skidMat);
    skid.position.set(sx * 1.05, -1.25, 0); g.add(skid);
  }
  // the searchlight: a real spotlight plus a visible volumetric-style cone
  HELI.light = new THREE.SpotLight(0xfff2c0, 0, 95, 0.24, 0.45, 0.6);
  g.add(HELI.light); g.add(HELI.light.target);
  const coneGeo = new THREE.ConeGeometry(7.5, 30, 20, 1, true);
  coneGeo.translate(0, -15, 0);
  HELI.cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
    color: 0xffedb5, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, depthWrite: false,
  }));
  HELI.cone.position.y = -1;
  g.add(HELI.cone);
  g.visible = false;
  scene.add(g);
  HELI.group = g;
}

export function setAirActive(on) {
  if (on && !HELI.active) {
    HELI.active = true; HELI.mode = 'inbound';
    const pl = S.playerRef;
    HELI.x = (pl ? pl.x : 0) + rand(-140, 140);
    HELI.z = (pl ? pl.z : 0) - 150;
    HELI.group.visible = true;
  } else if (!on && HELI.active) {
    HELI.mode = 'leaving';
  }
}

export function updateAirunit(dt) {
  S.heliLit = false;
  if (!HELI.group) return;
  if (!HELI.active && HELI.mode !== 'leaving') { HELI.group.visible = false; return; }
  const pl = S.playerRef;
  if (!pl) return;
  HELI.rotor.rotation.y += dt * 28;
  HELI.tailRotor.rotation.x += dt * 34;
  let tx, tz, speed = 30;
  if (HELI.mode === 'leaving') {
    tx = HELI.x + 200; tz = HELI.z - 200; speed = 42;
    if (dist(HELI.x, HELI.z, pl.x, pl.z) > 260) { HELI.active = false; HELI.mode = 'off'; HELI.group.visible = false; HELI.light.intensity = 0; HELI.cone.material.opacity = 0; return; }
  } else {
    // orbit the hunt centre: the player while tracked, lastSeen while searching
    const centre = HELI.mode === 'searching' ? S.lastSeen : pl;
    HELI.orbitA += dt * 0.32;
    tx = centre.x + Math.sin(HELI.orbitA) * 26;
    tz = centre.z + Math.cos(HELI.orbitA) * 26;
  }
  const dx = tx - HELI.x, dz = tz - HELI.z, d = Math.hypot(dx, dz);
  if (d > 0.5) {
    const step = Math.min(d, speed * dt);
    HELI.x += (dx / d) * step; HELI.z += (dz / d) * step;
  }
  HELI.group.position.set(HELI.x, HELI.alt + Math.sin(performance.now() / 600) * 0.5, HELI.z);
  HELI.group.rotation.y = Math.atan2(pl.x - HELI.x, pl.z - HELI.z);
  HELI.group.rotation.z = clamp(d * 0.004, 0, 0.14);

  // --- the spotlight -------------------------------------------------------
  const hunting = HELI.mode === 'inbound' || HELI.mode === 'tracking' || HELI.mode === 'searching';
  if (hunting) {
    // where does the light fall? on the player if geometry allows, else it
    // sweeps the last seen point
    const underCover = coverAt(pl.x, pl.z);
    const blocked = losBlocked(HELI.x, HELI.z, pl.x, pl.z);
    const inRange = dist(HELI.x, HELI.z, pl.x, pl.z) < 88;
    const lit = inRange && !underCover && !blocked && HELI.mode !== 'searching';
    if (lit) {
      HELI.mode = 'tracking'; HELI.loseT = 0;
      HELI.spotX = pl.x; HELI.spotZ = pl.z;
      S.heliLit = true;
    } else {
      HELI.loseT += dt;
      if (HELI.mode === 'tracking' && HELI.loseT > 3.5) HELI.mode = 'searching';
      if (HELI.mode === 'searching') {
        HELI.spotX = S.lastSeen.x + Math.sin(performance.now() / 900) * 9;
        HELI.spotZ = S.lastSeen.z + Math.cos(performance.now() / 700) * 9;
        if (HELI.loseT > 14) { HELI.loseT = 0; if (S.wanted < 4) setAirActive(false); }
      } else { HELI.spotX = pl.x; HELI.spotZ = pl.z; }
    }
    // aim the cone + spotlight at the lit point on the ground
    const gx = HELI.spotX - HELI.x, gz = HELI.spotZ - HELI.z;
    HELI.cone.rotation.z = clamp(gx * 0.03, -0.5, 0.5);
    HELI.cone.rotation.x = clamp(-gz * 0.03, -0.5, 0.5);
    HELI.cone.material.opacity = 0.10 + Math.random() * 0.03;
    HELI.light.intensity = 1.8;
    HELI.light.target.position.set(HELI.spotX - HELI.x, -HELI.alt, HELI.spotZ - HELI.z);
  } else {
    HELI.light.intensity = 0;
    HELI.cone.material.opacity = 0;
  }
}
