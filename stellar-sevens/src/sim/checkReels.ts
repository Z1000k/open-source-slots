/**
 * Prove src/engine/config/reelSets.ts still says exactly what
 * slotopol/alwayshot_data.yaml says. The TS file is generated, but it is the
 * file that actually ships, so this re-parses the yaml independently and
 * compares symbol by symbol.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REEL_SETS } from '../engine/config/reelSets';
import { SYMBOL_ORDER, type SymbolId } from '../engine/types';

const YAML = resolve(import.meta.dirname, '../../slotopol/alwayshot_data.yaml');

interface RawSet {
  rtp: number;
  reels: number[][];
}

const raw: RawSet[] = [];
let current: RawSet | null = null;
for (const line of readFileSync(YAML, 'utf8').split(/\r?\n/)) {
  const head = /^(\d+\.\d+):\s*$/.exec(line.trimEnd());
  if (head) {
    current = { rtp: Number(head[1]), reels: [] };
    raw.push(current);
    continue;
  }
  const strip = /^\s*-\s*\[([\d,\s]+)\]\s*$/.exec(line.trimEnd());
  if (strip && current) current.reels.push(strip[1].split(',').map((n) => Number(n.trim())));
}

let problems = 0;
const fail = (msg: string) => {
  problems++;
  console.log(`FAIL ${msg}`);
};

if (raw.length !== REEL_SETS.length) {
  fail(`yaml has ${raw.length} sets, reelSets.ts has ${REEL_SETS.length}`);
}

for (let i = 0; i < Math.min(raw.length, REEL_SETS.length); i++) {
  const y = raw[i];
  const t = REEL_SETS[i];
  if (y.rtp.toFixed(6) !== t.rtp.toFixed(6)) {
    fail(`set ${i}: yaml rtp ${y.rtp} vs ts ${t.rtp}`);
    continue;
  }
  if (y.reels.length !== t.reels.length) {
    fail(`set ${y.rtp}: yaml has ${y.reels.length} reels, ts has ${t.reels.length}`);
    continue;
  }
  for (let x = 0; x < y.reels.length; x++) {
    const want: SymbolId[] = y.reels[x].map((n) => SYMBOL_ORDER[n - 1]);
    const got = t.reels[x];
    if (want.length !== got.length) {
      fail(`set ${y.rtp} reel ${x}: length ${got.length}, yaml says ${want.length}`);
      continue;
    }
    for (let k = 0; k < want.length; k++) {
      if (want[k] !== got[k]) {
        fail(`set ${y.rtp} reel ${x} pos ${k}: ${got[k]}, yaml says ${want[k]}`);
        break;
      }
    }
  }
}

const symbols = new Set<SymbolId>();
for (const s of REEL_SETS) for (const r of s.reels) for (const sym of r) symbols.add(sym);
for (const sym of SYMBOL_ORDER) {
  if (!symbols.has(sym)) fail(`symbol ${sym} never appears on any strip`);
}

console.log(
  problems === 0
    ? `OK  all ${REEL_SETS.length} reel sets match ${YAML} symbol for symbol; ` +
        `all ${SYMBOL_ORDER.length} symbols are in use.`
    : `${problems} problem(s) found.`,
);
process.exit(problems === 0 ? 0 : 1);
