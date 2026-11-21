// weapons.js — the arsenal and its wheel. Five slots: fists, P-9 pistol,
// Raptor SMG (automatic), Boomstick shotgun (six pellets), Longshot rifle
// (long range, heavy damage). Each gun has its own damage / fire-rate /
// range / spread and its own ammo pool; ammo pickups glow around the city.
// Hold Q or Tab for the radial wheel (mouse aims the highlight, release to
// pick), or tap number keys 1-5. Firing itself goes through combat.js.

import { S, clamp, el } from './util.js';
import { fireHitscan, meleeSwing } from './combat.js';
import { keys } from './input.js';
import { pickupSnd } from './audio.js';

export const WEAPONS = {
  fists:   { name: 'Fists',          slot: 1, dmg: 13, rate: 0.42, range: 2,   spread: 0,    pellets: 1, auto: false, price: 0 },
  pistol:  { name: 'P-9 Pistol',     slot: 2, dmg: 16, rate: 0.30, range: 62,  spread: 0.012, pellets: 1, auto: false, price: 350 },
  smg:     { name: 'Raptor SMG',     slot: 3, dmg: 9,  rate: 0.085, range: 46, spread: 0.035, pellets: 1, auto: true,  price: 900 },
  shotgun: { name: 'Boomstick',      slot: 4, dmg: 11, rate: 0.85, range: 24,  spread: 0.085, pellets: 6, auto: false, price: 1500 },
  rifle:   { name: 'Longshot Rifle', slot: 5, dmg: 44, rate: 0.72, range: 115, spread: 0.002, pellets: 1, auto: false, price: 2600 },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];

export const W = {
  owned: { fists: true, pistol: true, smg: false, shotgun: false, rifle: false },
  ammo: { pistol: 70, smg: 0, shotgun: 0, rifle: 0 },
  current: 'pistol',
  cd: 0,
  wheelOpen: false,
  wheelPick: 'pistol',
};

export function giveWeapon(id, ammoAdd) {
  W.owned[id] = true;
  if (ammoAdd && W.ammo[id] !== undefined) W.ammo[id] += ammoAdd;
}
export function selectWeapon(id) {
  if (!W.owned[id]) return false;
  W.current = id;
  return true;
}
export function currentDef() { return WEAPONS[W.current]; }
export function ammoText() {
  if (W.current === 'fists') return '—';
  return String(W.ammo[W.current]);
}

// --- ammo pickups ------------------------------------------------------------
const pickupSpots = [
  { x: 44, z: -30 }, { x: 190, z: -160 }, { x: 2, z: 300 }, { x: 200, z: 74 },
  { x: -196, z: -52 }, { x: -30, z: 96 }, { x: 130, z: -30 }, { x: -90, z: -190 },
];
const pickupMat = new THREE.MeshBasicMaterial({ color: 0x53ff7a });
export function initWeapons(scene) {
  for (const s of pickupSpots) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.5), pickupMat);
    m.position.set(s.x, 0.6, s.z);
    scene.add(m);
    S.pickups.push({ x: s.x, z: s.z, mesh: m, t: 0, active: true });
  }
  buildWheel();
}

function buildWheel() {
  const wheel = el('wheel');
  if (!wheel) return;
  wheel.innerHTML = '';
  WEAPON_ORDER.forEach((id, i) => {
    const d = document.createElement('div');
    d.className = 'wslot'; d.dataset.weapon = id;
    const ang = (i / WEAPON_ORDER.length) * Math.PI * 2 - Math.PI / 2;
    d.style.transform = `translate(${Math.cos(ang) * 86}px, ${Math.sin(ang) * 86}px) translate(-50%,-50%)`;
    d.innerHTML = `<b>${WEAPONS[id].slot}</b><span>${WEAPONS[id].name}</span><i>${W.owned[id] ? (id === 'fists' ? '' : W.ammo[id]) : 'LOCKED'}</i>`;
    wheel.appendChild(d);
  });
}
export function refreshWheel() {
  const wheel = el('wheel');
  if (!wheel) return;
  wheel.querySelectorAll('.wslot').forEach(d => {
    const id = d.dataset.weapon;
    d.classList.toggle('sel', W.wheelPick === id);
    d.classList.toggle('locked', !W.owned[id]);
    const tag = d.querySelector('i');
    if (tag) tag.textContent = W.owned[id] ? (id === 'fists' ? '' : String(W.ammo[id])) : 'LOCKED';
  });
}

