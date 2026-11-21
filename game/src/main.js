// main.js — SOLARA BAY. Boot, the frame loop, title/pause/Busted/Wasted
// flow, and the ?test=1 self-test that drives the real systems end to end.
//
// COMPLETENESS ENUMERATION (the dossier opens with this list):
//  10 sequential story missions in one arc, with named characters, dialogue
//  cards, payouts and a finale — src/missions.js
//  5 weapon slots with 4 guns (P-9 pistol, Raptor SMG auto, Boomstick
//  shotgun spread, Longshot rifle) behind a hold-Q weapon wheel, distinct
//  damage/fire-rate/range/ammo, world ammo pickups — src/weapons.js
//  Police helicopter AIR UNIT at wanted 4-5: searchlight cone extends
//  police line-of-sight and reports the player to ground units; evaded
//  under roofs/cover or out of range — src/airunit.js
//  3 SHOPS with menu UI and cash prices: gun shop, garage (respray lowers
//  wanted, tuning, plating), food stores; respect-gated stock — src/shops.js
//  RESPECT PROGRESSION: Nobody, Runner, Hustler, Enforcer, Shot Caller,
//  Kingpin; district standing; safehouse perks — src/progression.js
//  VBPD wanted 0-5 stars: escalating dispatch, roadblocks, PIT units,
//  line-of-sight + search around last seen, bust meter, decay while unseen
//  — src/police.js; hitscan combat with tracers — src/combat.js
//  A procedural island city, 5+ named districts, landmarks, building
//  colliders — src/world.js; 6+ vehicle classes — src/vehicles.js;
//  exploding cars, fire and chain-reaction wrecks — src/explosions.js;
//  drivable boats with a mission boat leg — src/boats.js; carjacking that
//  drags drivers out — src/carjack.js; 3-station procedural radio —
//  src/radio.js; a callable crew of 2 — src/crew.js; street race, taxi and
//  vigilante activities — src/races.js; traffic AI — src/traffic.js;
//  40+ pedestrians — src/pedestrians.js; day-night cycle and rain —
//  src/weather.js; HUD with live minimap — src/hud.js; localStorage save —
//  src/save.js; adaptive quality governor — src/render.js.

import { S, el, setSeed } from './util.js';
import { initWorld, updateWorld, WORLD, POIS } from './world.js';
import { initMissions, updateMissions, M, MISSIONS } from './missions.js';
import { initWeapons, updateWeapons, updatePickups, W, selectWeapon } from './weapons.js';
import { initAirunit, updateAirunit, HELI } from './airunit.js';
import { initShops, updateShops, openShop, closeShop, buyById, SHOPS } from './shops.js';
import { initProgression, updateProgression, PROG, addRespect } from './progression.js';
import { initPolice, updatePolice, reportCrime, setWanted, clearPolice } from './police.js';
import { initCombat, updateCombat } from './combat.js';
import { createCar, spawnParkedCars } from './vehicles.js';
import { initExplosions, updateExplosions, applyDamage } from './explosions.js';
import { spawnBoats, updateBoats } from './boats.js';
import { attemptEnterCar, exitCar } from './carjack.js';
import { updateRadio, RADIO, stationName, setDriving } from './radio.js';
import { callCrew, updateCrew } from './crew.js';
import { initRaces, updateRaces } from './races.js';
import { initTraffic, updateTraffic } from './traffic.js';
import { initPeds, updatePeds, spawnPed, alivePeds } from './pedestrians.js';
import { initPlayer, updatePlayer, PLAYER, teleport, respawnAt } from './player.js';
import { initAudio, updateAudio, toggleMute, musicOn } from './audio.js';
import { initHUD, updateHUD } from './hud.js';
import { saveGame, loadGame, hasSave, applySave } from './save.js';
import { initWeather, updateWeather } from './weather.js';
import { initInput, pressed, pressKey, endFrame, keys } from './input.js';
import { initRender, updateCamera, updateGovernor, renderFrame } from './render.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const canvas = el('game');
let scene = null, lastTs = 0, saveT = 0, shotFrames = 0, wasDriving = false;

