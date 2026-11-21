// hud.js — everything drawn over the 3D world: health and armour bars, cash,
// the VBPD star row, weapon and ammo, speedo, game clock, respect rank, the
// bust meter, objective line, contextual interact hints, crew status chips,
// toasts, dialogue cards for the story, and the live canvas minimap — a
// pre-rendered street map with player arrow and blips for police, the
// helicopter, traffic, crew, shops and the current objective.

import { S, el, clamp, fmtCash, fmtClock } from './util.js';
import { LINES, districtAt, POIS } from './world.js';
import { W, WEAPONS } from './weapons.js';
import { rankName, rankProgress } from './progression.js';
import { CREW } from './crew.js';
import { pressed } from './input.js';

const H = { els: {}, toastT: 0, dlg: null, dlgT: 0, lastDistrict: '', mapStatic: null, prevMouse: false, cashShown: -1 };

export function initHUD() {
  for (const id of ['hpFill', 'armFill', 'cash', 'stars', 'weaponName', 'ammo', 'speedBox', 'speed', 'clock', 'district', 'objective', 'bustWrap', 'bustFill', 'rankName', 'rankFill', 'toast', 'stationFlash', 'dialogue', 'dlgName', 'dlgText', 'interactHint', 'crewHud', 'crosshair', 'minimap', 'wantedLabel'])
    H.els[id] = el(id);
  S.onToast = (msg) => toast(msg);
  S.showDialogue = (lines, cb) => showDialogue(lines, cb);
  buildMapStatic();
}

export function toast(msg) {
  if (!H.els.toast) return;
  H.els.toast.textContent = msg;
  H.els.toast.classList.add('show');
  H.toastT = 2.8;
}

export function showDialogue(lines, cb) {
  if (!lines || !lines.length) { if (cb) cb(); return; }
  H.dlg = { lines, idx: 0, cb };
  S.uiOpen = true;
  H.dlgT = 0;
  renderDlgLine();
}
function renderDlgLine() {
  const d = H.dlg; if (!d) return;
  const line = d.lines[d.idx];
  H.els.dlgName.textContent = line.who;
  H.els.dlgText.textContent = line.text;
  H.els.dialogue.classList.add('open');
}
function advanceDialogue() {
  const d = H.dlg; if (!d) return;
  d.idx++; H.dlgT = 0;
  if (d.idx >= d.lines.length) {
    H.dlg = null;
    H.els.dialogue.classList.remove('open');
    S.uiOpen = false;
    if (d.cb) d.cb();
  } else renderDlgLine();
}

function buildMapStatic() {
  const c = document.createElement('canvas');
  c.width = c.height = 736; // world -368..368 at 1px per unit
  const g = c.getContext('2d');
  const W2 = (v) => v + 368;
  g.fillStyle = '#0d5a74'; g.fillRect(0, 0, 736, 736);                       // water
  g.fillStyle = '#d9bd8a'; g.fillRect(W2(-310), W2(-310), 620, 620);         // island sand
  g.fillStyle = '#33373d'; g.fillRect(W2(-274), W2(-274), 548, 548);         // asphalt
  g.strokeStyle = '#565d66'; g.lineWidth = 13;
  for (const l of LINES) {
    g.beginPath(); g.moveTo(W2(l), W2(-274)); g.lineTo(W2(l), W2(274)); g.stroke();
    g.beginPath(); g.moveTo(W2(-274), W2(l)); g.lineTo(W2(274), W2(l)); g.stroke();
  }
  g.fillStyle = '#8a6a44'; g.fillRect(W2(-6), W2(286), 13, 72);              // pier
  g.fillStyle = 'rgba(255,201,60,0.25)';
  g.fillRect(W2(POIS.casino.x - 17), W2(POIS.casino.z - 12), 34, 24);
  g.fillStyle = 'rgba(126,195,255,0.3)';
  g.fillRect(W2(POIS.hq.x - 15), W2(POIS.hq.z - 11), 30, 22);
  H.mapStatic = c;
}

function drawMinimap() {
  const cv = H.els.minimap; if (!cv || !H.mapStatic) return;
  const g = cv.getContext('2d');
  const pl = S.playerRef; if (!pl) return;
  const size = cv.width, half = size / 2, view = 150; // world units across
  const scale = size / view;
  const sx = clamp(pl.x - view / 2, -368, 368 - view), sz = clamp(pl.z - view / 2, -368, 368 - view);
  g.clearRect(0, 0, size, size);
  g.drawImage(H.mapStatic, sx + 368, sz + 368, view, view, 0, 0, size, size);
  const px = (x) => (x - sx) * scale, pz = (z) => (z - sz) * scale;
  const dot = (x, z, color, r) => { g.fillStyle = color; g.beginPath(); g.arc(px(x), pz(z), r || 3, 0, 7); g.fill(); };
  // shops
  g.fillStyle = '#ffb14e';
  for (const s of [POIS.gunShop, POIS.garageShop, POIS.foodShop, POIS.foodShop2]) g.fillRect(px(s.x) - 2.5, pz(s.z) - 2.5, 5, 5);
  // traffic (grey) and police (blue), helicopter (white)
  for (const car of S.cars) {
    if (car.removeMe) continue;
    if (car.isCop) dot(car.x, car.z, '#3f8cff', 3.4);
    else if (car.driver && car.driver !== 'player') dot(car.x, car.z, '#9aa2ab', 2.2);
  }
  for (const u of S.cops) if (u.kind === 'foot' && u.ped && !u.ped.down) dot(u.ped.x, u.ped.z, '#7ec3ff', 2.6);
  if (S.heliRef && S.heliRef.active) dot(S.heliRef.x, S.heliRef.z, '#ffffff', 3.4);
  // crew (green)
  if (CREW.rico.ped && CREW.rico.activeT > 0) dot(CREW.rico.ped.x, CREW.rico.ped.z, '#53ff7a', 3);
  if (CREW.zara.ped && CREW.zara.activeT > 0) dot(CREW.zara.ped.x, CREW.zara.ped.z, '#53ff7a', 3);
  // objective (gold diamond)
  if (S.objective && S.objective.x !== undefined && S.objective.x !== null) {
    const ox = px(S.objective.x), oz = pz(S.objective.z);
    g.fillStyle = '#ffc93c';
    g.save(); g.translate(clamp(ox, 6, size - 6), clamp(oz, 6, size - 6)); g.rotate(Math.PI / 4);
    g.fillRect(-4.4, -4.4, 8.8, 8.8); g.restore();
  }
  // player arrow
  g.save();
  g.translate(px(pl.x), pz(pl.z));
  g.rotate(pl.heading);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(0, -7); g.lineTo(4.6, 5.5); g.lineTo(0, 2.6); g.lineTo(-4.6, 5.5); g.closePath(); g.fill();
  g.restore();
}

