// missions.js — the story of Solara Bay: ten sequential missions in one arc.
// Maya Voss, a Marina fixer, pulls you from errand runner to kingpin through
// boat smuggling, convoy hits, a stolen VBPD prototype and a final escape
// under the helicopter's light. Each mission is data: an intro dialogue, a
// list of steps (go / steal / drive / boat / pickup / shoot / escape), a
// payout and respect. A gold beam marks the current objective; finishing a
// mission pays cash, raises respect and district standing, and saves.

import { S, clamp, dist } from './util.js';
import { POIS, districtAt } from './world.js';
import { spawnPed } from './pedestrians.js';
import { fireHitscan } from './combat.js';
import { losBlocked } from './world.js';
import { createCar } from './vehicles.js';
import { addRespect } from './progression.js';
import { reportCrime, setWanted } from './police.js';
import { cashSnd } from './audio.js';

const MAYA = { x: 6, z: 232 }, RICO = { x: -14, z: 224 }, ZARA = { x: 118, z: -38 }, FERRO = { x: 160, z: 388 };

export const MISSIONS = [
  { title: 'First Wheels', giver: 'Maya Voss', at: MAYA, pay: 400, respect: 25,
    intro: [
      { who: 'Maya Voss', text: 'You must be the new wheel-man Ferro mentioned. I move product, you move it faster. Ground rules: no names, no phones, no heroes.' },
      { who: 'Maya Voss', text: 'First job is a driving test. Find a car — I do not care whose — and take it to Torque & Tone in Cargo Bay. Try not to bring the VBPD with you.' },
    ],
    steps: [
      { kind: 'getcar', text: 'Steal a car — any car' },
      { kind: 'drive', x: POIS.garageShop.x, z: POIS.garageShop.z, r: 10, text: 'Drive to Torque & Tone garage' },
    ] },
  { title: 'Harbor Run', giver: 'Maya Voss', at: MAYA, pay: 650, respect: 35,
    intro: [
      { who: 'Maya Voss', text: 'Ferro has a package sweating on the Grand Pier and the harbor patrol is awake. You are going by water — quieter, and the VBPD boats are all in dry dock.' },
      { who: 'Maya Voss', text: 'Collect it at the pier end, run it out to Ferro Islet, and put it in the old man\'s hands personally.' },
    ],
    steps: [
      { kind: 'pickup', x: 0, z: 340, r: 6, wait: 2, text: 'Collect the package at the pier end' },
      { kind: 'boat', x: 178, z: 382, r: 11, text: 'Run the package to Ferro Islet by boat' },
      { kind: 'goto', x: FERRO.x, z: FERRO.z, r: 7, text: 'Deliver to Ferro at the shack' },
    ] },
  { title: 'Three Drops', giver: 'Rico Tanaka', at: RICO, pay: 700, respect: 30,
    intro: [
      { who: 'Rico Tanaka', text: 'Rico. I run Maya\'s ground game. Three drops, three districts, one car, no stops for sightseeing.' },
      { who: 'Rico Tanaka', text: 'SolGas first, then Palmera, then Midtown. The packages are already in whatever you are driving. Probably.' },
    ],
    steps: [
      { kind: 'drive', x: 116, z: -52, r: 9, text: 'Drop one: SolGas station' },
      { kind: 'drive', x: -152, z: 34, r: 9, text: 'Drop two: Palmera Heights' },
      { kind: 'drive', x: 64, z: 152, r: 9, text: 'Drop three: Midtown Palms' },
      { kind: 'goto', x: RICO.x, z: RICO.z, r: 6, text: 'Report back to Rico' },
    ] },
  { title: 'Heat Check', giver: 'Zara Lindqvist', at: ZARA, pay: 800, respect: 40,
    intro: [
      { who: 'Zara Lindqvist', text: 'Zara. I handle problems that shoot back. Before Maya trusts you with real work, I need to see you lose a tail.' },
      { who: 'Zara Lindqvist', text: 'I am about to make a very loud phone call to the VBPD. Three stars loud. Shake them. However you like — alleys, the garage, the bay. Just shake them.' },
    ],
    steps: [
      { kind: 'escape', text: 'Lose the VBPD (wanted level to zero)', triggerWanted: 3 },
    ] },
  { title: 'Convoy', giver: 'Rico Tanaka', at: { x: 196, z: 116 }, pay: 1200, respect: 50,
    intro: [
      { who: 'Rico Tanaka', text: 'A rival crew is moving a van through Cargo Bay with three shooters riding shotgun. That van is ours now — the cargo, I mean. The van too, if it survives.' },
      { who: 'Rico Tanaka', text: 'Ambush at the marked junction. Drop the guards, then bring whatever is left to Torque & Tone.' },
    ],
    steps: [
      { kind: 'goto', x: 152, z: 62, r: 8, text: 'Reach the ambush point' },
      { kind: 'shoot', x: 152, z: 62, r: 30, count: 3, text: 'Drop the convoy guards (0/3)', guards: [[158, 56], [146, 68], [160, 70]] },
      { kind: 'drive', x: POIS.garageShop.x, z: POIS.garageShop.z, r: 10, text: 'Bring the take to Torque & Tone' },
    ] },
  { title: 'Night Market', giver: 'Maya Voss', at: { x: -200, z: -50 }, pay: 1100, respect: 45,
    intro: [
      { who: 'Maya Voss', text: 'A buyer waits in the Midtown market alley with a case of cash and no patience. The last courier got rolled there, so go armed and go at night if you can.' },
      { who: 'Maya Voss', text: 'Make the exchange, deal with whoever objects, and sleep it off at the safehouse.' },
    ],
    steps: [
      { kind: 'pickup', x: -118, z: 92, r: 6, wait: 2, text: 'Make the exchange in the market alley' },
      { kind: 'shoot', x: -118, z: 92, r: 26, count: 2, text: 'Repel the ambush (0/2)', guards: [[-110, 84], [-126, 100]], spawnOnPrev: true },
      { kind: 'goto', x: POIS.safehouse.x, z: POIS.safehouse.z - 2, r: 5, text: 'Lie low at the Marina Safehouse' },
    ] },
  { title: 'The Interceptor', giver: 'Zara Lindqvist', at: { x: 168, z: -138 }, pay: 1600, respect: 60,
    intro: [
      { who: 'Zara Lindqvist', text: 'The VBPD took delivery of a prototype Interceptor yesterday. Tonight it sleeps in the HQ lot with the keys in it, because Inspector Hale trusts her fence.' },
      { who: 'Zara Lindqvist', text: 'Steal it. The moment you move it, every badge in the bay wakes up — four stars of them. Lose them and the car is Maya\'s trophy.' },
    ],
    steps: [
      { kind: 'goto', x: 188, z: -158, r: 8, text: 'Infiltrate the HQ lot' },
      { kind: 'stealcar', text: 'Steal the prototype Interceptor', spawnCar: 'interceptor', sx: 186, sz: -166 },
      { kind: 'escape', text: 'Lose the VBPD with the prototype', triggerWanted: 4 },
    ] },
  { title: 'Regatta Ruse', giver: 'Ferro', at: FERRO, pay: 1400, respect: 55,
    intro: [
      { who: 'Ferro', text: 'Eh, the regatta brings rich fools and their yachts — and one customs buoy tender who owes me a manifest. You take my skiff, you visit the north buoy, you come back smiling.' },
      { who: 'Ferro', text: 'If the helicopter looks at you, remember: it cannot see through a roof, and it cannot swim. Go.' },
    ],
    steps: [
      { kind: 'boat', x: -60, z: -318, r: 13, text: 'Visit the customs buoy off North Beach' },
      { kind: 'boat', x: 4, z: 326, r: 11, text: 'Bring the skiff back to the Grand Pier' },
      { kind: 'goto', x: MAYA.x, z: MAYA.z, r: 6, text: 'Tell Maya the manifest is handled' },
    ] },
  { title: 'Kingpin\'s Toll', giver: 'Rico Tanaka', at: { x: 30, z: -88 }, pay: 2000, respect: 70,
    intro: [
      { who: 'Rico Tanaka', text: 'The dock crews are paying protection to the wrong family. Four of their collectors meet tonight in Marina to split the take. We are un-inviting them.' },
      { who: 'Rico Tanaka', text: 'Hit the meet, take the case, and be nobody by the time the sirens arrive.' },
    ],
    steps: [
      { kind: 'goto', x: 92, z: 182, r: 8, text: 'Reach the collectors\' meet' },
      { kind: 'shoot', x: 92, z: 182, r: 30, count: 4, text: 'Take down the collectors (0/4)', guards: [[86, 176], [98, 176], [86, 188], [98, 188]] },
      { kind: 'pickup', x: 92, z: 182, r: 5, wait: 2, text: 'Take the case' },
      { kind: 'escape', text: 'Vanish — lose any wanted level' },
    ] },
  { title: 'Solara Goodbye', giver: 'Maya Voss', at: MAYA, pay: 3000, respect: 100,
    intro: [
      { who: 'Maya Voss', text: 'Inspector Hale finally has her warrant, and half the bay has my name in its pocket. Tonight I leave Solara — and you are my way out.' },
      { who: 'Maya Voss', text: 'Pick me up, get me to the pier, and run the bay to Lighthouse Point. The helicopter will come. Let it look at the water, not at us.' },
      { who: 'Inspector Hale', text: '(radio) All units — the Voss extraction is moving. Air unit authorised. Take the driver alive.' },
    ],
    steps: [
      { kind: 'pickup', x: MAYA.x, z: MAYA.z, r: 5, wait: 2, text: 'Pick up Maya' },
      { kind: 'drive', x: 0, z: 300, r: 9, text: 'Get Maya to the Grand Pier', triggerWanted: 4 },
      { kind: 'boat', x: 288, z: 288, r: 13, text: 'Escape by boat to Lighthouse Point' },
      { kind: 'goto', x: 292, z: 290, r: 7, text: 'Reach the lighthouse', finale: true },
    ] },
];

