/**
 * Guard on the reel data: re-reads slotopol's cashfarm_data.yaml and checks
 * that the committed src/engine/config/reelSets.ts still says exactly the same
 * thing. The file is generated (src/sim/genReels.mjs), so this catches a hand
 * edit or a bad merge rather than a transcription slip.
 *
 * Run: npm run sim:reels
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAW_REEL_SETS } from '../engine/config/reelSets';
import { SYMBOL_ORDER } from '../engine/types';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const yaml = fs.readFileSync(path.join(root, 'slotopol', 'cashfarm_data.yaml'), 'utf8');

interface YamlSet {
  rtp: number;
  reels: number[][];
}
const sets: YamlSet[] = [];
for (const raw of yaml.split(/\r?\n/)) {
  const line = raw.trim();
  if (line.startsWith('#')) continue;
  const head = /^(\d+\.\d+):$/.exec(line);
  if (head) {
    sets.push({ rtp: Number(head[1]), reels: [] });
    continue;
  }
  const reel = /^-\s*\[(.+?)\]/.exec(line);
  if (reel && sets.length) {
    sets[sets.length - 1].reels.push(reel[1].split(',').map((n) => Number(n.trim())));
  }
}

let bad = 0;
const fail = (msg: string): void => {
  console.error('MISMATCH: ' + msg);
  bad++;
};

if (sets.length !== RAW_REEL_SETS.length) {
  fail(`yaml has ${sets.length} sets, reelSets.ts has ${RAW_REEL_SETS.length}`);
}

for (let i = 0; i < Math.min(sets.length, RAW_REEL_SETS.length); i++) {
  const y = sets[i];
  const ours = RAW_REEL_SETS[i];
  if (y.rtp !== ours.rtp) fail(`set ${i}: rtp ${ours.rtp} should be ${y.rtp}`);
  if (y.reels.length !== ours.reels.length) {
    fail(`set ${y.rtp}: ${ours.reels.length} reels, yaml has ${y.reels.length}`);
    continue;
  }
  for (let r = 0; r < y.reels.length; r++) {
    const a = ours.reels[r].join(',');
    const b = y.reels[r].join(',');
    if (a !== b) fail(`set ${y.rtp} reel ${r + 1} differs from the yaml`);
    for (const id of y.reels[r]) {
      if (!SYMBOL_ORDER[id - 1]) fail(`set ${y.rtp} reel ${r + 1}: symbol id ${id} is not mapped`);
    }
  }
}

const total = RAW_REEL_SETS.reduce((n, s) => n + s.reels.reduce((m, r) => m + r.length, 0), 0);
if (bad === 0) {
  console.log(`OK: ${RAW_REEL_SETS.length} reel sets, ${total} symbols, identical to slotopol's yaml`);
} else {
  console.error(`${bad} problems found`);
  process.exit(1);
}