export function updateHUD(dt) {
  const pl = S.playerRef;
  if (!pl || !H.els.hpFill) return;
  // dialogue advance: E, click, or auto after the line has had time to read
  if (H.dlg) {
    H.dlgT += dt;
    const line = H.dlg.lines[H.dlg.idx];
    const auto = Math.min(4.2, 1.5 + line.text.length * 0.028);
    const clickEdge = S.mouseDown && !H.prevMouse;
    if (pressed('KeyE') || clickEdge || H.dlgT > auto) advanceDialogue();
  }
  H.prevMouse = !!S.mouseDown;
  if (H.toastT > 0) { H.toastT -= dt; if (H.toastT <= 0) H.els.toast.classList.remove('show'); }
  // vitals
  H.els.hpFill.style.width = clamp(pl.health, 0, 100) + '%';
  H.els.hpFill.style.background = pl.health < 28 ? '#e33' : '#4caf50';
  H.els.armFill.style.width = clamp(pl.armour, 0, 100) + '%';
  if (S.cash !== H.cashShown) { H.cashShown = S.cash; H.els.cash.textContent = fmtCash(S.cash); }
  // stars
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < S.wanted ? '★' : '☆';
  if (H.els.stars.textContent !== stars) H.els.stars.textContent = stars;
  H.els.stars.classList.toggle('hot', S.wanted >= 3);
  H.els.wantedLabel.textContent = S.wanted > 0 ? (S.seenNow ? 'VBPD — IN PURSUIT' : 'VBPD — SEARCHING') : '';
  // weapon + ammo
  H.els.weaponName.textContent = WEAPONS[W.current].name;
  H.els.ammo.textContent = W.current === 'fists' ? '∞' : String(W.ammo[W.current]);
  // speed + clock
  if (pl.inCar) {
    H.els.speedBox.style.display = 'block';
    H.els.speed.textContent = Math.round(Math.abs(pl.inCar.speed) * 3.6) + ' km/h · ' + pl.inCar.cls.name;
  } else if (pl.inBoat) {
    H.els.speedBox.style.display = 'block';
    H.els.speed.textContent = Math.round(Math.abs(pl.inBoat.speed) * 3.6) + ' km/h · Marina Skiff';
  } else H.els.speedBox.style.display = 'none';
  H.els.clock.textContent = fmtClock(S.timeMin) + ' · Day ' + S.day;
  const dName = districtAt(pl.x, pl.z).name;
  if (dName !== H.lastDistrict) {
    H.lastDistrict = dName;
    H.els.district.textContent = dName;
    H.els.district.classList.add('show');
    setTimeout(() => H.els.district.classList.remove('show'), 2400);
  }
  // objective
  H.els.objective.textContent = S.objective ? S.objective.text : '';
  // bust meter
  if (S.bust > 0.02) {
    H.els.bustWrap.style.display = 'block';
    H.els.bustFill.style.width = (S.bust * 100) + '%';
  } else H.els.bustWrap.style.display = 'none';
  // respect
  H.els.rankName.textContent = 'Respect: ' + rankName();
  H.els.rankFill.style.width = (rankProgress() * 100) + '%';
  // radio flash
  if (S.radioFlashT > 0) {
    S.radioFlashT -= dt;
    H.els.stationFlash.textContent = '♪ ' + (S.radioName || '');
    H.els.stationFlash.classList.add('show');
  } else H.els.stationFlash.classList.remove('show');
  // crew chips
  const chips = [];
  for (const who of ['rico', 'zara']) {
    const c = CREW[who];
    const label = who === 'rico' ? '6 Rico' : '7 Zara';
    chips.push(label + (c.activeT > 0 ? ' · out ' + Math.ceil(c.activeT) + 's' : c.cd > 0 ? ' · ' + Math.ceil(c.cd) + 's' : ' · ready'));
  }
  H.els.crewHud.textContent = chips.join('   ');
  // interact hint
  let hint = '';
  if (S.nearShop) hint = 'E — Enter ' + S.nearShop.name;
  else if (!pl.inCar && !pl.inBoat && S.mode === 'play' && !S.uiOpen) hint = 'F — enter car/boat · E — use · Q — weapons';
  H.els.interactHint.textContent = hint;
  // crosshair
  H.els.crosshair.style.display = (!pl.inCar && !pl.inBoat && S.mode === 'play' && !S.uiOpen) ? 'block' : 'none';
  drawMinimap();
}
