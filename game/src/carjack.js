// carjack.js — stealing cars, in two flavours. An empty parked car is a
// quiet crime: slip in, and only a witness makes it heat. An OCCUPIED car
// is a carjacking: the driver is dragged out onto the asphalt and decides
// in the moment — most run screaming, some swing at you — the alarm may
// start wailing, and anyone watching will tell the VBPD. Police cars with
// an officer inside are simply locked; an empty one is grand theft auto
// with extra steps.

import { S, rng, dist } from './util.js';
import { pedFlee } from './pedestrians.js';
import { crashSnd } from './audio.js';

function crime(level, x, z, loud) {
  if (S.crimeQueue) S.crimeQueue.push({ level, x, z, loud: !!loud });
}
function witnessesNear(x, z, r) {
  for (const ped of S.peds) {
    if (ped.down || ped.inCar) continue;
    if (dist(ped.x, ped.z, x, z) < r) return true;
  }
  return S.cops.length > 0 && S.cops.some(c => {
    const e = c.car || c.ped;
    return e && dist(e.x, e.z, x, z) < r + 8;
  });
}

// Attempts to put the player in `car`. Returns true on success.
export function attemptEnterCar(car, scene) {
  const pl = S.playerRef;
  if (!pl || car.exploded) return false;
  // an officer behind the wheel means the doors stay shut
  if (car.isCop && car.copUnit && !car.copUnit.dead) {
    if (S.onToast) S.onToast('Locked — VBPD officer inside');
    return false;
  }
  const driverPed = (car.driver && car.driver !== 'player') ? car.driver : null;
  if (driverPed) {
    // --- the carjacking: drag the driver out ------------------------------
    const side = (pl.x - car.x) * Math.cos(car.heading) - (pl.z - car.z) * Math.sin(car.heading) > 0 ? 1 : -1;
    const rx = -Math.cos(car.heading) * side, rz = Math.sin(car.heading) * side;
    driverPed.inCar = null;
    driverPed.x = car.x + rx * 2.0; driverPed.z = car.z + rz * 2.0;
    driverPed.group.position.set(driverPed.x, 0, driverPed.z);
    driverPed.group.rotation.x = 0;
    car.driver = null;
    crashSnd(0.25);
    if (rng() < 0.55) {
      pedFlee(driverPed, pl.x, pl.z, 5.5);
      if (S.onToast) S.onToast('Carjacked! The driver fled');
    } else {
      driverPed.state = 'fight'; driverPed.fightLife = 6; driverPed.fightT = 0.4;
      if (S.onToast) S.onToast('The driver is fighting back!');
    }
    // alarm: a wailing car draws every eye on the street
    if (rng() < 0.45) { car.alarmT = 7; crime(2, car.x, car.z, true); }
    else if (witnessesNear(car.x, car.z, 24)) crime(1, car.x, car.z, false);
    else crime(1, car.x, car.z, false); // the victim themselves will call it in
  } else {
    // --- the quiet steal ----------------------------------------------------
    if (car.isCop) crime(3, car.x, car.z, true);
    else if (witnessesNear(car.x, car.z, 22)) crime(1, car.x, car.z, false);
  }
  car.driver = 'player';
  car.parked = false;
  S.playerCar = car;
  pl.inCar = car;
  pl.x = car.x; pl.z = car.z; pl.heading = car.heading;
  pl.group.visible = false;
  return true;
}

export function exitCar() {
  const pl = S.playerRef, car = S.playerCar;
  if (!pl || !car) return;
  const rx = -Math.cos(car.heading), rz = Math.sin(car.heading);
  pl.x = car.x + rx * 2.1; pl.z = car.z + rz * 2.1;
  pl.heading = car.heading;
  pl.inCar = null;
  car.driver = null;
  if (car.copUnit && !car.copUnit.dead) { /* officer reclaims below in police update */ }
  S.playerCar = null;
  pl.group.visible = true;
  pl.group.position.set(pl.x, 0, pl.z);
}