let prevMouseDown = false;
export function updateWeapons(dt) {
  W.cd -= dt;
  const pl = S.playerRef;
  // wheel open/close
  const wantWheel = (keys['KeyQ'] || keys['Tab']) && pl && !pl.inCar && !pl.inBoat && S.mode === 'play' && !S.uiOpen;
  if (wantWheel && !W.wheelOpen) { W.wheelOpen = true; W.wheelPick = W.current; el('wheel').classList.add('open'); refreshWheel(); }
  if (!wantWheel && W.wheelOpen) {
    W.wheelOpen = false; el('wheel').classList.remove('open');
    if (W.wheelPick !== W.current) selectWeapon(W.wheelPick);
  }
  if (W.wheelOpen) {
    // highlight by mouse angle from screen centre
    const dx = (S.mouseX || innerWidth / 2) - innerWidth / 2;
    const dy = (S.mouseY || innerHeight / 2) - innerHeight / 2;
    if (Math.hypot(dx, dy) > 24) {
      let a = Math.atan2(dy, dx) + Math.PI / 2;
      if (a < 0) a += Math.PI * 2;
      const idx = Math.floor(((a + Math.PI / WEAPON_ORDER.length) % (Math.PI * 2)) / (Math.PI * 2 / WEAPON_ORDER.length));
      const id = WEAPON_ORDER[clamp(idx, 0, 4)];
      if (id !== W.wheelPick && W.owned[id]) { W.wheelPick = id; refreshWheel(); }
    }
    return; // no firing while choosing
  }
  // number-key quick select
  for (let i = 0; i < 5; i++) {
    if (keys['Digit' + (i + 1)]) selectWeapon(WEAPON_ORDER[i]);
  }
  if (!pl || pl.inCar || pl.inBoat || S.mode !== 'play' || S.paused || S.uiOpen || S.over) { prevMouseDown = false; return; }
  const def = currentDef();
  const down = !!S.mouseDown;
  const trigger = def.auto ? down : (down && !prevMouseDown);
  prevMouseDown = down;
  if (!trigger || W.cd > 0) return;
  if (W.current === 'fists') {
    W.cd = def.rate;
    meleeSwing(pl.x, pl.z, pl.heading, 'player');
    return;
  }
  if (W.ammo[W.current] <= 0) { W.cd = 0.25; return; }
  W.ammo[W.current]--;
  W.cd = def.rate;
  const origin = { x: pl.x + Math.sin(pl.heading) * 0.4, y: 1.45, z: pl.z + Math.cos(pl.heading) * 0.4 };
  fireHitscan(origin, pl.heading, -0.01, {
    range: def.range, damage: def.dmg, spread: def.spread, pellets: def.pellets,
    owner: 'player', kind: W.current,
  });
}

export function updatePickups(dt, t) {
  const pl = S.playerRef;
  for (const p of S.pickups) {
    if (!p.active) {
      p.t -= dt;
      if (p.t <= 0) { p.active = true; p.mesh.visible = true; }
      continue;
    }
    p.mesh.rotation.y += dt * 2;
    p.mesh.position.y = 0.6 + Math.sin(t * 3 + p.x) * 0.12;
    if (pl && !pl.inCar && Math.hypot(pl.x - p.x, pl.z - p.z) < 1.5) {
      const owned = WEAPON_ORDER.filter(id => id !== 'fists' && W.owned[id]);
      if (owned.length) {
        const id = owned[Math.floor(Math.random() * owned.length)];
        const amt = id === 'shotgun' ? 10 : id === 'rifle' ? 12 : 40;
        W.ammo[id] += amt;
        pickupSnd();
        if (S.onToast) S.onToast('+' + amt + ' ' + WEAPONS[id].name + ' ammo');
      } else {
        S.cash += 15;
        if (S.onToast) S.onToast('+$15 loose cash');
      }
      p.active = false; p.mesh.visible = false; p.t = 25;
    }
  }
}
