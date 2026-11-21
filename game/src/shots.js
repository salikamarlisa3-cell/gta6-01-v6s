// shots.js — deterministic staged scenes for the four store screenshots.
// ?shot=cover|drive|chase|night&seed=1 freezes the clock, poses the city,
// the player, traffic, the VBPD and the helicopter, fixes the camera, and
// (via main.js counting frames) raises window.__SHOT_READY when the frame
// is composed. Nothing here runs in normal play.

import { S } from './util.js';
import { POIS } from './world.js';
import { createCar } from './vehicles.js';
import { teleport } from './player.js';
import { HELI, setAirActive } from './airunit.js';
import { M } from './missions.js';
import { RADIO } from './radio.js';

function cam(x, y, z, lx, ly, lz) { S.shotCam = { x, y, z, lx, ly, lz }; }

export function stageShot(name) {
  S.shotMode = true;
  S.freezeClock = true;
  const pl = S.playerRef;
  const scene = S.sceneRef;
  if (name === 'cover') {
    S.timeMin = 16 * 60 + 50; // late-afternoon sun, windows just catching light
    const car = createCar('vyper', 27, 239, 0.7, { color: 0xc23b2e });
    scene.add(car.group);
    teleport(23.5, 242, 2.7);
    if (M.beam) { M.beam.visible = false; M.marker.visible = false; } // the giver beam is gameplay furniture, not cover art
    cam(14.5, 2.1, 254, 34, 5, 196);
  } else if (name === 'drive') {
    S.timeMin = 10 * 60 + 20;
    const car = createCar('meridian', 3.1, 46, Math.PI, { color: 0x2e6dc2 });
    scene.add(car.group);
    car.driver = 'player'; S.playerCar = car; pl.inCar = car;
    pl.x = car.x; pl.z = car.z; pl.group.visible = false;
    car.speed = 8;
    const t1 = createCar('taxi', 3.1, 24, Math.PI, {}); scene.add(t1.group);
    const t2 = createCar('comet', -3.1, 72, 0, {}); scene.add(t2.group);
    RADIO.on = true; RADIO.driving = true;
    S.radioName = 'Neon FM — synthwave'; S.radioFlashT = 9999;
    cam(8.8, 3.0, 60, 2.2, 1.2, 32);
  } else if (name === 'chase') {
    S.timeMin = 18 * 60 + 52; // dusk
    S.wanted = 5;
    const car = createCar('bandit', 0, -18, Math.PI, { color: 0x22242a });
    scene.add(car.group);
    car.driver = 'player'; S.playerCar = car; pl.inCar = car;
    pl.x = car.x; pl.z = car.z; pl.heading = Math.PI; pl.group.visible = false;
    car.speed = 14;
    const c1 = createCar('cruiser', -3.4, -4, Math.PI, {}); scene.add(c1.group); c1.speed = 13;
    const c2 = createCar('interceptor', 3.6, -2, Math.PI, {}); scene.add(c2.group); c2.speed = 14;
    const c3 = createCar('cruiser', 0.5, 6, Math.PI, {}); scene.add(c3.group); c3.speed = 12;
    // roadblock across the road ahead
    const b1 = createCar('cruiser', -3.6, -52, Math.PI / 2, {}); scene.add(b1.group);
    const b2 = createCar('cruiser', 3.6, -52, -Math.PI / 2, {}); scene.add(b2.group);
    setAirActive(true);
    HELI.x = 6; HELI.z = -26; HELI.mode = 'tracking'; HELI.alt = 19;
    cam(13, 4.6, -37, -1, 1.2, -17);
  } else if (name === 'night') {
    S.timeMin = 23 * 60 + 12;
    teleport(-192, -44, -2.2);
    // the gold mission beam outside the casino, mid-"Night Market"
    if (M.beam) {
      M.beam.visible = true; M.marker.visible = true;
      M.beam.position.x = -186; M.beam.position.z = -38;
      M.marker.position.x = -186; M.marker.position.z = -38;
    }
    S.objective = { x: -186, z: -38, text: 'Night Market — make the exchange in the alley' };
    const car = createCar('comet', -198, -36, 1.2, { color: 0x3fae5a });
    scene.add(car.group);
    cam(-178, 3.1, -26, -198, 3.5, -50);
  } else {
    teleport(POIS.safehouse.x - 4, POIS.safehouse.z - 16, Math.PI);
    cam(0, 6, 160, 0, 4, 220);
  }
}
