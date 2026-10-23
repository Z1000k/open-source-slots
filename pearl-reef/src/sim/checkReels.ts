/**
 * Prove src/engine/config/reelSets.ts still says exactly what
 * slotopol/dolphinspearl_data.yaml says. The TS file is generated, but it is
 * the file that actually ships, so this re-parses the yaml independently and
 * compares symbol by symbol.
 *
 * It also proves which set is the ORIGINAL: slotopol's own par sheet,
 * slotopol/dolphinspearl_calc.lua, hard-codes the regular and bonus strips
 * it calculates, and those must be exactly ACTIVE_REELS and BONUS_REELS.
 *
 * And it checks the one assumption slotopol's own RTP maths makes about these
 * strips: no strip ever shows two scatters in the same 3-symbol window, so a
 * reel can never contribute more than one CLAM to the grid.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACTIVE_REELS, BONUS_REELS, REEL_SETS } from '../engine/config/reelSets';
import { SCATTER, SYMBOL_ORDER, ROWS, type SymbolId } from '../engine/types';

const YAML = resolve(import.meta.dirname, '../../slotopol/dolphinspearl_data.yaml');
const LUA = resolve(import.meta.dirname, '../../slotopol/dolphinspearl_calc.lua');

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

/** The `local REELS_BON = {...}` and `local REELS_REG = {...}` tables of the lua. */
const lua: Record<string, number[][]> = {};
let table: string | null = null;
for (const line of readFileSync(LUA, 'utf8').split(/\r?\n/)) {
  const open = /^local (REELS_\w+) = \{\s*$/.exec(line.trimEnd());
  if (open) {
    table = open[1];
    lua[table] = [];
    continue;
  }
  if (table && /^\}\s*$/.test(line.trimEnd())) {
    table = null;
    continue;
  }
  const strip = /^\s*\{([\d,\s]+)\},?\s*$/.exec(line.trimEnd());
  if (table && strip) lua[table].push(strip[1].split(',').map((n) => Number(n.trim())));
}

let problems = 0;
const fail = (msg: string) => {
  problems++;
  console.log(`FAIL ${msg}`);
};

const compare = (want: number[][], got: SymbolId[][], what: string) => {
  if (want.length !== got.length) {
    fail(`${what}: source has ${want.length} reels, ts has ${got.length}`);
    return;
  }
  for (let x = 0; x < want.length; x++) {
    const wantSyms = want[x].map((n) => SYMBOL_ORDER[n - 1]);
    if (wantSyms.length !== got[x].length) {
      fail(`${what} reel ${x}: length ${got[x].length}, source says ${wantSyms.length}`);
      continue;
    }
    for (let k = 0; k < wantSyms.length; k++) {
      if (wantSyms[k] !== got[x][k]) {
        fail(`${what} reel ${x} pos ${k}: ${got[x][k]}, source says ${wantSyms[k]}`);
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

if (!lua.REELS_REG || !lua.REELS_BON) {
  fail('could not find REELS_REG and REELS_BON in the lua par sheet');
} else {
  compare(lua.REELS_REG, ACTIVE_REELS.reels, `lua REELS_REG vs ACTIVE_REELS (${ACTIVE_REELS.rtp})`);
  compare(lua.REELS_BON, BONUS_REELS, 'lua REELS_BON vs BONUS_REELS');
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
        `symbol; the lua par sheet's strips are exactly ACTIVE_REELS (${ACTIVE_REELS.rtp}%) and ` +
        `BONUS_REELS; all ${SYMBOL_ORDER.length} symbols are in use; no reel can show two scatters.`
    : `${problems} problem(s) found.`,
);
process.exit(problems === 0 ? 0 : 1);
