/**
 * Prove src/engine/config/reelSets.ts still says exactly what
 * slotopol/fairyqueen_data.yaml says. The TS file is generated, but it is
 * the file that actually ships, so this re-parses the yaml independently and
 * compares symbol by symbol: every base set, the free-games strips and the
 * expanding-symbol pool.
 *
 * It pins which set is ACTIVE. slotopol ships no _calc.lua for fairyqueen,
 * so ACTIVE_REELS must be the yaml block nearest the provider's published
 * Fairy Queen figure (95.09%).
 *
 * It proves the reel cover counts the game ships are slotopol's ReelNumBon
 * read per symbol (index sym - 1, the way its par sheet reads it).
 *
 * It checks the assumptions the maths and the board make about the strips:
 *   - no window ever shows two LANTERNs, so a reel adds at most one to the
 *     scatter count (and the count never passes 5);
 *   - no window of any strip shows three of one symbol, so a spun reel can
 *     never pass for a covered one and expansionOf() reads every grid right.
 *
 * And it proves the 10 bet lines are slotopol's BetLinesNvm10 (the first 10
 * of BetLinesNvm5x3v1 in slot/lines.go). No RTP figure can catch a wrong
 * line in the base game, since every line has the same expectation, so this
 * is the guard.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACTIVE_REELS, EXPAND_POOL, FREE_REELS, REEL_SETS } from '../engine/config/reelSets';
import { PAYLINES } from '../engine/config/paylines';
import { EXPAND_REELS } from '../engine/config/paytable';
import { LINES, REELS, ROWS, SCATTER, SYMBOL_ORDER, WILD, type SymbolId } from '../engine/types';

const YAML = resolve(import.meta.dirname, '../../slotopol/fairyqueen_data.yaml');
const LINES_GO = resolve(import.meta.dirname, '../../slotopol/slot/lines.go');
const RULE_GO = resolve(import.meta.dirname, '../../slotopol/fairyqueen_rule.go');

/** Fairy Queen, 10 lines, as published by the provider. */
const PUBLISHED_RTP = 95.09;

interface RawSet {
  rtp: number;
  reels: number[][];
}

// Independent parse: the three documents are split on their key lines.
const text = readFileSync(YAML, 'utf8');
const docs = text.split(/^novomatic\/fairyqueen\//m).slice(1);
const doc = (key: string) => {
  const d = docs.find((s) => s.startsWith(`${key}\n`) || s.startsWith(`${key}\r\n`));
  if (!d) throw new Error(`yaml has no novomatic/fairyqueen/${key} document`);
  return d;
};
const listOf = (s: string) => (s.trim() === '' ? [] : s.split(',').map((n) => Number(n.trim())));

const poolRaw = listOf(/^\[([\d,\s]+)\]/m.exec(doc('es'))![1]);
const freeRaw = [...doc('bon').matchAll(/^- \[([\d,\s]*)\]/gm)].map((m) => listOf(m[1]));
const raw: RawSet[] = [];
for (const block of doc('rmap').split(/^(?=\d+\.\d+:)/m).slice(1)) {
  const rtp = Number(/^(\d+\.\d+):/.exec(block)![1]);
  raw.push({ rtp, reels: [...block.matchAll(/^\s+- \[([\d,\s]+)\]/gm)].map((m) => listOf(m[1])) });
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
      fail(`${what} reel ${x + 1}: length ${got[x].length}, source says ${wantSyms.length}`);
      continue;
    }
    for (let k = 0; k < wantSyms.length; k++) {
      if (wantSyms[k] !== got[x][k]) {
        fail(`${what} reel ${x + 1} pos ${k}: ${got[x][k]}, source says ${wantSyms[k]}`);
        break;
      }
    }
  }
};

if (raw.length !== REEL_SETS.length) fail(`yaml has ${raw.length} sets, reelSets.ts has ${REEL_SETS.length}`);
for (let i = 0; i < Math.min(raw.length, REEL_SETS.length); i++) {
  if (raw[i].rtp.toFixed(6) !== REEL_SETS[i].rtp.toFixed(6)) {
    fail(`set ${i}: yaml rtp ${raw[i].rtp} vs ts ${REEL_SETS[i].rtp}`);
    continue;
  }
  compare(raw[i].reels, REEL_SETS[i].reels, `set ${raw[i].rtp}`);
}
compare(freeRaw, FREE_REELS, 'free set');
if (freeRaw.length !== REELS || freeRaw[0].length !== 0 || freeRaw[1].length !== 0) {
  fail('the yaml free set should be 5 reels with reels 1 and 2 empty');
}
compare([poolRaw], [EXPAND_POOL], 'expanding-symbol pool');
if (EXPAND_POOL.includes(WILD)) fail('the ENCHANTRESS is in the expanding pool');

