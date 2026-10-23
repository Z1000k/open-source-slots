/**
 * Analytic par sheet — counts winning combinations in closed form, sharing
 * no code with our evaluate().
 *
 * slotopol ships no _calc.lua for fairyqueen, so this is our own derivation
 * of the rules in fairyqueen_rule.go, read the way slotopol's own par sheet
 * (fairyqueen_scan.go) reads them.
 *
 * Base game. A line pays max(run pay, wild pay), where the run is decided by
 * k, the number of leading wilds, S, the first non-wild symbol (at position
 * k+1), and n, how far S's run reaches with wilds substituting. With per-reel
 * symbol counts c_i(s), wild counts w_i and lengths L_i, the number of
 * reshuffles giving exactly (k, S, n) on a line is
 *
 *   w_1..w_k * c_{k+1}(S) * prod_{k+1<i<=n} (w_i + c_i(S))
 *            * (L_{n+1} - w_{n+1} - c_{n+1}(S)) * prod_{i>n+1} L_i
 *
 * (the break factor only when n < 5), plus w_1..w_5 lines of five wilds.
 * Every line has the same expectation (one row per reel, uniform stops), so
 * this is the whole line RTP. The scatter side convolves each reel's count
 * of LANTERNs per window, read off the strips stop by stop.
 *
 * Free games. With symbol es drawn, reels 1..m (m = ReelNumBon[es - 1]) show
 * es on every row, so every line starts with m copies of es and no wild. Its
 * run then grows while a free reel shows es or the wild:
 *
 *   reshuffles with run exactly n = prod_{m<i<=n} (c_i(es) + w_i)
 *            * (L_{n+1} - c_{n+1}(es) - w_{n+1}) * prod_{i>n+1} L_i
 *
 * A LANTERN cover is [blank, LANTERN, blank] on reels 1..m, so every line
 * starts on a blank or the LANTERN, neither has a LinePay row and neither is
 * the wild: the lines pay nothing and the free game pays its scatters, m of
 * them already up. Then, exactly slotopol's CalcStatReg, the pool averages
 * RTP(sym) and q over its 28 entries, RTPfs = RTP(sym) / (1 - q), and a base
 * set's RTP = symbols + q * RTPfs.
 *
 * Nothing about the rules is typed by hand: the paytable, wild and scatter
 * ids, the cover counts, the cover rows, the scatter pays and the free games
 * awarded are read straight out of slotopol's fairyqueen Go source and
 * asserted equal to what the game actually ships, so a typo in our tables is
 * a failure here.
 *
 *   npm run sim:parsheet
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACTIVE_REELS, EXPAND_POOL, FREE_REELS, REEL_SETS } from '../engine/config/reelSets';
import { EXPAND_REELS, LINE_PAY, SCAT_FREESPIN, SCAT_PAY } from '../engine/config/paytable';
import { GAME_RTP } from '../engine/config/rtp';
import { coveredReel } from '../engine/spin';
import { BLANK, FREE_SPINS_AWARD, REELS, ROWS, SCATTER, SYMBOL_ORDER, WILD, type SymbolId } from '../engine/types';
import { readPrinted } from './printed';

const RULE_FILE = resolve(import.meta.dirname, '../../slotopol/fairyqueen_rule.go');
const SCAN_FILE = resolve(import.meta.dirname, '../../slotopol/fairyqueen_scan.go');
const rule = readFileSync(RULE_FILE, 'utf8');
const scan = readFileSync(SCAN_FILE, 'utf8');

const need = (src: string, re: RegExp, what: string): RegExpExecArray => {
  const m = re.exec(src);
  if (!m) throw new Error(`could not read ${what} from the slotopol source`);
  return m;
};
const nums = (list: string): number[] =>
  list.trim() === '' ? [] : list.split(',').map((n) => Number(n.trim()));

const SN = Number(need(rule, /\bsn\s*=\s*(\d+)/, 'sn')[1]);
const [, wildS, scatS] = need(rule, /wild, scat\s*=\s*(\d+), (\d+)/, 'wild, scat');
const GO_WILD = Number(wildS);
const GO_SCAT = Number(scatS);
/** LinePay from the Go, indexed [sym - 1][count - 1]; the light's row is empty. */
const GO_PAY: number[][] = [];
const payBlock = need(rule, /var LinePay = \[sn\]\[5\]float64\{([\s\S]*?)\n\}/, 'LinePay')[1];
for (const m of payBlock.matchAll(/\{([\d,\s]*)\},/g)) GO_PAY.push(nums(m[1]));
/** ReelNumBon from the Go, indexed [sym - 1] as the par sheet reads it. */
const numBonBlock = need(rule, /var ReelNumBon = \[sn\]slot\.Pos\{([\s\S]*?)\n\}/, 'ReelNumBon')[1];
const GO_NUMBON = [...numBonBlock.matchAll(/^\s*(\d+),/gm)].map((m) => Number(m[1]));
const GO_SCATPAY = nums(need(rule, /var ScatPay = \[5\]float64\{([\d,\s]*)\}/, 'ScatPay')[1]);
const GO_SCATFS = nums(need(rule, /var ScatFreespin = \[5\]int\{([\d,\s]*)\}/, 'ScatFreespin')[1]);
const SCAT_MIN = Number(need(rule, /count := g\.SymNum\(scat\); count >= (\d+)/, 'scatter minimum')[1]);
/** The cover rows: the drawn symbol on all three, the light as blank, light, blank. */
const COVER_SAME = /r\[0\], r\[1\], r\[2\] = g\.ES, g\.ES, g\.ES/.test(rule);
const COVER_SCAT = /r\[0\], r\[1\], r\[2\] = 0, scat, 0/.test(rule);
/** The par sheet reads the cover count at [es - 1]; the live SpinBon reads [es]. */
const PARSHEET_INDEX = /if ReelNumBon\[g\.ES-1\] == 2 \{/.test(scan);
const LIVE_INDEX_OFF = /var num = ReelNumBon\[g\.ES\]\r?\n/.test(rule);

// The shipped game must say the same thing as the Go.
const mismatch = (what: string) => {
  throw new Error(`the shipped game disagrees with slotopol's Go source on ${what}`);
};
if (SN !== SYMBOL_ORDER.length || GO_PAY.length !== SN || GO_NUMBON.length !== SN) mismatch(`symbol count (${SN})`);
if (SYMBOL_ORDER[GO_WILD - 1] !== WILD) mismatch('the wild');
if (SYMBOL_ORDER[GO_SCAT - 1] !== SCATTER) mismatch('the scatter');
if (GO_PAY[GO_SCAT - 1].some((p) => p !== 0)) mismatch('the LANTERN paying on the lines');
if (!COVER_SAME || !COVER_SCAT) mismatch('the cover rows');
if (!PARSHEET_INDEX) mismatch('the par sheet reading the cover count at [es - 1]');
for (let s = 0; s < SN; s++) {
  const sym = SYMBOL_ORDER[s];
  const shipped = LINE_PAY[sym];
  for (let k = 0; k < 5; k++) {
    if (shipped[k] !== (GO_PAY[s][k] ?? 0)) mismatch(`${sym} x${k + 1}: ships ${shipped[k]}, Go says ${GO_PAY[s][k] ?? 0}`);
  }
  if (EXPAND_REELS[sym] !== GO_NUMBON[s]) mismatch(`${sym} covering ${EXPAND_REELS[sym]} reels, Go says ${GO_NUMBON[s]}`);
  const cover = coveredReel(sym);
  const want = sym === SCATTER ? [BLANK, SCATTER, BLANK] : [sym, sym, sym];
  if (cover.length !== ROWS || cover.some((c, y) => c !== want[y])) mismatch(`the ${sym} cover rows`);
}
for (let k = 1; k <= 5; k++) {
  if (SCAT_PAY[k - 1] !== GO_SCATPAY[k - 1]) mismatch(`the pay for ${k} scatters`);
  if (SCAT_FREESPIN[k - 1] !== GO_SCATFS[k - 1]) mismatch(`the free games for ${k} scatters`);
  if (GO_SCATFS[k - 1] !== 0 && GO_SCATFS[k - 1] !== FREE_SPINS_AWARD) mismatch(`the award for ${k} scatters`);
}
if (EXPAND_POOL.includes(WILD)) mismatch('the expanding pool (the wild is never drawn)');

/** pay(sym, count) with 1-based sym and count; runs under 2 never pay (numw/numl >= 2). */
const pay = (sym: number, n: number) => (n >= 2 ? (GO_PAY[sym - 1][n - 1] ?? 0) : 0);
const idOf = (s: SymbolId) => {
  const id = SYMBOL_ORDER.indexOf(s) + 1;
  if (id === 0) throw new Error(`symbol ${s} on a strip`);
  return id;
};

interface Reels {
  /** L[i] for 1-based reel i */
  L: number[];
  /** counts[sym][i], both 1-based */
  counts: number[][];
  /** dist[i][k]: stops of reel i that show k scatters in the window */
  dist: number[][];
}

function precalc(reels: SymbolId[][]): Reels {
  const L = [0, ...reels.map((r) => r.length)];
  const counts: number[][] = [];
  for (let s = 0; s <= SN; s++) counts[s] = new Array(REELS + 1).fill(0);
  const dist: number[][] = [[]];
  for (let i = 1; i <= REELS; i++) {
    const reel = reels[i - 1];
    for (const sym of reel) counts[idOf(sym)][i]++;
    const d = new Array(ROWS + 1).fill(0);
    for (let stop = 0; stop < reel.length; stop++) {
      let k = 0;
      for (let y = 0; y < ROWS; y++) if (idOf(reel[(stop + y) % reel.length]) === GO_SCAT) k++;
      d[k]++;
    }
    dist.push(d);
  }
  return { L, counts, dist };
}

/** Sum over all reshuffles of ONE line's pay on a base set, in line-bet units. */
function lineEv({ L, counts }: Reels, N: number): number {
  const w = counts[GO_WILD];
  const wpay = (k: number) => pay(GO_WILD, k);
  let ev = 0;
  let combos = 0;
  let lead = 1;
  for (let k = 0; k < REELS; k++) {
    if (k > 0) lead *= w[k];
    if (lead === 0) break;
    for (let S = 1; S <= SN; S++) {
      if (S === GO_WILD) continue;
      const c = counts[S];
      let run = lead * c[k + 1];
      for (let n = k + 1; n <= REELS && run > 0; n++) {
        if (n > k + 1) run *= w[n] + c[n];
        if (run === 0) break;
        let tail = 1;
        if (n < REELS) {
          tail = L[n + 1] - w[n + 1] - c[n + 1];
          for (let i = n + 2; i <= REELS; i++) tail *= L[i];
        }
        combos += run * tail;
        ev += run * tail * Math.max(pay(S, n), wpay(k));
      }
    }
  }
  let all = 1;
  for (let i = 1; i <= REELS; i++) all *= w[i];
  combos += all;
  ev += all * wpay(REELS);
  // Every reshuffle lands in exactly one (k, S, n) case or the five-wild one.
  if (combos !== N) throw new Error(`par sheet cases cover ${combos} reshuffles, want ${N}`);
  return ev;
}

/** Sum over all reshuffles of free reels m+1..5 of ONE line's pay with es covering 1..m. */
function coverLineEv({ L, counts }: Reels, es: number, m: number, N: number): number {
  if (es === GO_SCAT) return 0; // every line starts on a blank or the LANTERN
  const w = counts[GO_WILD];
  const c = counts[es];
  let ev = 0;
  let combos = 0;
  let run = 1;
  for (let n = m; n <= REELS; n++) {
    if (n > m) run *= c[n] + w[n];
    if (run === 0) break;
    let tail = 1;
    if (n < REELS) {
      tail = L[n + 1] - c[n + 1] - w[n + 1];
      for (let i = n + 2; i <= REELS; i++) tail *= L[i];
    }
    combos += run * tail;
    ev += run * tail * pay(es, n);
  }
  if (combos !== N) throw new Error(`cover cases for symbol ${es} cover ${combos} reshuffles, want ${N}`);
  return ev;
}

/** Reshuffles of reels from..5 by total scatter count, `already` scatters up before them. */
function scatEv({ dist }: Reels, from: number, already: number) {
  let ways: number[] = new Array(already + 1).fill(0);
  ways[already] = 1;
  for (let i = from; i <= REELS; i++) {
    const next = new Array(ways.length + ROWS).fill(0);
    for (let a = 0; a < ways.length; a++) {
      for (let k = 0; k <= ROWS; k++) next[a + k] += ways[a] * dist[i][k];
    }
    ways = next;
  }
  let pays = 0;
  let fs = 0;
  let triggers = 0;
  for (let c = SCAT_MIN; c < ways.length; c++) {
    if (ways[c] === 0) continue;
    if (c > 5) throw new Error(`${c} scatters can land, the tables stop at 5`);
    pays += ways[c] * GO_SCATPAY[c - 1];
    fs += ways[c] * GO_SCATFS[c - 1];
    if (GO_SCATFS[c - 1] > 0) triggers += ways[c];
  }
  return { pays, fs, triggers };
}

const pct = (x: number) => (x * 100).toFixed(6);
const sig5 = (x: number) => Number(x.toPrecision(5));

const printed = readPrinted();
let bad = 0;
const check = (what: string, got: string | number, want: string | number) => {
  if (got !== want) {
    bad++;
    console.log(`  MISMATCH ${what}: ${got}, slotopol says ${want}`);
  }
};

console.log('*bonus reels calculations*');
const bon = precalc(FREE_REELS);
const rtpE = new Map<number, number>();
const qE = new Map<number, number>();
for (let es = 1; es <= SN; es++) {
  if (es === GO_WILD) continue;
  const m = GO_NUMBON[es - 1];
  let N = 1;
  for (let i = m + 1; i <= REELS; i++) N *= bon.L[i];
  const lined = coverLineEv(bon, es, m, N) / N;
  const sc = scatEv(bon, m + 1, es === GO_SCAT ? m : 0);
  const scat = sc.pays / N;
  const rtp = lined + scat;
  rtpE.set(es, rtp);
  qE.set(es, sc.fs / N);
  console.log(
    `[${es}] ${SYMBOL_ORDER[es - 1].padEnd(11)} covers ${m}, reshuffles ${String(N).padStart(6)}: ` +
      `${sig5(lined * 100)}(lined) + ${sig5(scat * 100)}(scatter) = ${pct(rtp)}%, free spins ${sc.fs}`,
  );
  const want = printed.es.get(es);
  if (!want) {
    bad++;
    console.log(`  MISMATCH: slotopol prints no block for symbol ${es}`);
    continue;
  }
  check(`RTP[${es}]`, pct(rtp), want.rtp.toFixed(6));
  if (want.fs !== undefined) {
    check(`free spins [${es}]`, sc.fs, want.fs);
    check(`lined [${es}]`, sig5(lined * 100), want.lined!);
    check(`scatter [${es}]`, sig5(scat * 100), want.scat!);
  } else check(`free spins [${es}] (none printed)`, sc.fs, 0);
}

let rtpSym = 0;
let qfs = 0;
for (const s of EXPAND_POOL) {
  rtpSym += rtpE.get(idOf(s))!;
  qfs += qE.get(idOf(s))!;
}
rtpSym /= EXPAND_POOL.length;
qfs /= EXPAND_POOL.length;
const sq = 1 / (1 - qfs);
const rtpFs = sq * rtpSym;
console.log(`pool of ${EXPAND_POOL.length}: q = ${sig5(qfs)}, sq = 1/(1-q) = ${sq.toFixed(6)}`);
console.log(`RTPfs = sq*rtp(sym) = ${sq.toFixed(6)}*${pct(rtpSym)} = ${pct(rtpFs)}%`);
check('q', sig5(qfs), printed.qfs);
check('RTP(sym)', sig5(rtpSym * 100), printed.rtpsym);
check('RTPfs', pct(rtpFs), printed.rtpfs.toFixed(6));
if (LIVE_INDEX_OFF) {
  console.log(
    'note: the live SpinBon reads ReelNumBon[g.ES], one entry off; slotopol computed every figure above ' +
      'with ReelNumBon[es - 1], as this par sheet and the game do.',
  );
}
console.log('');

let activeRtp = NaN;
for (const set of REEL_SETS) {
  const r = precalc(set.reels);
  const N = set.reels.reduce((a, x) => a * x.length, 1);
  const lined = lineEv(r, N) / N;
  const sc = scatEv(r, 1, 0);
  const scat = sc.pays / N;
  const sym = lined + scat;
  const q = sc.fs / N;
  const total = sym + q * rtpFs;
  if (set === ACTIVE_REELS) activeRtp = total;
  const want = printed.sets.get(set.rtp.toFixed(6));
  console.log(`*regular reels ${set.rtp.toFixed(6)}%*${set === ACTIVE_REELS ? ' (ACTIVE)' : ''}`);
  console.log(`reels lengths [${r.L.slice(1).join(', ')}], total reshuffles ${N}`);
  console.log(`symbols: ${sig5(lined * 100)}(lined) + ${sig5(scat * 100)}(scatter) = ${pct(sym)}%`);
  console.log(`free spins ${sc.fs}, q = ${sig5(q)}, free games 1 in ${(N / sc.triggers).toFixed(3)}`);
  console.log(`RTP = ${pct(sym)}(sym) + ${sig5(q)}*${pct(rtpFs)}(fg) = ${pct(total)}%`);
  if (!want) {
    bad++;
    console.log('  MISMATCH: slotopol prints no figures for this set');
  } else {
    check('reshuffles', N, want.total);
    check('symbols', pct(sym), want.sym.toFixed(6));
    check('lined', sig5(lined * 100), want.lined);
    check('scatter', sig5(scat * 100), want.scat);
    check('free spins', sc.fs, want.fs);
    check('q', sig5(q), want.q);
  }
  check('RTP', pct(total), set.rtp.toFixed(6));
  console.log('');
}
check('shipped GAME_RTP', pct(activeRtp), GAME_RTP.toFixed(6));
console.log(`ACTIVE ${ACTIVE_REELS.rtp.toFixed(6)}: RTP ${pct(activeRtp)}%, shipped GAME_RTP ${GAME_RTP.toFixed(6)}%`);

console.log(
  bad === 0
    ? `all ${REEL_SETS.length} reel sets, all ${rtpE.size} expanding symbols and the pool reproduce slotopol to 6 ` +
        `decimals (symbols, integer free spins and RTP of every block).`
    : `${bad} figure(s) DO NOT match slotopol.`,
);
process.exit(bad === 0 ? 0 : 1);
