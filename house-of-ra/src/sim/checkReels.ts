/**
 * Prove src/engine/config/reelSets.ts still says exactly what
 * slotopol/dynastyofra_data.yaml says. The TS file is generated, but it is
 * the file that actually ships, so this re-parses the yaml independently and
 * compares symbol by symbol.
 *
 * It pins which set is the ORIGINAL. slotopol ships no _calc.lua for
 * dynastyofra, so ACTIVE_REELS must be the yaml block nearest the provider's
 * published Dynasty of Ra figure (95.01%), and no other set may sit near it.
 *
 * It re-derives OUR free-games strips from slotopol's with its own code,
 * from the rule written in genReels.mjs, and asserts the shipped strips are
 * exactly that: nothing else was touched.
 *
 * It checks the one assumption the factored maths in exact.ts and
 * parsheet.ts makes about the strips: no strip ever shows two SUN DISCs in
 * the same 3-symbol window, so a reel never adds more than one to the count.
 *
 * And it proves the 10 bet lines are slotopol's BetLinesNvm10 (the first 10
 * of BetLinesNvm5x3v1 in slot/lines.go). No RTP figure can catch a wrong
 * line, since every line has the same expectation, so this is the only guard.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACTIVE_REELS, FREE_REELS, REEL_SETS, SLOTOPOL_FREE_REELS } from '../engine/config/reelSets';
import { PAYLINES } from '../engine/config/paylines';
import { LINES, REELS, ROWS, SCATTER, SYMBOL_ORDER, type SymbolId } from '../engine/types';

const YAML = resolve(import.meta.dirname, '../../slotopol/dynastyofra_data.yaml');
const LINES_GO = resolve(import.meta.dirname, '../../slotopol/slot/lines.go');
const RULE_GO = resolve(import.meta.dirname, '../../slotopol/dynastyofra_rule.go');

/** Dynasty of Ra, 10 lines, as published by the provider. */
const PUBLISHED_RTP = 95.01;

interface RawSet {
  rtp: number;
  reels: number[][];
}