// ACTIVE: the yaml set nearest the published figure.
const byDistance = [...raw].sort((a, b) => Math.abs(a.rtp - PUBLISHED_RTP) - Math.abs(b.rtp - PUBLISHED_RTP));
const nearest = byDistance[0];
if (nearest.rtp.toFixed(6) !== ACTIVE_REELS.rtp.toFixed(6)) {
  fail(`ACTIVE_REELS is ${ACTIVE_REELS.rtp}, the set nearest ${PUBLISHED_RTP}% is ${nearest.rtp}`);
}
compare(nearest.reels, ACTIVE_REELS.reels, `yaml ${nearest.rtp} vs ACTIVE_REELS`);

// Reel cover counts: ReelNumBon from the Go, read per symbol at [sym - 1].
const rule = readFileSync(RULE_GO, 'utf8');
const numBon = /var ReelNumBon = \[sn\]slot\.Pos\{([\s\S]*?)\n\}/.exec(rule);
const goNum = numBon ? [...numBon[1].matchAll(/^\s*(\d+),/gm)].map((m) => Number(m[1])) : [];
if (goNum.length !== SYMBOL_ORDER.length) fail(`ReelNumBon has ${goNum.length} entries, want ${SYMBOL_ORDER.length}`);
for (let s = 0; s < Math.min(goNum.length, SYMBOL_ORDER.length); s++) {
  if (EXPAND_REELS[SYMBOL_ORDER[s]] !== goNum[s]) {
    fail(`${SYMBOL_ORDER[s]} covers ${EXPAND_REELS[SYMBOL_ORDER[s]]} reels, ReelNumBon[${s}] says ${goNum[s]}`);
  }
}

const allSets: { what: string; reels: SymbolId[][] }[] = [
  ...REEL_SETS.map((s) => ({ what: `set ${s.rtp}`, reels: s.reels })),
  { what: 'free set', reels: FREE_REELS },
];
const used = new Set<SymbolId>();
for (const { reels } of allSets) for (const r of reels) for (const sym of r) used.add(sym);
for (const sym of SYMBOL_ORDER) if (!used.has(sym)) fail(`symbol ${sym} never appears on any strip`);

for (const { what, reels } of allSets) {
  for (let x = 0; x < reels.length; x++) {
    const r = reels[x];
    for (let i = 0; i < r.length; i++) {
      const w = [0, 1, 2].map((k) => r[(i + k) % r.length]);
      if (w.filter((s) => s === SCATTER).length > 1) fail(`${what} reel ${x + 1} shows two LANTERNs at stop ${i}`);
      if (w[0] === w[1] && w[1] === w[2]) fail(`${what} reel ${x + 1} shows three ${w[0]} at stop ${i}`);
    }
  }
}

// Bet lines: the game uses BetLinesNvm10 = BetLinesNvm5x3v1[:10], 1-based rows.
const linesGo = readFileSync(LINES_GO, 'utf8');
if (!/var BetLines = slot\.BetLinesNvm10\[:\]/.test(rule)) fail('fairyqueen_rule.go no longer says BetLines = slot.BetLinesNvm10');
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
if (ROWS !== 3) fail('the game is 5x3');

console.log(
  problems === 0
    ? `OK  all ${REEL_SETS.length} base sets, the free set [${FREE_REELS.map((r) => r.length).join(', ')}] and the ` +
        `${EXPAND_POOL.length}-entry expanding pool match ${YAML} symbol for symbol; ACTIVE_REELS is the set ` +
        `nearest the published Fairy Queen ${PUBLISHED_RTP}% (${ACTIVE_REELS.rtp}); the reel cover counts are ` +
        `ReelNumBon read per symbol; all ${SYMBOL_ORDER.length} symbols are in use; no window shows two LANTERNs ` +
        `or three of one symbol; the ${LINES} bet lines are slotopol's BetLinesNvm10.`
    : `${problems} problem(s) found.`,
);
process.exit(problems === 0 ? 0 : 1);
