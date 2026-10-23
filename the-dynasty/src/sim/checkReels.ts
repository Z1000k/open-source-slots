/**
 * Prove src/engine/config/reelSets.ts still says exactly what
 * slotopol/royaldynasty_data.yaml says. The TS file is generated, but it is
 * the file that actually ships, so this re-parses the yaml independently and
 * compares symbol by symbol: every base set and the free-games strips.
 *
 * It pins which set is ACTIVE. slotopol ships no _calc.lua for royaldynasty,
 * so ACTIVE_REELS must be the yaml block nearest the provider's published
 * Royal Dynasty figure (94.49%).
 *
 * It checks the assumptions the engine and the board make about the strips:
 *   - no window ever shows the same heir twice, so a reel adds at most one
 *     of each heir to a count (and no count passes 5, where slotopol's
 *     tables end).
 *
 * And it proves the 20 bet lines are slotopol's BetLinesNvm5x3v1 in
 * slot/lines.go, the lines royaldynasty_rule.go names. No RTP figure can
 * catch a wrong line in this game, since every line has the same
 * expectation in the base game and the free games alike, so this is the
 * guard.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACTIVE_REELS, FREE_REELS, REEL_SETS } from '../engine/config/reelSets';
import { PAYLINES } from '../engine/config/paylines';
import { HEIRS, LINES, REELS, ROWS, SYMBOL_ORDER, WILD, type SymbolId } from '../engine/types';

const YAML = resolve(import.meta.dirname, '../../slotopol/royaldynasty_data.yaml');
const LINES_GO = resolve(import.meta.dirname, '../../slotopol/slot/lines.go');
const RULE_GO = resolve(import.meta.dirname, '../../slotopol/royaldynasty_rule.go');

/** Royal Dynasty, 20 lines, as published by the provider. */
const PUBLISHED_RTP = 94.49;

interface RawSet {
  rtp: number;
  reels: number[][];
}

// Independent parse: the two documents are split on their key lines.
const text = readFileSync(YAML, 'utf8');
const docs = text.split(/^novomatic\/royaldynasty\//m).slice(1);
const doc = (key: string) => {
  const d = docs.find((s) => s.startsWith(`${key}\n`) || s.startsWith(`${key}\r\n`));
  if (!d) throw new Error(`yaml has no novomatic/royaldynasty/${key} document`);
  return d;
};
const listOf = (s: string) => (s.trim() === '' ? [] : s.split(',').map((n) => Number(n.trim())));

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
if (freeRaw.length !== REELS) fail(`the yaml free set has ${freeRaw.length} reels, want ${REELS}`);
compare(freeRaw, FREE_REELS, 'free set');

// ACTIVE: the yaml set nearest the published figure.
const byDistance = [...raw].sort((a, b) => Math.abs(a.rtp - PUBLISHED_RTP) - Math.abs(b.rtp - PUBLISHED_RTP));
const nearest = byDistance[0];
if (nearest.rtp.toFixed(6) !== ACTIVE_REELS.rtp.toFixed(6)) {
  fail(`ACTIVE_REELS is ${ACTIVE_REELS.rtp}, the set nearest ${PUBLISHED_RTP}% is ${nearest.rtp}`);
}
compare(nearest.reels, ACTIVE_REELS.reels, `yaml ${nearest.rtp} vs ACTIVE_REELS`);

const allSets: { what: string; reels: SymbolId[][] }[] = [
  ...REEL_SETS.map((s) => ({ what: `set ${s.rtp}`, reels: s.reels })),
  { what: 'free set', reels: FREE_REELS },
];
const used = new Set<SymbolId>();
for (const { reels } of allSets) for (const r of reels) for (const sym of r) used.add(sym);
for (const sym of SYMBOL_ORDER) if (!used.has(sym)) fail(`symbol ${sym} never appears on any strip`);

let bothHeirs = 0;
for (const { what, reels } of allSets) {
  for (let x = 0; x < reels.length; x++) {
    const r = reels[x];
    for (let i = 0; i < r.length; i++) {
      const w = [0, 1, 2].map((k) => r[(i + k) % r.length]);
      for (const heir of HEIRS) {
        if (w.filter((s) => s === heir).length > 1) fail(`${what} reel ${x + 1} shows two ${heir}s at stop ${i}`);
      }
      if (HEIRS.every((h) => w.includes(h))) bothHeirs++;
    }
  }
}

// Bet lines: the game uses BetLinesNvm5x3v1, 1-based rows in the Go.
const rule = readFileSync(RULE_GO, 'utf8');
const linesGo = readFileSync(LINES_GO, 'utf8');
if (!/var BetLines = slot\.BetLinesNvm5x3v1\[:\]/.test(rule)) {
  fail('royaldynasty_rule.go no longer says BetLines = slot.BetLinesNvm5x3v1[:]');
}
const block = /var BetLinesNvm5x3v1 = \[\.\.\.\]Linex\{([\s\S]*?)\n\}/.exec(linesGo);
const goLines = block ? [...block[1].matchAll(/\{([\d,\s]+)\}/g)].map((m) => m[1].split(',').map((n) => Number(n) - 1)) : [];
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

const perReel = (sym: SymbolId) => FREE_REELS.map((r) => r.filter((s) => s === sym).length).join('/');
console.log(
  problems === 0
    ? `OK  all ${REEL_SETS.length} base sets and the free set [${FREE_REELS.map((r) => r.length).join(', ')}] match ` +
        `${YAML} symbol for symbol; ACTIVE_REELS is the set nearest the published Royal Dynasty ${PUBLISHED_RTP}% ` +
        `(${ACTIVE_REELS.rtp}); all ${SYMBOL_ORDER.length} symbols are in use; no window shows the same heir twice ` +
        `(${bothHeirs} windows across all sets show both heirs); free strips hold ${perReel(WILD)} MONARCH, ` +
        `${perReel('HEIRESS')} HEIRESS and ${perReel('HEIR')} HEIR per reel; the ${LINES} bet lines are slotopol's ` +
        `BetLinesNvm5x3v1.`
    : `${problems} problem(s) found.`,
);
process.exit(problems === 0 ? 0 : 1);
