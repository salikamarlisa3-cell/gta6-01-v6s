// weather.js — Solara Bay's sky. A full day runs in eight real minutes:
// the sun arcs, the sky and fog breathe through dawn/day/dusk palettes, and
// at night the city answers — window facades light up, street lamps and
// headlights switch on, neon does the rest. Every few minutes a brief
// tropical shower rolls through: rain streaks around the camera, denser
// fog, and filtered-noise rain on the audio chain.

import { S, clamp, lerp, rand } from './util.js';
import { WORLD } from './world.js';
import { HEADLIGHT_MAT } from './vehicles.js';
import { setRain } from './audio.js';

const SKY = {
  night: new THREE.Color(0x0a1220), day: new THREE.Color(0x8ec9e8),
  dawn: new THREE.Color(0xe99a5f), fogNight: new THREE.Color(0x0a1220), fogDay: new THREE.Color(0xa8c8dd),
};
const W = { rainT: rand(120, 220), raining: 0, rainPts: null, dayF: 1 };
export function daylight() { return W.dayF; }
export function isNight() { return W.dayF < 0.35; }

export function initWeather(scene) {
  const geo = new THREE.BufferGeometry();
  const n = 700, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = rand(-32, 32); arr[i * 3 + 1] = rand(0, 34); arr[i * 3 + 2] = rand(-32, 32); }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  W.rainPts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xaaccee, size: 0.14, transparent: true, opacity: 0.7 }));
  W.rainPts.visible = false;
  W.rainPts.frustumCulled = false;
  scene.add(W.rainPts);
}

const _c = new THREE.Color();
export function updateWeather(dt, t) {
  const refs = S.sceneRefs; if (!refs) return;
  if (!S.freezeClock) S.timeMin += dt * 3; // 3 game-minutes per real second
  if (S.timeMin >= 1440) { S.timeMin -= 1440; S.day++; }
  const ang = ((S.timeMin - 360) / 1440) * Math.PI * 2; // sunrise at 06:00
  const elev = Math.sin(ang);
  const dayF = clamp(elev * 2.4, 0, 1);
  W.dayF = dayF;
  const sun = refs.sun;
  const plx = S.playerRef ? S.playerRef.x : 0, plz = S.playerRef ? S.playerRef.z : 0;
  sun.position.set(plx + Math.cos(ang) * 260, Math.max(10, elev * 240), plz + 120);
  sun.target.position.set(plx, 0, plz);
  sun.intensity = 0.12 + dayF * 1.05;
  sun.color.setHSL(0.1, 0.5, lerp(0.55, 0.72, clamp(elev * 3, 0, 1)));
  refs.hemi.intensity = 0.22 + dayF * 0.5;
  // sky: night -> (dawn glow near horizon sun) -> day
  _c.copy(SKY.night).lerp(SKY.day, dayF);
  if (elev > -0.05 && elev < 0.3) _c.lerp(SKY.dawn, (0.3 - elev) * 1.4 * (dayF * 0.8 + 0.2));
  refs.scene.background = _c;
  if (refs.scene.fog) {
    refs.scene.fog.color.copy(_c);
    refs.scene.fog.near = W.raining > 0 ? 60 : 130;
    refs.scene.fog.far = W.raining > 0 ? 240 : 520;
  }
  const nf = 1 - dayF;
  for (const m of WORLD.windowMats) m.emissiveIntensity = nf * 0.9;
  if (WORLD.lampMat) WORLD.lampMat.color.setRGB(0.3 + nf * 0.7, 0.28 + nf * 0.62, 0.18 + nf * 0.3);
  HEADLIGHT_MAT.color.setRGB(0.45 + nf * 0.55, 0.42 + nf * 0.5, 0.3 + nf * 0.25);
  // --- rain events ---------------------------------------------------------
  if (W.raining > 0) {
    W.raining -= dt;
    if (W.raining <= 0) { W.rainPts.visible = false; setRain(false); S.raining = false; W.rainT = rand(150, 280); }
  } else {
    W.rainT -= dt;
    if (W.rainT <= 0 && S.mode === 'play') {
      W.raining = 26; W.rainPts.visible = true; setRain(true); S.raining = true;
      if (S.onToast) S.onToast('A tropical shower rolls over the bay');
    }
  }
  if (W.rainPts.visible && S.playerRef) {
    const pl = S.playerRef;
    W.rainPts.position.set(pl.x, 0, pl.z);
    const pos = W.rainPts.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.array[i * 3 + 1] - dt * 38;
      if (y < 0) y = 34;
      pos.array[i * 3 + 1] = y;
    }
    pos.needsUpdate = true;
  }
  void t;
}
