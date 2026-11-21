// radio.js — the in-car radio. Three procedural WebAudio stations, each a
// tiny step-sequencer with its own personality: Neon FM runs a synthwave
// arpeggio over a pad, Solara Latina plays a clave-and-bass groove, and
// Bay Talk 88.1 is mostly static, beeps and a muffled voice-like warble.
// The radio only lives while you drive; R cycles stations (and off), the
// station name flashes on the HUD, and the engine and sirens keep playing
// underneath because they are separate chains in audio.js.

import { S } from './util.js';
import { audioCtx, masterGain } from './audio.js';
import { pressed } from './input.js';

export const STATIONS = [
  { name: 'Neon FM', desc: 'synthwave', style: 'synth' },
  { name: 'Solara Latina', desc: 'groove', style: 'latin' },
  { name: 'Bay Talk 88.1', desc: 'talk & static', style: 'talk' },
];
export const RADIO = { idx: 0, on: false, step: 0, stepT: 0, driving: false };

function tone(freq, dur, gain, type, slideTo) {
  const ctx = audioCtx(); if (!ctx || !masterGain()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = type || 'square';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(masterGain());
  o.start(t); o.stop(t + dur + 0.03);
}
function noiseHit(dur, freq, gain) {
  const ctx = audioCtx(); if (!ctx || !masterGain()) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(masterGain());
  src.start(t);
}

const ARP = [220, 261.63, 329.63, 440, 329.63, 261.63, 293.66, 392];
const BASS = [110, 110, 130.81, 98];
export function stationName() { return RADIO.on ? STATIONS[RADIO.idx].name + ' — ' + STATIONS[RADIO.idx].desc : 'Radio off'; }
export function nextStation() {
  RADIO.idx++;
  if (RADIO.idx >= STATIONS.length) { RADIO.idx = 0; RADIO.on = false; }
  else RADIO.on = true;
  RADIO.step = 0; RADIO.stepT = 0;
  S.radioName = stationName();
  S.radioFlashT = 2.4;
  return stationName();
}
export function setDriving(on) {
  RADIO.driving = on;
  if (on && !RADIO.on && RADIO.idx >= 0) { RADIO.on = true; S.radioName = stationName(); S.radioFlashT = 2.4; }
  if (!on) RADIO.on = false;
}

export function updateRadio(dt) {
  if (S.playerCar && pressed('KeyR') && S.mode === 'play' && !S.uiOpen) nextStation();
  if (!RADIO.on || !RADIO.driving || !audioCtx()) return;
  RADIO.stepT -= dt;
  if (RADIO.stepT > 0) return;
  const st = STATIONS[RADIO.idx].style;
  const s = RADIO.step;
  if (st === 'synth') {
    RADIO.stepT = 0.19;
    tone(ARP[s % ARP.length], 0.16, 0.05, 'square');
    if (s % 8 === 0) tone(BASS[(s / 8) % 4] * 0.5, 1.4, 0.045, 'triangle');
    if (s % 4 === 2) noiseHit(0.05, 6000, 0.02);
  } else if (st === 'latin') {
    RADIO.stepT = 0.155;
    const clave = [0, 3, 6, 10, 12].includes(s % 16);
    if (clave) noiseHit(0.04, 2500, 0.06);
    if (s % 4 === 0) tone(BASS[(s / 4) % 4], 0.3, 0.07, 'triangle');
    if (s % 8 === 4) tone(523.25, 0.12, 0.03, 'square');
    if (s % 2 === 0) noiseHit(0.03, 5000, 0.015);
  } else {
    RADIO.stepT = 0.24;
    noiseHit(0.2, 1200, 0.012);
    if (s % 5 === 0) tone(180 + Math.random() * 60, 0.5, 0.035, 'sawtooth', 120);
    if (s % 23 === 0) { tone(880, 0.09, 0.04, 'square'); setTimeout(() => tone(880, 0.09, 0.04, 'square'), 140); }
  }
  RADIO.step++;
}
