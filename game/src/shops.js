// shops.js — three businesses that take your cash.
// Ammu-Mart (Downtown) sells the guns, the ammo and body armour.
// Torque & Tone (Cargo Bay) works on the car you bring: a respray that
// shakes two stars of heat, engine tuning, armour plating.
// QuickBite (Marina + North Beach) sells health in two sizes.
// Respect rank gates the serious stock and Hustlers get 10% off. Walk into
// the ring and press E; the menu is a real DOM panel with live prices.

import { S, el, dist, fmtCash } from './util.js';
import { POIS } from './world.js';
import { pressed } from './input.js';
import { WEAPONS, giveWeapon, W } from './weapons.js';
import { rankIdx, rankName, shopDiscount } from './progression.js';
import { setWanted } from './police.js';
import { healPlayer } from './player.js';
import { cashSnd, uiSnd } from './audio.js';

export const SHOPS = [
  { id: 'gun', name: 'Ammu-Mart — Guns & Armour', x: POIS.gunShop.x, z: POIS.gunShop.z + 8, kind: 'gun' },
  { id: 'garage', name: 'Torque & Tone — Garage', x: POIS.garageShop.x, z: POIS.garageShop.z + 8, kind: 'garage' },
  { id: 'food', name: 'QuickBite — Marina', x: POIS.foodShop.x, z: POIS.foodShop.z + 6, kind: 'food' },
  { id: 'food2', name: 'QuickBite — North Beach', x: POIS.foodShop2.x, z: POIS.foodShop2.z + 6, kind: 'food' },
];

const CATALOG = {
  gun: [
    { id: 'w_pistol', label: () => W.owned.pistol ? 'P-9 ammo ×60' : 'P-9 Pistol + 60 rounds', price: 350, rank: 0 },
    { id: 'w_smg', label: () => W.owned.smg ? 'Raptor ammo ×120' : 'Raptor SMG + 120 rounds', price: 900, rank: 1 },
    { id: 'w_shotgun', label: () => W.owned.shotgun ? 'Boomstick shells ×24' : 'Boomstick + 24 shells', price: 1500, rank: 2 },
    { id: 'w_rifle', label: () => W.owned.rifle ? 'Longshot rounds ×24' : 'Longshot Rifle + 24 rounds', price: 2600, rank: 3 },
    { id: 'armour', label: () => 'Body armour (full)', price: 600, rank: 0 },
  ],
  garage: [
    { id: 'respray', label: () => 'Respray — new colour, −2 stars of heat', price: 150, rank: 0 },
    { id: 'tune', label: () => 'Engine tune (level ' + garageTargetLevel('tune') + ')', price: 800, rank: 1 },
    { id: 'plate', label: () => 'Armour plating (level ' + garageTargetLevel('plate') + ')', price: 1200, rank: 2 },
    { id: 'repair', label: () => 'Full repair', price: 300, rank: 0 },
  ],
  food: [
    { id: 'meal', label: () => 'Harbour meal — heal 55', price: 25, rank: 0 },
    { id: 'feast', label: () => 'Kingpin feast — heal 100', price: 60, rank: 0 },
  ],
};
function garageTarget() {
  const pl = S.playerRef;
  if (pl && pl.inCar) return pl.inCar;
  let best = null, bd = 10;
  for (const c of S.cars) { const d = dist(S.playerRef.x, S.playerRef.z, c.x, c.z); if (d < bd) { bd = d; best = c; } }
  return best;
}
function garageTargetLevel(which) {
  const car = garageTarget();
  if (!car) return '—';
  return Math.min(2, (car.upgrades[which] || 0) + 1) + '/2';
}

export const SHOP = { open: null };
const rings = [];

export function initShops(scene) {
  const ringGeo = new THREE.RingGeometry(1.5, 2.05, 24); ringGeo.rotateX(-Math.PI / 2);
  for (const s of SHOPS) {
    const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffb14e, transparent: true, opacity: 0.65 }));
    r.position.set(s.x, 0.12, s.z);
    scene.add(r);
    rings.push(r);
  }
}
function price(item) { return Math.round(item.price * (1 - shopDiscount())); }

