// input.js — raw keyboard + mouse state for every other system. Held keys
// live in `keys` (by KeyboardEvent.code), one-frame edge presses in
// `pressed` (cleared by main at the end of each frame). Mouse movement
// orbits the third-person camera while pointer-locked; the button state
// and cursor position ride on S for weapons.js and the wheel UI.

import { S, clamp } from './util.js';

export const keys = {};
const pressedSet = new Set();
export function pressed(code) { return pressedSet.has(code); }
export function pressKey(code) { pressedSet.add(code); } // self-test hook
export function endFrame() { pressedSet.clear(); }

export function initInput(canvas) {
  addEventListener('keydown', e => {
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (!keys[e.code]) pressedSet.add(e.code);
    keys[e.code] = true;
    if (S.onFirstGesture) S.onFirstGesture();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; S.mouseDown = false; });
  addEventListener('mousemove', e => {
    S.mouseX = e.clientX; S.mouseY = e.clientY;
    if (document.pointerLockElement === canvas) {
      S.camYaw += e.movementX * 0.0026;
      S.camPitch = clamp(S.camPitch + e.movementY * 0.0021, 0.04, 1.15);
    }
  });
  canvas.addEventListener('mousedown', e => {
    if (e.button === 0) S.mouseDown = true;
    if (S.onFirstGesture) S.onFirstGesture();
    if (S.mode === 'play' && !S.uiOpen && document.pointerLockElement !== canvas) {
      try { canvas.requestPointerLock(); } catch (err) { /* headless: fine */ }
    }
  });
  addEventListener('mouseup', e => { if (e.button === 0) S.mouseDown = false; });
  canvas.addEventListener('wheel', e => {
    S.camDist = clamp(S.camDist + Math.sign(e.deltaY) * 0.8, 4.5, 12);
  }, { passive: true });
}
