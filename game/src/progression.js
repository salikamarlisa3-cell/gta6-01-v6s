// progression.js — your name on the street. Respect points flow in from
// story missions, activities and district work, and climb a ladder of named
// ranks — Nobody, Runner, Hustler, Enforcer, Shot Caller, Kingpin. Rank is
// not vanity: it discounts the shops, unlocks their gated stock, speeds up
// wanted decay, upgrades the crew, and turns the Marina Safehouse into a
// real bolt-hole (armour refill, fast heat loss, a save point). District
// standing tracks where in Solara Bay you are loved or feared.

import { S, clamp } from './util.js';
import { DISTRICTS, POIS } from './world.js';

export const RANKS = [
  { name: 'Nobody', need: 0 },
  { name: 'Runner', need: 60 },
  { name: 'Hustler', need: 160 },
  { name: 'Enforcer', need: 320 },
  { name: 'Shot Caller', need: 560 },
  { name: 'Kingpin', need: 900 },
];
export const PROG = { respect: 0, standing: {}, safehouseCd: 0, insideT: 0 };

export function rankIdx() {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (PROG.respect >= RANKS[i].need) idx = i;
  return idx;
}
export function rankName() { return RANKS[rankIdx()].name; }
export function rankProgress() {
  const i = rankIdx();
  if (i >= RANKS.length - 1) return 1;
  const cur = RANKS[i].need, next = RANKS[i + 1].need;
  return clamp((PROG.respect - cur) / (next - cur), 0, 1);
}
export function shopDiscount() { return rankIdx() >= 2 ? 0.10 : 0; }

export function addRespect(n, districtName) {
  const before = rankIdx();
  PROG.respect += n;
  if (districtName) {
    PROG.standing[districtName] = clamp((PROG.standing[districtName] || 0) + n * 0.6, -100, 100);
  }
  S.decayBonus = rankIdx() >= 4;
  if (rankIdx() > before && S.onToast) {
    S.onToast('RESPECT RANK UP — ' + rankName() + '! New stock and perks unlocked');
  }
}
export function addStanding(districtName, n) {
  PROG.standing[districtName] = clamp((PROG.standing[districtName] || 0) + n, -100, 100);
}

let marker = null;
export function initProgression(scene) {
  for (const d of DISTRICTS) if (PROG.standing[d.name] === undefined) PROG.standing[d.name] = 0;
  const geo = new THREE.RingGeometry(1.6, 2.1, 28);
  geo.rotateX(-Math.PI / 2);
  marker = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x8affd1, transparent: true, opacity: 0.8 }));
  marker.position.set(POIS.safehouse.x, 0.12, POIS.safehouse.z - 2);
  scene.add(marker);
  S.decayBonus = rankIdx() >= 4;
}

export function updateProgression(dt, t) {
  if (marker) { marker.rotation.y += dt * 0.8; marker.material.opacity = 0.55 + Math.sin(t * 3) * 0.25; }
  PROG.safehouseCd -= dt;
  const pl = S.playerRef;
  if (!pl) { S.inSafehouse = false; return; }
  const dx = pl.x - POIS.safehouse.x, dz = pl.z - (POIS.safehouse.z - 2);
  const inside = Math.hypot(dx, dz) < 3.4 && !pl.inCar && !pl.inBoat;
  if (inside && !S.inSafehouse) {
    S.inSafehouse = true;
    if (S.onSafehouse) S.onSafehouse();
    if (S.onToast) S.onToast('Safehouse — heat fades fast here' + (rankIdx() >= 3 ? ' · armour refilled' : ''));
    if (rankIdx() >= 3 && PROG.safehouseCd <= 0) {
      pl.armour = 100; PROG.safehouseCd = 60;
    }
  } else if (!inside) S.inSafehouse = false;
}