export function openShop(shop) {
  SHOP.open = shop;
  S.uiOpen = true;
  const panel = el('shop');
  panel.classList.add('open');
  el('shopTitle').textContent = shop.name;
  renderShopItems();
}
export function closeShop() {
  SHOP.open = null;
  S.uiOpen = false;
  el('shop').classList.remove('open');
}
function renderShopItems() {
  const shop = SHOP.open; if (!shop) return;
  el('shopCash').textContent = 'Cash ' + fmtCash(S.cash) + ' · Rank ' + rankName() + (shopDiscount() ? ' · 10% off' : '');
  const list = el('shopItems');
  list.innerHTML = '';
  for (const item of CATALOG[shop.kind]) {
    const row = document.createElement('div');
    row.className = 'shopRow';
    const locked = rankIdx() < item.rank;
    const p = price(item);
    row.innerHTML = '<span>' + item.label() + (locked ? ' <em>(needs rank ' + ['Nobody', 'Runner', 'Hustler', 'Enforcer', 'Shot Caller', 'Kingpin'][item.rank] + ')</em>' : '') + '</span><b>' + fmtCash(p) + '</b>';
    const btn = document.createElement('button');
    btn.textContent = locked ? 'LOCKED' : (S.cash < p ? 'NO CASH' : 'BUY');
    btn.disabled = locked || S.cash < p;
    btn.addEventListener('click', () => buy(item));
    row.appendChild(btn);
    list.appendChild(row);
  }
  if (shop.kind === 'garage' && !garageTarget()) {
    const note = document.createElement('div');
    note.className = 'shopRow'; note.innerHTML = '<span><em>Bring a car within 10 m to work on it</em></span>';
    list.appendChild(note);
  }
}

export function buy(item) {
  const shop = SHOP.open; if (!shop) return false;
  const p = price(item);
  if (rankIdx() < item.rank || S.cash < p) return false;
  const pl = S.playerRef;
  let ok = true, msg = '';
  switch (item.id) {
    case 'w_pistol': giveWeapon('pistol', 60); msg = 'P-9 ready — 60 rounds'; break;
    case 'w_smg': giveWeapon('smg', 120); msg = 'Raptor SMG ready — 120 rounds'; break;
    case 'w_shotgun': giveWeapon('shotgun', 24); msg = 'Boomstick ready — 24 shells'; break;
    case 'w_rifle': giveWeapon('rifle', 24); msg = 'Longshot ready — 24 rounds'; break;
    case 'armour': pl.armour = 100; msg = 'Armour fitted'; break;
    case 'meal': healPlayer(55); msg = 'You feel human again (+55)'; break;
    case 'feast': healPlayer(100); msg = 'Fully fed (+100)'; break;
    case 'respray': {
      const car = garageTarget(); if (!car) { ok = false; break; }
      const paints = [0xc23b2e, 0x2e6dc2, 0x3fae5a, 0xe0a51c, 0x7a3fa0, 0x1f7a78, 0xd8d8dc];
      car.color = paints[Math.floor(Math.random() * paints.length)];
      car.bodyMat.color.setHex(car.color);
      if (S.wanted > 0) { setWanted(Math.max(0, S.wanted - 2)); S.lastSeen = { x: -999, z: -999 }; S.unseenT = 8; }
      msg = 'Resprayed — the VBPD is looking for a different car now';
      break;
    }
    case 'tune': {
      const car = garageTarget(); if (!car || car.upgrades.tune >= 2) { ok = false; break; }
      car.upgrades.tune++; msg = car.cls.name + ' tuned to level ' + car.upgrades.tune;
      break;
    }
    case 'plate': {
      const car = garageTarget(); if (!car || car.upgrades.plate >= 2) { ok = false; break; }
      car.upgrades.plate++; car.health = Math.min(100, car.health + 40); msg = car.cls.name + ' plated to level ' + car.upgrades.plate;
      break;
    }
    case 'repair': {
      const car = garageTarget(); if (!car) { ok = false; break; }
      car.health = 100; car.dmgState = 0; car.burning = false; msg = car.cls.name + ' fully repaired';
      break;
    }
    default: ok = false;
  }
  if (!ok) { if (S.onToast) S.onToast('Cannot do that right now'); return false; }
  S.cash -= p;
  cashSnd(); uiSnd();
  if (S.onToast) S.onToast(msg);
  renderShopItems();
  return true;
}

export function buyById(kind, id) {
  const item = (CATALOG[kind] || []).find(i => i.id === id);
  if (!item || !SHOP.open) return false;
  return buy(item);
}

export function updateShops(dt) {
  for (const r of rings) r.rotation.y += dt * 0.7;
  const pl = S.playerRef;
  if (!pl) return;
  if (SHOP.open) {
    const s = SHOP.open;
    if (dist(pl.x, pl.z, s.x, s.z) > 7 || pressed('Escape')) closeShop();
    return;
  }
  if (S.uiOpen || S.over || pl.inBoat) return;
  for (const s of SHOPS) {
    if (dist(pl.x, pl.z, s.x, s.z) < 3.1) {
      S.nearShop = s;
      if (pressed('KeyE')) { openShop(s); return; }
      return;
    }
  }
  S.nearShop = null;
}