function boot() {
  if (params.get('seed')) setSeed(parseInt(params.get('seed'), 10) || 1);
  S.testMode = !!params.get('test');
  const R = initRender(canvas);
  scene = R.scene;
  S.sceneRef = scene;
  initWorld(scene);
  initExplosions(scene);
  initCombat(scene);
  initAirunit(scene);
  initWeather(scene);
  initProgression(scene);
  initMissions(scene);
  initWeapons(scene);
  initShops(scene);
  initRaces(scene);
  initPolice();
  initPlayer(scene);
  initPeds(scene, 44);
  initTraffic(scene, 13);
  spawnParkedCars(scene, 16);
  spawnBoats(scene);
  initHUD();
  initInput(canvas);
  S.onFirstGesture = () => { initAudio(); musicOn(true); };
  S.onPlayerDeath = (kind) => onOver(kind);
  S.onMissionComplete = () => saveGame();
  S.onSafehouse = () => saveGame();
  el('shopClose').addEventListener('click', () => closeShop());
  el('btnResume').addEventListener('click', () => setPaused(false));
  el('btnNew').addEventListener('click', () => startGame(false));
  el('btnContinue').addEventListener('click', () => startGame(true));
  el('btnContinue').disabled = !hasSave();

  if (params.get('shot')) {
    el('title').classList.add('hidden');
    S.mode = 'play';
    stageShot(params.get('shot'));
  } else if (S.testMode) {
    el('title').classList.add('hidden');
    el('testlog').style.display = 'block';
    addEventListener('error', (e) => { el('testlog').textContent += 'JS-ERROR ' + (e.message || 'unknown') + '\n'; });
    addEventListener('unhandledrejection', (e) => { el('testlog').textContent += 'JS-ERROR unhandled ' + (e.reason && e.reason.message || e.reason) + '\n'; });
    S.mode = 'play';
    S.timeScale = 6;
    if (params.get('test') === 'verify') runVerify();
    else runTests();
  }
  requestAnimationFrame(loop);
}

function startGame(cont) {
  initAudio(); musicOn(true);
  if (cont) applySave(loadGame());
  el('title').classList.add('hidden');
  S.mode = 'play';
  if (S.onToast) S.onToast(cont ? 'Welcome back to Solara Bay' : 'Solara Bay — meet Maya Voss at the marina');
}

function setPaused(p) {
  if (S.mode !== 'play' || S.over) return;
  S.paused = p;
  el('pauseScreen').classList.toggle('hidden', !p);
  if (p && document.exitPointerLock) document.exitPointerLock();
}

