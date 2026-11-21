// audio.js — all sound in Solara Bay is procedural WebAudio: no audio files.
// Engine hum follows speed, sirens swell with the nearest unit's distance,
// gunshots / crashes / explosions are shaped noise bursts, rain is filtered
// noise, and a slow synth pad loops as ambient music. The context is created
// lazily on the first user gesture; every call is a safe no-op before that.

import { S, clamp } from './util.js';

const AU = {
  ctx: null, master: null, noiseBuf: null,
  engineOsc: null, engineOsc2: null, engineGain: null, engineOn: false,
  sirenOsc: null, sirenGain: null, sirenPhase: 0,
  rainSrc: null, rainGain: null,
  musicOsc: [], musicGain: null, musicT: 0, chordIdx: 0,
  alarmOn: false, alarmT: 0, alarmOsc: null, alarmGain: null,
};
const CHORDS = [110.0, 87.31, 130.81, 98.0]; // A2 F2 C3 G2 — a lazy coastal loop

export function initAudio() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  try {
    AU.ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { return; }
  const ctx = AU.ctx;
  AU.master = ctx.createGain();
  AU.master.gain.value = S.muted ? 0 : 0.55;
  AU.master.connect(ctx.destination);
  // shared noise buffer
  const len = ctx.sampleRate * 1.2;
  AU.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = AU.noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  // engine: two detuned oscillators through a lowpass
  AU.engineGain = ctx.createGain(); AU.engineGain.gain.value = 0;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
  AU.engineOsc = ctx.createOscillator(); AU.engineOsc.type = 'sawtooth'; AU.engineOsc.frequency.value = 55;
  AU.engineOsc2 = ctx.createOscillator(); AU.engineOsc2.type = 'square'; AU.engineOsc2.frequency.value = 28;
  AU.engineOsc.connect(lp); AU.engineOsc2.connect(lp);
  lp.connect(AU.engineGain); AU.engineGain.connect(AU.master);
  AU.engineOsc.start(); AU.engineOsc2.start();
  // siren: one triangle whose pitch updateAudio wails
  AU.sirenGain = ctx.createGain(); AU.sirenGain.gain.value = 0;
  AU.sirenOsc = ctx.createOscillator(); AU.sirenOsc.type = 'triangle'; AU.sirenOsc.frequency.value = 700;
  AU.sirenOsc.connect(AU.sirenGain); AU.sirenGain.connect(AU.master);
  AU.sirenOsc.start();
  // ambient pad
  AU.musicGain = ctx.createGain(); AU.musicGain.gain.value = 0.0;
  AU.musicGain.connect(AU.master);
  for (let i = 0; i < 2; i++) {
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.value = CHORDS[0] * (i ? 1.5 : 1);
    o.connect(AU.musicGain); o.start(); AU.musicOsc.push(o);
  }
}
export function audioCtx() { return AU.ctx; }
export function masterGain() { return AU.master; }
export function toggleMute() {
  S.muted = !S.muted;
  if (AU.master) AU.master.gain.value = S.muted ? 0 : 0.55;
  return S.muted;
}

function burst(dur, filterType, freq, gain, when) {
  if (!AU.ctx) return;
  const ctx = AU.ctx, t = when || ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = AU.noiseBuf;
  src.playbackRate.value = 0.7 + Math.random() * 0.6;
  const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(AU.master);
  src.start(t); src.stop(t + dur + 0.05);
}
function blip(freq, dur, gain, type, slideTo) {
  if (!AU.ctx) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(AU.master);
  o.start(t); o.stop(t + dur + 0.05);
}

