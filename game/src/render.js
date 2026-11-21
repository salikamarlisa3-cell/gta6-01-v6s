// render.js — the three.js stage and the adaptive quality governor.
// A 62-degree camera rides behind the player (further back in a car), the
// sun is a single shadow-casting directional light, and the governor keeps
// the game playable anywhere: it watches an exponential moving average of
// frame rate and, when the machine struggles (a software rasteriser like
// SwiftShader included), steps quality down — pixel ratio first, then
// shadows, then particle counts — and steps back up when headroom returns.

import { S, clamp, lerp } from './util.js';

export const R = { renderer: null, scene: null, camera: null, evalT: 0, goodStreak: 0 };

export function initRender(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ec9e8);
  scene.fog = new THREE.Fog(0xa8c8dd, 130, 520);
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1500);
  camera.position.set(0, 8, -14);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x54503e, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.1);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -130; sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 130; sun.shadow.camera.bottom = -130;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);
  const amb = new THREE.AmbientLight(0xffffff, 0.14);
  scene.add(amb);
  R.renderer = renderer; R.scene = scene; R.camera = camera;
  S.sceneRef = scene;
  S.sceneRefs = { scene, sun, hemi, camera, renderer };
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  return R;
}

function applyQuality(q) {
  S.quality = q;
  const r = R.renderer;
  if (!r) return;
  const dpr = devicePixelRatio || 1;
  if (q === 0) { r.setPixelRatio(Math.min(dpr, 2)); r.shadowMap.enabled = true; S.particleMul = 1; }
  else if (q === 1) { r.setPixelRatio(Math.min(dpr, 1.25)); r.shadowMap.enabled = true; S.particleMul = 0.8; }
  else if (q === 2) { r.setPixelRatio(1); r.shadowMap.enabled = false; S.particleMul = 0.6; }
  else { r.setPixelRatio(0.7); r.shadowMap.enabled = false; S.particleMul = 0.4; }
  if (R.scene) R.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
}

export function updateGovernor(dtRaw) {
  if (dtRaw > 0) S.fpsEMA = lerp(S.fpsEMA, 1 / Math.max(dtRaw, 1e-4), 0.045);
  R.evalT += dtRaw;
  if (R.evalT < 2) return;
  R.evalT = 0;
  if (S.fpsEMA < 33 && S.quality < 3) { applyQuality(S.quality + 1); R.goodStreak = 0; }
  else if (S.fpsEMA > 56 && S.quality > 0) {
    R.goodStreak++;
    if (R.goodStreak >= 2) { applyQuality(S.quality - 1); R.goodStreak = 0; }
  } else R.goodStreak = 0;
}

const _camPos = new THREE.Vector3(0, 8, -14);
export function updateCamera(dt) {
  const cam = R.camera, pl = S.playerRef;
  if (!cam || !pl) return;
  if (S.shotMode && S.shotCam) {
    cam.position.set(S.shotCam.x, S.shotCam.y, S.shotCam.z);
    cam.lookAt(S.shotCam.lx, S.shotCam.ly, S.shotCam.lz);
    _camPos.copy(cam.position);
    return;
  }
  const inVeh = pl.inCar || pl.inBoat;
  const distWanted = S.camDist * (inVeh ? 1.5 : 1);
  const fx = Math.sin(S.camYaw), fz = Math.cos(S.camYaw);
  const tx = pl.x - fx * distWanted;
  const tz = pl.z - fz * distWanted;
  const ty = (inVeh ? 2.6 : 2.1) + S.camPitch * 4.4;
  const k = 1 - Math.exp(-7 * dt);
  _camPos.x += (tx - _camPos.x) * k;
  _camPos.y += (ty - _camPos.y) * k;
  _camPos.z += (tz - _camPos.z) * k;
  if (_camPos.y < 0.7) _camPos.y = 0.7;
  cam.position.copy(_camPos);
  cam.lookAt(pl.x + fx * 7, 1.35 + S.camPitch * 1.2, pl.z + fz * 7);
}

export function renderFrame() {
  if (R.renderer) R.renderer.render(R.scene, R.camera);
}