export const M = {
  idx: 0,            // next mission to offer
  active: null,      // mission object in progress
  step: 0,
  waitT: 0,
  guards: [],
  targetCar: null,
  triggered: false,
  marker: null, beam: null,
};

export function initMissions(scene) {
  const beamGeo = new THREE.CylinderGeometry(1.15, 1.15, 30, 12, 1, true);
  M.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
    color: 0xffc93c, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
  }));
  M.beam.position.y = 15;
  const ringGeo = new THREE.RingGeometry(1.7, 2.3, 26); ringGeo.rotateX(-Math.PI / 2);
  M.marker = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.85 }));
  M.marker.position.y = 0.12;
  scene.add(M.beam); scene.add(M.marker);
  setObjectiveIdle();
}
function setObjectiveIdle() {
  if (M.idx >= MISSIONS.length) {
    S.objective = { text: 'Free roam — the bay is yours. Activities pay at the gold markers' };
    M.beam.visible = false; M.marker.visible = false;
  } else {
    const m = MISSIONS[M.idx];
    S.objective = { x: m.at.x, z: m.at.z, text: 'Meet ' + m.giver + ' — "' + m.title + '"' };
    M.beam.visible = true; M.marker.visible = true;
    M.beam.position.x = m.at.x; M.beam.position.z = m.at.z;
    M.marker.position.x = m.at.x; M.marker.position.z = m.at.z;
  }
}