const freeRaw: number[][] = [];
const raw: RawSet[] = [];
let current: RawSet | null = null;
for (const line of readFileSync(YAML, 'utf8').split(/\r?\n/)) {
  const head = /^(\d+\.\d+):\s*$/.exec(line.trimEnd());
  if (head) {
    current = { rtp: Number(head[1]), reels: [] };
    raw.push(current);
    continue;
  }
  const strip = /^\s*-\s*\[([\d,\s]+)\]/.exec(line);
  if (strip) {
    const nums = strip[1].split(',').map((n) => Number(n.trim()));
    (current ? current.reels : freeRaw).push(nums);
  }
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

if (raw.length !== REEL_SETS.length) fail(`yaml has ${raw.length} sets, reelSets.ts has ${REEL_SETS.length}`);
compare(freeRaw, SLOTOPOL_FREE_REELS, "slotopol's free set");
for (let i = 0; i < Math.min(raw.length, REEL_SETS.length); i++) {
  if (raw[i].rtp.toFixed(6) !== REEL_SETS[i].rtp.toFixed(6)) {
    fail(`set ${i}: yaml rtp ${raw[i].rtp} vs ts ${REEL_SETS[i].rtp}`);
    continue;
  }
  compare(raw[i].reels, REEL_SETS[i].reels, `set ${raw[i].rtp}`);
}

// The original: the one yaml set near the published figure, and it is ACTIVE.
const near = raw.filter((s) => Math.abs(s.rtp - PUBLISHED_RTP) < 0.5);
if (near.length !== 1) {
  fail(`${near.length} yaml sets sit within 0.5pp of the published ${PUBLISHED_RTP}%, want exactly 1`);
} else {
  if (near[0].rtp.toFixed(6) !== ACTIVE_REELS.rtp.toFixed(6)) {
    fail(`ACTIVE_REELS is ${ACTIVE_REELS.rtp}, the original is the ${near[0].rtp} set`);
  }
  compare(near[0].reels, ACTIVE_REELS.reels, `yaml ${near[0].rtp} vs ACTIVE_REELS`);
}

// OUR free strips, re-derived here with separate code from the stated rule.
const DISC = SYMBOL_ORDER.indexOf('SUNDISC') + 1;
const COBRA = SYMBOL_ORDER.indexOf('COBRA') + 1;
const derived = freeRaw.map((strip, k) => {
  if (k < 2) return strip.slice();
  const out: number[] = [];
  for (const x of strip) {
    out.push(x);
    if (x !== DISC && !(k === 2 && x === COBRA)) out.push(x); // stack two high
  }
  const L = out.length;
  const first = out.indexOf(DISC);
  const opposite = (first + L / 2) % L;
  let at = -1;
  let bestD = Infinity;
  for (let b = 1; b < L; b++) {
    if (out[b] === out[b - 1]) continue; // a boundary between stacks only
    const firstAfter = first < b ? first : first + 1; // the first disc after inserting at b
    const apart = Math.abs(b - firstAfter);
    if (Math.min(apart, L + 1 - apart) < ROWS) continue;
    const d = Math.min(Math.abs(b - opposite), L - Math.abs(b - opposite));
    if (d < bestD) {
      bestD = d;
      at = b;
    }
  }
  out.splice(at, 0, DISC);
  return out;
});
compare(derived, FREE_REELS, 'our free set (re-derived from the rule)');
for (let x = 2; x < REELS; x++) {
  const r = FREE_REELS[x];
  const discs = r.flatMap((s, i) => (s === SCATTER ? [i] : []));
  const apart = discs.length === 2 ? discs[1] - discs[0] : -1;
  if (discs.length !== 2 || Math.abs(Math.min(apart, r.length - apart) - r.length / 2) > 2) {
    fail(`free reel ${x + 1}: the two SUN DISCs are not on opposite sides (${discs.join(', ')} of ${r.length})`);
  }
}

const symbols = new Set<SymbolId>();
const allSets = [...REEL_SETS.map((s) => s.reels), FREE_REELS, SLOTOPOL_FREE_REELS];
for (const reels of allSets) for (const r of reels) for (const sym of r) symbols.add(sym);
for (const sym of SYMBOL_ORDER) {
  if (!symbols.has(sym)) fail(`symbol ${sym} never appears on any strip`);
}
for (const sym of SYMBOL_ORDER) {
  if (!FREE_REELS.every((r) => r.includes(sym))) fail(`symbol ${sym} is missing from a free-games reel`);
}

for (const reels of allSets) {
  for (let x = 0; x < reels.length; x++) {
    const r = reels[x];
    for (let i = 0; i < r.length; i++) {
      if (r[i] !== SCATTER) continue;
      for (let k = 1; k < ROWS; k++) {
        if (r[(i + k) % r.length] === SCATTER) {
          fail(`reel ${x} has two SUN DISCs within one window at pos ${i} and ${(i + k) % r.length}`);
        }
      }
    }
  }
}

// Bet lines: the game uses BetLinesNvm10 = BetLinesNvm5x3v1[:10], 1-based rows.
const linesGo = readFileSync(LINES_GO, 'utf8');
if (!/var BetLines = slot\.BetLinesNvm10\[:\]/.test(readFileSync(RULE_GO, 'utf8'))) {
  fail('dynastyofra_rule.go no longer says BetLines = slot.BetLinesNvm10');
}
if (!/var BetLinesNvm10 = BetLinesNvm5x3v1\[:10\]/.test(linesGo)) {
  fail('lines.go no longer defines BetLinesNvm10 as BetLinesNvm5x3v1[:10]');
}
const block = /var BetLinesNvm5x3v1 = \[\.\.\.\]Linex\{([\s\S]*?)\n\}/.exec(linesGo);
const goLines = block
  ? [...block[1].matchAll(/\{([\d,\s]+)\}/g)].slice(0, 10).map((m) => m[1].split(',').map((n) => Number(n) - 1))
  : [];
if (goLines.length !== LINES || PAYLINES.length !== LINES) {
  fail(`want ${LINES} lines, lines.go gives ${goLines.length}, paylines.ts has ${PAYLINES.length}`);
} else {
  for (let li = 0; li < LINES; li++) {
    if (goLines[li].length !== REELS || goLines[li].some((row, x) => row !== PAYLINES[li][x])) {
      fail(`line ${li + 1}: paylines.ts [${PAYLINES[li].join(', ')}], lines.go [${goLines[li].join(', ')}] (0-based)`);
    }
  }
}

console.log(
  problems === 0
    ? `OK  all ${REEL_SETS.length} base sets and slotopol's free set match ${YAML} symbol for symbol; ` +
        `ACTIVE_REELS is the one set near the published Dynasty of Ra ${PUBLISHED_RTP}% (${ACTIVE_REELS.rtp}); ` +
        `our free set [${FREE_REELS.map((r) => r.length).join(', ')}] is exactly the stated rule applied to slotopol's; ` +
        `all ${SYMBOL_ORDER.length} symbols are in use and on every free reel; no reel can show two SUN DISCs; ` +
        `the ${LINES} bet lines are slotopol's BetLinesNvm10.`
    : `${problems} problem(s) found.`,
);
process.exit(problems === 0 ? 0 : 1);
