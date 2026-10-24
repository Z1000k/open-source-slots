/**
 * Prove src/engine/config/reelSets.ts still says exactly what
 * slotopol/bananasgobahamas_data.yaml says. The TS file is generated, but it
 * is the file that actually ships, so this re-parses the yaml independently
 * and compares symbol by symbol.
 *
 * It also checks the one assumption slotopol's own RTP maths makes about these
 * strips: no strip ever shows two scatters in the same 3-symbol window, so a
 * reel can never contribute more than one SUITCASE to the grid.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BONUS_REELS, REEL_SETS } from '../engine/config/reelSets';
import { SCATTER, SYMBOL_ORDER, ROWS, type SymbolId } from '../engine/types';

const YAML = resolve(import.meta.dirname, '../../slotopol/bananasgobahamas_data.yaml');

interface RawSet {
  rtp: number;
  reels: number[][];
}

const bonusRaw: number[][] = [];
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
  if (strip) {
    const nums = strip[1].split(',').map((n) => Number(n.trim()));
    (current ? current.reels : bonusRaw).push(nums);
  }
}

let problems = 0;
const fail = (msg: string) => {
  problems++;
  console.log(`FAIL ${msg}`);
};

const compare = (want: number[][], got: SymbolId[][], what: string) => {
  if (want.length !== got.length) {
    fail(`${what}: yaml has ${want.length} reels, ts has ${got.length}`);
    return;
  }
  for (let x = 0; x < want.length; x++) {
    const wantSyms = want[x].map((n) => SYMBOL_ORDER[n - 1]);
    if (wantSyms.length !== got[x].length) {
      fail(`${what} reel ${x}: length ${got[x].length}, yaml says ${wantSyms.length}`);
      continue;
    }
    for (let k = 0; k < wantSyms.length; k++) {
      if (wantSyms[k] !== got[x][k]) {
        fail(`${what} reel ${x} pos ${k}: ${got[x][k]}, yaml says ${wantSyms[k]}`);
        break;
      }
    }
  }
};

if (raw.length !== REEL_SETS.length) {
  fail(`yaml has ${raw.length} sets, reelSets.ts has ${REEL_SETS.length}`);
}
compare(bonusRaw, BONUS_REELS, 'bonus set');
for (let i = 0; i < Math.min(raw.length, REEL_SETS.length); i++) {
  if (raw[i].rtp.toFixed(6) !== REEL_SETS[i].rtp.toFixed(6)) {
    fail(`set ${i}: yaml rtp ${raw[i].rtp} vs ts ${REEL_SETS[i].rtp}`);
    continue;
  }
  compare(raw[i].reels, REEL_SETS[i].reels, `set ${raw[i].rtp}`);
}

const symbols = new Set<SymbolId>();
const allSets = [...REEL_SETS.map((s) => s.reels), BONUS_REELS];
for (const reels of allSets) for (const r of reels) for (const sym of r) symbols.add(sym);
for (const sym of SYMBOL_ORDER) {
  if (!symbols.has(sym)) fail(`symbol ${sym} never appears on any strip`);
}

for (const reels of allSets) {
  for (let x = 0; x < reels.length; x++) {
    const r = reels[x];
    for (let i = 0; i < r.length; i++) {
      if (r[i] !== SCATTER) continue;
      for (let k = 1; k < ROWS; k++) {
        if (r[(i + k) % r.length] === SCATTER) {
          fail(`reel ${x} has two scatters within one window at pos ${i} and ${(i + k) % r.length}`);
        }
      }
    }
  }
}

console.log(
  problems === 0
    ? `OK  all ${REEL_SETS.length} reel sets and the bonus set match ${YAML} symbol for ` +
        `symbol; all ${SYMBOL_ORDER.length} symbols are in use; no reel can show two scatters.`
    : `${problems} problem(s) found.`,
);
process.exit(problems === 0 ? 0 : 1);