export function shotSnd(kind) {
  if (kind === 'shotgun') { burst(0.22, 'lowpass', 900, 0.5); burst(0.08, 'highpass', 2000, 0.25); }
  else if (kind === 'rifle') { burst(0.16, 'bandpass', 1400, 0.45); }
  else if (kind === 'smg') { burst(0.07, 'bandpass', 1800, 0.3); }
  else if (kind === 'fists') { burst(0.06, 'lowpass', 500, 0.2); }
  else { burst(0.11, 'bandpass', 1600, 0.38); } // pistol
}
export function crashSnd(v) { burst(0.18 + v * 0.25, 'lowpass', 300 + v * 300, 0.25 + v * 0.4); }
export function boomSnd() {
  burst(0.9, 'lowpass', 220, 0.9);
  blip(110, 0.8, 0.5, 'sine', 30);
}
export function pickupSnd() { blip(660, 0.09, 0.18, 'square'); setTimeout(() => blip(990, 0.12, 0.18, 'square'), 70); }
export function cashSnd() { blip(880, 0.08, 0.2, 'square'); setTimeout(() => blip(1320, 0.14, 0.2, 'square'), 80); }
export function hurtSnd() { blip(160, 0.15, 0.25, 'sawtooth', 90); }
export function uiSnd() { blip(520, 0.05, 0.12, 'square'); }

export function setEngine(on, norm) {
  if (!AU.ctx) return;
  AU.engineOn = on;
  const target = on ? 0.05 + norm * 0.05 : 0;
  AU.engineGain.gain.setTargetAtTime(target, AU.ctx.currentTime, 0.08);
  const f = 52 + norm * 175;
  AU.engineOsc.frequency.setTargetAtTime(f, AU.ctx.currentTime, 0.06);
  AU.engineOsc2.frequency.setTargetAtTime(f * 0.5 + 2, AU.ctx.currentTime, 0.06);
}
export function setSiren(level) {
  if (!AU.ctx) return;
  AU.sirenGain.gain.setTargetAtTime(clamp(level, 0, 1) * 0.055, AU.ctx.currentTime, 0.15);
}
export function setRain(on) {
  if (!AU.ctx) return;
  if (on && !AU.rainSrc) {
    const ctx = AU.ctx;
    AU.rainSrc = ctx.createBufferSource(); AU.rainSrc.buffer = AU.noiseBuf; AU.rainSrc.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1600;
    AU.rainGain = ctx.createGain(); AU.rainGain.gain.value = 0;
    AU.rainSrc.connect(f); f.connect(AU.rainGain); AU.rainGain.connect(AU.master);
    AU.rainSrc.start();
  }
  if (AU.rainGain) AU.rainGain.gain.setTargetAtTime(on ? 0.05 : 0, AU.ctx.currentTime, 0.4);
}
export function setAlarm(on) {
  if (!AU.ctx) return;
  if (on && !AU.alarmOsc) {
    const ctx = AU.ctx;
    AU.alarmOsc = ctx.createOscillator(); AU.alarmOsc.type = 'square'; AU.alarmOsc.frequency.value = 920;
    AU.alarmGain = ctx.createGain(); AU.alarmGain.gain.value = 0;
    AU.alarmOsc.connect(AU.alarmGain); AU.alarmGain.connect(AU.master);
    AU.alarmOsc.start();
  }
  AU.alarmOn = on;
  if (!on && AU.alarmGain) AU.alarmGain.gain.value = 0;
}
export function musicOn(on) {
  if (!AU.ctx) return;
  AU.musicGain.gain.setTargetAtTime(on ? 0.035 : 0.0, AU.ctx.currentTime, 0.8);
}

export function updateAudio(dt) {
  if (!AU.ctx) return;
  // siren wail
  if (AU.sirenOsc) {
    AU.sirenPhase += dt * 2.4;
    AU.sirenOsc.frequency.value = 720 + Math.sin(AU.sirenPhase) * 190;
  }
  // car alarm beeping (gated square)
  if (AU.alarmGain) {
    AU.alarmT += dt;
    AU.alarmGain.gain.value = AU.alarmOn ? ((AU.alarmT % 0.6) < 0.3 ? 0.045 : 0) : 0;
  }
  // ambient pad chord drift
  AU.musicT += dt;
  if (AU.musicT > 5.2) {
    AU.musicT = 0;
    AU.chordIdx = (AU.chordIdx + 1) % CHORDS.length;
    const root = CHORDS[AU.chordIdx], t = AU.ctx.currentTime;
    AU.musicOsc[0].frequency.setTargetAtTime(root, t, 1.2);
    AU.musicOsc[1].frequency.setTargetAtTime(root * 1.5, t, 1.2);
  }
}