function onOver(kind) {
  if (S.over) return;
  S.over = kind; S.overT = 0;
  el('overTitle').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  el('overSub').textContent = kind === 'busted'
    ? 'The VBPD impound your story here — for now. A fine leaves your pocket.'
    : 'Mercy Hospital patches you up. The bill leaves your pocket.';
  el('overScreen').classList.remove('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
}
function doRespawn() {
  const penalty = Math.min(S.cash, Math.max(40, Math.round(S.cash * 0.12)));
  S.cash -= penalty;
  clearPolice();
  if (S.over === 'busted') respawnAt(POIS.hq.x - 6, POIS.hq.z + 18);
  else respawnAt(POIS.hospital.x, POIS.hospital.z + 16);
  S.over = null;
  el('overScreen').classList.add('hidden');
  if (S.onToast) S.onToast((penalty ? 'Fine/medical bill: −$' + penalty + ' · ' : '') + 'Back on the street');
}

function loop(ts) {
  requestAnimationFrame(loop);
  const rawDt = Math.min(0.1, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  const dt = Math.min(0.05, rawDt) * S.timeScale;
  const t = ts / 1000;
  updateGovernor(rawDt);

  if (S.mode === 'title') {
    S.camYaw += rawDt * 0.045;
    updateWorld(rawDt, t);
    updateWeather(rawDt, t);
    updatePeds(rawDt);
    updateTraffic(rawDt);
    updateBoats(rawDt, t);
    updateCamera(rawDt);
    renderFrame();
    endFrame();
    return;
  }
  if (S.paused) { renderFrame(); endFrame(); return; }

  if (S.shotMode) {
    // staged screenshot scenes: ambient life runs, gameplay systems stay
    // frozen so the composed frame is exactly the staged one
    updateWorld(dt, t);
    updateWeather(dt, t);
    updateTraffic(dt);
    updatePeds(dt);
    updateAirunit(dt);
    updateBoats(dt, t);
    updateHUD(dt);
    updateCamera(dt);
    renderFrame();
    shotFrames++;
    if (shotFrames === 45) window.__SHOT_READY = true;
    endFrame();
    return;
  }

  if (S.over) {
    S.overT += dt;
    updateWorld(dt, t);
    updateWeather(dt, t);
    updateCamera(dt);
    updateHUD(dt);
    renderFrame();
    if (S.overT > 2.6) doRespawn();
    endFrame();
    return;
  }

  // pause / mute / crew hotkeys
  if ((pressed('KeyP') || pressed('Escape')) && !S.uiOpen) { setPaused(true); endFrame(); return; }
  if (pressed('KeyM')) { const m = toggleMute(); if (S.onToast) S.onToast(m ? 'Sound off' : 'Sound on'); }
  if (pressed('Digit6')) callCrew('rico');
  if (pressed('Digit7')) callCrew('zara');

  S.missionActive = !!M.active;
  updatePlayer(dt, t);
  updateTraffic(dt);
  updatePeds(dt);
  updatePolice(dt, scene);
  updateAirunit(dt);
  updateMissions(dt);
  updateRaces(dt);
  updateCrew(dt);
  updateShops(dt);
  updateProgression(dt, t);
  updateWeapons(dt);
  updatePickups(dt, t);
  updateCombat(dt);
  updateExplosions(dt);
  updateBoats(dt, t);
  updateRadio(dt);
  updateAudio(dt);
  updateWorld(dt, t);
  updateWeather(dt, t);
  updateHUD(dt);
  updateCamera(dt);
  renderFrame();

  // radio follows driving state
  const driving = !!S.playerCar;
  if (driving !== wasDriving) { setDriving(driving); wasDriving = driving; }

  // periodic save
  saveT += rawDt;
  if (saveT > 20 && !S.shotMode) { saveT = 0; saveGame(); }

  endFrame();
}

// ---------------------------------------------------------------------------
// Self-test: drives the real systems (missions, police, shops, boats, radio,
// explosions, carjacking, save) and writes PASS/FAIL lines into #testlog.
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, timeout, step) {
  const t0 = Date.now();
  while (Date.now() - t0 < (timeout || 15000)) { if (fn()) return true; await sleep(step || 120); }
  return !!fn();
}
function tlog(ok, name, extra) {
  const line = (ok ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : '');
  const box = el('testlog');
  box.textContent += line + '\n';
  (window.__testLines = window.__testLines || []).push(line);
}

async function runVerify() {
  await sleep(900);
  const d = loadGame();
  tlog(!!d && d.cash === 777, 'save persists across reload', 'cash=' + (d && d.cash));
  window.__TEST_DONE = true;
}

async function runTests() {
  const pl = PLAYER;
  try { localStorage.removeItem('solarabay_v6_test'); } catch (e) { }
  await sleep(500);
  tlog(WORLD.colliders.length > 120 && alivePeds() >= 40, 'boot/world spawn', WORLD.colliders.length + ' buildings, ' + alivePeds() + ' peds');

  // — mission 1 end to end, and the respect it pays —
  const cash0 = S.cash, rep0 = PROG.respect;
  const at = MISSIONS[0].at;
  teleport(at.x + 1, at.z, 0);
  await waitFor(() => !!M.active, 9000);
  await waitFor(() => !S.uiOpen && !!M.active, 14000);
  const tc = createCar('meridian', pl.x + 3, pl.z + 1, 0, {}); scene.add(tc.group);
  attemptEnterCar(tc);
  await waitFor(() => M.active && M.step >= 1, 9000);
  tc.x = POIS.garageShop.x; tc.z = POIS.garageShop.z; tc.group.position.set(tc.x, 0, tc.z);
  const done1 = await waitFor(() => !M.active && S.missionDone >= 1, 12000);
  tlog(done1 && S.cash >= cash0 + 400, 'mission 1 completes with payout', 'cash ' + cash0 + ' -> ' + S.cash);
  tlog(PROG.respect > rep0, 'respect increases after a mission', rep0 + ' -> ' + PROG.respect);
  if (S.playerCar) exitCar();
  clearPolice(); teleport(-40, 120, 0); await sleep(300);

  // — a witnessed steal raises the heat —
  const sc = createCar('comet', -38, 124, 0, { parked: true }); scene.add(sc.group);
  const wit = spawnPed(-35.5, 121.5, {}); scene.add(wit.group);
  teleport(-38, 127.5, 0);
  attemptEnterCar(sc);
  const w1 = await waitFor(() => S.wanted >= 1, 9000);
  tlog(w1, 'stealing a car raises wanted', 'wanted=' + S.wanted);
  if (S.playerCar) exitCar();

  // — dispatch answers a 3-star crime —
  reportCrime(3, pl.x, pl.z);
  const disp = await waitFor(() => S.cops.length >= 2, 12000);
  tlog(disp, 'police dispatch spawns', 'units=' + S.cops.length);

  // — hiding bleeds the stars off —
  await sleep(600);
  for (const u of S.cops) if (u.car) { u.car.x = 225; u.car.z = 225; u.car.group.position.set(225, 0, 225); }
  S.lastSeen = { x: pl.x, z: pl.z };
  teleport(-262, -262, 0);
  const hid = await waitFor(() => S.wanted < 3, 45000);
  tlog(hid, 'hiding lowers wanted', 'wanted=' + S.wanted);
  clearPolice(); await sleep(250);

  // — cornered and slow means BUSTED —
  teleport(-40, 120, 0);
  reportCrime(2, pl.x, pl.z);
  await waitFor(() => S.cops.some(u => u.car), 12000);
  const cu = S.cops.find(u => u.car);
  if (cu) { cu.car.x = pl.x + 2.5; cu.car.z = pl.z; cu.car.speed = 0; cu.car.group.position.set(cu.car.x, 0, cu.car.z); }
  const bust = await waitFor(() => S.over === 'busted', 30000);
  tlog(bust, 'bust produces BUSTED');
  await waitFor(() => !S.over, 20000);

  // — lethal damage means WASTED —
  S.onPlayerDamage(999, 'test');
  tlog(S.over === 'wasted', 'lethal damage produces WASTED');
  await waitFor(() => !S.over, 20000);

  // — the gun shop sells, the wheel switches (SMG stock needs Runner rank) —
  clearPolice(); S.cash = 5000; addRespect(200, null);
  teleport(POIS.gunShop.x, POIS.gunShop.z + 8, 0);
  openShop(SHOPS[0]);
  const bought = buyById('gun', 'w_smg');
  tlog(bought && W.owned.smg && S.cash < 5000, 'gun shop purchase adds a weapon', 'cash=' + S.cash);
  closeShop();
  keys['KeyQ'] = true; await sleep(300);
  const wheelOpened = W.wheelOpen;
  keys['KeyQ'] = false; await sleep(300);
  const switched = selectWeapon('smg') && W.current === 'smg';
  tlog(wheelOpened && switched, 'weapon wheel switches to it', 'current=' + W.current);

  // — the helicopter joins at four stars —
  setWanted(4);
  const heli = await waitFor(() => HELI.active, 9000);
  tlog(heli, 'helicopter spawns at wanted 4');
  clearPolice();

  // — boats float and move —
  teleport(6.5, 320, 0);
  await sleep(200);
  pressKey('KeyF');
  const inBoat = await waitFor(() => !!pl.inBoat, 7000);
  let boatMoved = false;
  if (pl.inBoat) {
    const b = pl.inBoat, bz = b.z;
    b.heading = 0;
    keys['KeyW'] = true; await sleep(1400); keys['KeyW'] = false;
    boatMoved = Math.abs(b.z - bz) > 3;
  }
  tlog(inBoat && boatMoved, 'boat can be entered and moves on water');
  if (pl.inBoat) { pressKey('KeyF'); await sleep(250); }

  // — a wrecked car burns and blows —
  teleport(60, 200, 0);
  const ec = createCar('comet', 67, 200, 0, {}); scene.add(ec.group);
  applyDamage(ec, 300, 'test');
  const boom = await waitFor(() => ec.exploded, 9000);
  tlog(boom && ec.burning, 'a damaged car catches fire and explodes');

  // — radio changes station behind the wheel —
  const rc = createCar('meridian', 60, 207, 0, {}); scene.add(rc.group);
  teleport(60, 203.5, 0);
  attemptEnterCar(rc);
  await sleep(400);
  const before = RADIO.idx + ':' + RADIO.on;
  pressKey('KeyR');
  await sleep(400);
  tlog(RADIO.on && (RADIO.idx + ':' + RADIO.on) !== before, 'radio switches station while driving', stationName());
  if (S.playerCar) exitCar();

  // — carjacking drags the driver out —
  teleport(40, 160, 0);
  const jc = createCar('meridian', 44, 160, 0, {}); scene.add(jc.group);
  const drv = spawnPed(44, 160, { role: 'driver', inCar: jc }); scene.add(drv.group);
  attemptEnterCar(jc);
  await sleep(350);
  tlog(drv.inCar === null && S.playerCar === jc, 'carjacking an occupied car pulls the driver out', 'driver state=' + drv.state);
  if (S.playerCar) exitCar();

  // — save round-trip (the reload half is checked by ?test=verify) —
  clearPolice();
  S.cash = 777; saveGame();
  const back = loadGame();
  tlog(!!back && back.cash === 777, 'save writes and reads back', 'cash=' + (back && back.cash));
  el('testlog').textContent += 'DONE\n';
  window.__TEST_DONE = true;
}

boot();