export function startMission(i) {
  const m = MISSIONS[i];
  M.active = m; M.step = 0; M.guards = []; M.targetCar = null; M.triggered = false;
  if (S.showDialogue) S.showDialogue(m.intro, () => { beginStep(); });
  else beginStep();
  if (S.onToast) S.onToast('MISSION — ' + m.title);
}
function beginStep() {
  const m = M.active; if (!m) return;
  const st = m.steps[M.step];
  M.waitT = 0; M.triggered = false;
  if (st.triggerWanted) { reportCrime(st.triggerWanted, S.playerRef.x, S.playerRef.z); M.triggered = true; }
  if (st.kind === 'shoot') spawnGuards(st);
  if (st.spawnCar) {
    M.targetCar = createCar(st.spawnCar, st.sx, st.sz, Math.PI / 2, { parked: true });
    if (S.sceneRef) S.sceneRef.add(M.targetCar.group);
  }
  updateObjective();
}
function spawnGuards(st) {
  for (const [gx, gz] of st.guards || []) {
    const ped = spawnPed(gx, gz, { role: 'guard', shooter: true, controlledBy: 'mission', hp: 90 });
    if (S.sceneRef) S.sceneRef.add(ped.group);
    M.guards.push(ped);
  }
}
function guardsAlive() { return M.guards.filter(g => !g.down && g.hp > 0).length; }

function updateObjective() {
  const m = M.active;
  if (!m) { setObjectiveIdle(); return; }
  const st = m.steps[M.step];
  let text = st.text;
  if (st.kind === 'shoot') text = st.text.replace(/\(\d+\/\d+\)/, '(' + (st.count - guardsAlive()) + '/' + st.count + ')');
  const tx = st.x !== undefined ? st.x : (st.kind === 'stealcar' && M.targetCar ? M.targetCar.x : null);
  const tz = st.z !== undefined ? st.z : (st.kind === 'stealcar' && M.targetCar ? M.targetCar.z : null);
  S.objective = { x: tx, z: tz, text: m.title + ' — ' + text };
  if (tx !== null && tx !== undefined) {
    M.beam.visible = true; M.marker.visible = true;
    M.beam.position.x = tx; M.beam.position.z = tz;
    M.marker.position.x = tx; M.marker.position.z = tz;
  } else { M.beam.visible = false; M.marker.visible = false; }
}

