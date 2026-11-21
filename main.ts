// SOLARA BAY — hand-in program for the make.fun "Make GTA 6" bounty.
//
// The game itself is the static site in game/ (open game/index.html in a
// desktop browser; it runs fully offline — three.js is vendored under
// game/vendor/, everything else is hand-written ES modules in game/src/).
// This program's only job is the hand-in: copy game/ and screenshots/ into
// the output directory (MAKEFUN_OUTPUT_DIR, or /output inside the grader)
// and write dossier.json there with the kit's buildDossier library, capped
// exactly the way the scorer caps it, so a local run fails loudly anywhere
// the real gate would refuse the entry.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's caps: text_max_bytes is the only one that shapes the dossier's
// bytes; the rest exist so this program refuses what the scorer refuses
// (too many or too-large screenshots, too many game files, an oversized
// game tree, or a path too long to name).
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}
function treeBytes(dir) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    total += st.isDirectory() ? treeBytes(p) : st.size;
  }
  return total;
}

copyTree(join(root, 'game'), join(outDir, 'game'));
if (existsSync(join(root, 'screenshots'))) {
  copyTree(join(root, 'screenshots'), join(outDir, 'screenshots'));
} else {
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(outDir, CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossier);

const gameBytes = treeBytes(join(outDir, 'game'));
const shotCount = existsSync(join(outDir, 'screenshots')) ? readdirSync(join(outDir, 'screenshots')).length : 0;
console.log(`SOLARA BAY handed in: game/ ${gameBytes} bytes, ${shotCount} screenshots, dossier ${dossier.length} bytes -> ${outDir}`);
