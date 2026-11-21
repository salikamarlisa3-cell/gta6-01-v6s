// save.js — localStorage persistence. One key for the real game and a
// separate one for the self-test so test runs never touch a player's
// progress. Saved on mission completion, at the safehouse, and every twenty
// seconds: cash, story progress, respect and district standing, the arsenal
// and its ammo, position, clock and the race best time.

import { S } from './util.js';
import { PROG } from './progression.js';
import { W } from './weapons.js';
import { missionIndex, setMissionIndex } from './missions.js';
import { teleport } from './player.js';

function key() { return S.testMode ? 'solarabay_v6_test' : 'solarabay_v6_save'; }

export function saveGame() {
  const pl = S.playerRef;
  if (!pl) return;
  const data = {
    cash: S.cash, missionIdx: missionIndex(), respect: PROG.respect,
    standing: PROG.standing, owned: W.owned, ammo: W.ammo, current: W.current,
    px: pl.x, pz: pl.z, heading: pl.heading, timeMin: S.timeMin, day: S.day,
    raceBest: S.raceBest || null, health: pl.health, armour: pl.armour,
  };
  try { localStorage.setItem(key(), JSON.stringify(data)); } catch (e) { /* private mode */ }
}
export function loadGame() {
  try {
    const raw = localStorage.getItem(key());
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
export function hasSave() { return !!loadGame(); }
export function clearSave() { try { localStorage.removeItem(key()); } catch (e) { } }

export function applySave(d) {
  if (!d) return;
  S.cash = d.cash || 0;
  PROG.respect = d.respect || 0;
  if (d.standing) PROG.standing = d.standing;
  setMissionIndex(d.missionIdx || 0);
  S.missionDone = d.missionIdx || 0;
  for (const k of Object.keys(W.owned)) if (d.owned && k in d.owned) W.owned[k] = !!d.owned[k];
  for (const k of Object.keys(W.ammo)) if (d.ammo && k in d.ammo) W.ammo[k] = d.ammo[k] | 0;
  if (d.current && W.owned[d.current]) W.current = d.current;
  S.timeMin = d.timeMin || 615; S.day = d.day || 1;
  S.raceBest = d.raceBest || null;
  const pl = S.playerRef;
  if (pl) {
    pl.health = d.health || 100; pl.armour = d.armour || 0;
    teleport(d.px !== undefined ? d.px : pl.x, d.pz !== undefined ? d.pz : pl.z, d.heading || 0);
  }
  S.decayBonus = false;
}