function completeStep() {
  const m = M.active;
  M.step++;
  // ambush guards scripted to spawn when the PREVIOUS step finished
  const next = m.steps[M.step];
  if (next && next.kind === 'shoot' && next.spawnOnPrev) { /* spawned in beginStep */ }
  if (M.step >= m.steps.length) completeMission();
  else beginStep();
}
function completeMission() {
  const m = M.active;
  S.cash += m.pay;
  cashSnd();
  addRespect(m.respect, districtAt(m.at.x, m.at.z).name);
  S.missionDone++;
  if (S.onToast) S.onToast('MISSION COMPLETE — "' + m.title + '"  +' + '$' + m.pay + '  ·  +' + m.respect + ' respect');
  const wasFinale = M.idx === MISSIONS.length - 1;
  M.active = null; M.guards = []; M.targetCar = null;
  M.idx++;
  if (wasFinale && S.showDialogue) {
    S.showDialogue([
      { who: 'Maya Voss', text: 'You did it. The bay is yours now — every crew, every corner. Solara Bay has a new name at the top.' },
      { who: 'Maya Voss', text: 'Keep the lights on for me, Kingpin. — M.' },
    ], null);
  }
  if (S.onMissionComplete) S.onMissionComplete();
  setObjectiveIdle();
}

export function updateMissions(dt) {
  const pl = S.playerRef;
  if (!pl) return;
  if (M.marker) M.marker.rotation.y += dt;
  // idle: standing in the giver's beam starts the next mission
  if (!M.active) {
    if (!S.objective) setObjectiveIdle();
    if (M.idx < MISSIONS.length && !S.uiOpen && !pl.inCar && !pl.inBoat && !S.over) {
      const m = MISSIONS[M.idx];
      if (dist(pl.x, pl.z, m.at.x, m.at.z) < 3.2) startMission(M.idx);
    }
    return;
  }
  if (S.uiOpen) return; // dialogue is playing
  const st = M.active.steps[M.step];
  if (!st) return;
  // guard behaviour for shoot steps
  if (st.kind === 'shoot') {
    for (const g of M.guards) {
      if (g.down || g.hp <= 0) continue;
      const d = dist(g.x, g.z, pl.x, pl.z);
      g.heading = Math.atan2(pl.x - g.x, pl.z - g.z);
      if (d > 13) {
        g.x += Math.sin(g.heading) * 4.4 * dt;
        g.z += Math.cos(g.heading) * 4.4 * dt;
        g.animSpeed = 4.4;
      } else g.animSpeed = 0;
      g.group.position.set(g.x, 0, g.z);
      g.group.rotation.y = g.heading;
      g.shootCd -= dt;
      if (g.shootCd <= 0 && d < 32 && !losBlocked(g.x, g.z, pl.x, pl.z)) {
        g.shootCd = 1.15 + Math.random() * 0.5;
        fireHitscan({ x: g.x, y: 1.4, z: g.z }, g.heading, 0, { range: 34, damage: 6, owner: 'enemy', kind: 'pistol', accuracy: 0.38 });
      }
    }
    if (guardsAlive() === 0) { completeStep(); return; }
    updateObjective();
    return;
  }
  let done = false;
  switch (st.kind) {
    case 'getcar': done = !!pl.inCar; break;
    case 'stealcar':
      if (M.targetCar && pl.inCar === M.targetCar) {
        if (!M.triggered && st.triggerWanted) { reportCrime(st.triggerWanted, pl.x, pl.z); M.triggered = true; }
        done = true;
      }
      break;
    case 'drive': done = !!pl.inCar && dist(pl.x, pl.z, st.x, st.z) < st.r; break;
    case 'boat': done = !!pl.inBoat && dist(pl.x, pl.z, st.x, st.z) < st.r; break;
    case 'goto': done = !pl.inCar && !pl.inBoat && dist(pl.x, pl.z, st.x, st.z) < st.r; break;
    case 'pickup':
      if (!pl.inCar && dist(pl.x, pl.z, st.x, st.z) < st.r) {
        M.waitT += dt;
        if (M.waitT >= (st.wait || 2)) done = true;
      } else M.waitT = 0;
      break;
    case 'escape':
      if (st.triggerWanted && !M.triggered) { reportCrime(st.triggerWanted, pl.x, pl.z); M.triggered = true; }
      done = M.triggered && S.wanted === 0;
      break;
  }
  if (done) completeStep();
}

export function missionIndex() { return M.idx; }
export function setMissionIndex(i) { M.idx = clamp(i, 0, MISSIONS.length); setObjectiveIdle(); }
