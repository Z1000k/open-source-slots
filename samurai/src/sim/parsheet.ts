/**
 * Analytic par sheet — counts winning combinations in closed form, sharing
 * no code with our evaluate().
 *
 * slotopol ships no _calc.lua for katana, so this is our own derivation of
 * the rules in katana_rule.go, combined the way slotopol's own par sheet
 * (katana_scan.go, Parsheet_fgretrig_split) combines them.
 *
 * A line pays max(run pay, wild pay), where the run is decided by k, the
 * number of leading wilds, S, the first non-wild symbol (at position k+1),
 * and n, how far S's run reaches with wilds substituting. Per reel i, on the
 * row the line reads there, let w_i be the stops that read wild, c_i(S) the
 * stops that read S, and L_i the strip length. The number of reshuffles
 * giving exactly (k, S, n) on the line is
 *
 *   w_1..w_k * c_{k+1}(S) * prod_{k+1<i<=n} (w_i + c_i(S))
 *            * (L_{n+1} - w_{n+1} - c_{n+1}(S)) * prod_{i>n+1} L_i
 *
 * (the break factor only when n < 5), plus w_1..w_5 lines of five wilds.
 *
 * In the base game a reel reads wild where the row shows the SAMURAI, so
 * w_i and c_i(S) are plain strip counts and every line has the same
 * expectation. In the free games a reel reads wild on EVERY row when its
 * window shows a SAMURAI anywhere (slotopol's reelwild), so w_i counts the
 * stops whose window holds one, and c_i(S) the stops that show S on the
 * line's row with no SAMURAI in the window. That depends on the row, so each
 * of the 20 lines is counted on its own rows (slot/lines.go).
 *
 * The scatter side convolves each reel's count of GONGs per window, read off
 * the strips stop by stop. Then, as Parsheet_fgretrig_split does,
 * RTP(free game awarded) = rtp(sym, free reels) / (1 - q(free reels)) and a
 * base set's RTP = rtp(sym) + q * RTP(free game awarded).
 *
 * slotopol printed its figures from a ONE-line scan (Sel = 1, the middle
 * row). This par sheet prints both: the one-line figures, held against every
 * number slotopol printed, and the 20-line game, held against GAME_RTP.
 *
 * Nothing about the rules is typed by hand: the paytable, the wild and
 * scatter ids, the wild-reel rule, the scatter pays, the free games awarded
 * and the line shapes are read straight out of slotopol's Go source and
 * asserted equal to what the game actually ships, so a typo in our tables is
 * a failure here.
 *
 *   npm run sim:parsheet
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACTIVE_REELS, FREE_REELS, REEL_SETS } from '../engine/config/reelSets';
import { LINE_PAY, SCAT_FREESPIN, SCAT_MIN, SCAT_PAY } from '../engine/config/paytable';
import { PAYLINES } from '../engine/config/paylines';
import { GAME_RTP } from '../engine/config/rtp';
import { FREE_SPINS_AWARD, LINES, REELS, ROWS, SCATTER, SYMBOL_ORDER, WILD, type SymbolId } from '../engine/types';
import { readPrinted } from './printed';

const RULE_FILE = resolve(import.meta.dirname, '../../slotopol/katana_rule.go');
const SCAN_FILE = resolve(import.meta.dirname, '../../slotopol/katana_scan.go');
const LINES_FILE = resolve(import.meta.dirname, '../../slotopol/slot/lines.go');
const rule = readFileSync(RULE_FILE, 'utf8');
const scan = readFileSync(SCAN_FILE, 'utf8');
const linesGo = readFileSync(LINES_FILE, 'utf8');

const need = (src: string, re: RegExp, what: string): RegExpExecArray => {
  const m = re.exec(src);
  if (!m) throw new Error(`could not read ${what} from the slotopol source`);
  return m;
};
const nums = (list: string): number[] => (list.trim() === '' ? [] : list.split(',').map((n) => Number(n.trim())));

const SN = Number(need(rule, /\bsn\s*=\s*(\d+)/, 'sn')[1]);
const [, wildS, scatS] = need(rule, /wild, scat\s*=\s*(\d+), (\d+)/, 'wild, scat');
const GO_WILD = Number(wildS);
const GO_SCAT = Number(scatS);
/** LinePay from the Go, indexed [sym - 1][count - 1]; the scatter's row is empty. */
const GO_PAY: number[][] = [];
const payBlock = need(rule, /var LinePay = \[sn\]\[5\]float64\{([\s\S]*?)\n\}/, 'LinePay')[1];
for (const m of payBlock.matchAll(/\{([\d,\s]*)\},/g)) GO_PAY.push(nums(m[1]));
const GO_SCATPAY = nums(need(rule, /var ScatPay = \[5\]float64\{([\d,\s]*)\}/, 'ScatPay')[1]);
const GO_SCATFS = nums(need(rule, /var ScatFreespin = \[5\]int\{([\d,\s]*)\}/, 'ScatFreespin')[1]);
const SCAT_FROM = Number(need(rule, /count := g\.SymNum\(scat\); count >= (\d+)/, 'scatter minimum')[1]);
const RUN_FROM_W = Number(need(rule, /if numw >= (\d+) \{/, 'wild run minimum')[1]);
const RUN_FROM_L = Number(need(rule, /if numl >= (\d+) && syml > 0 \{/, 'line run minimum')[1]);
/** The free games' wild reels: a reel showing the wild anywhere reads wild on every line. */
const REELWILD =
  /if g\.FSR > 0 \{\s*for x := range 5 \{\s*for _, sy := range g\.Grid\[x\] \{\s*if sy == wild \{\s*reelwild\[x\] = true/.test(rule) &&
  /if sx == wild \|\| reelwild\[x-1\] \{/.test(rule);
/** The free games spin on ReelsBon, the base game on the closest base set. */
const BON_IN_FREE = /if g\.FSR == 0 \{\s*var reels, _ = ReelsMap\.FindClosest\(mrtp\)\s*return reels\s*\} else \{\s*return ReelsBon/.test(rule);
/** The scatter pays the total bet (bet x selected lines) times the table. */
const SCAT_TOTAL = /Pay: g\.Bet \* float64\(g\.Sel\) \* pay,/.test(rule);
/** The par sheet: no multiplier on the free games, 10 free games per series. */
const SPLIT_M1_L10 = /Parsheet_fgretrig_split\(w, sp, sr, sb, g\.Cost\(\), 1, 10\)/.test(scan);
/** The bet lines: katana names BetLinesNvm5x3v2; its rows, 1-based in the Go. */
const LINES_NAME = /var BetLines = slot\.BetLinesNvm5x3v2\[:\]/.test(rule);
const linesBlock = need(linesGo, /var BetLinesNvm5x3v2 = \[\.\.\.\]Linex\{([\s\S]*?)\n\}/, 'BetLinesNvm5x3v2')[1];
const GO_LINES = [...linesBlock.matchAll(/\{([\d,\s]+)\}/g)].map((m) => nums(m[1]).map((r) => r - 1));

// The shipped game must say the same thing as the Go.
const mismatch = (what: string) => {
  throw new Error(`the shipped game disagrees with slotopol's Go source on ${what}`);
};
if (SN !== SYMBOL_ORDER.length || GO_PAY.length !== SN) mismatch(`symbol count (${SN})`);
if (SYMBOL_ORDER[GO_WILD - 1] !== WILD) mismatch('the wild');
if (SYMBOL_ORDER[GO_SCAT - 1] !== SCATTER) mismatch('the scatter');
if (GO_PAY[GO_SCAT - 1].some((p) => p !== 0)) mismatch('the GONG paying on the lines');
if (!REELWILD) mismatch('the free games turning a reel with the wild wild');
if (!BON_IN_FREE) mismatch('the free games spinning on their own strips');
if (!SCAT_TOTAL) mismatch('the scatter paying the total bet');
if (!SPLIT_M1_L10 || FREE_SPINS_AWARD !== 10) mismatch('the par sheet (no multiplier, 10 free games a series)');
if (!LINES_NAME) mismatch('the bet lines being BetLinesNvm5x3v2');
if (SCAT_FROM !== SCAT_MIN) mismatch(`the scatter minimum (${SCAT_FROM})`);
for (let s = 0; s < SN; s++) {
  const sym = SYMBOL_ORDER[s];
  for (let k = 0; k < 5; k++) {
    const go = GO_PAY[s][k] ?? 0;
    // a run shorter than the Go's minimum never pays, whatever the table says
    const want = k + 1 < (s + 1 === GO_WILD ? RUN_FROM_W : RUN_FROM_L) ? 0 : go;
    if (LINE_PAY[sym][k] !== want) mismatch(`${sym} x${k + 1}: ships ${LINE_PAY[sym][k]}, Go pays ${want}`);
  }
}
for (let k = 1; k <= 5; k++) {
  if (SCAT_PAY[k - 1] !== (k >= SCAT_FROM ? GO_SCATPAY[k - 1] : 0)) mismatch(`the pay for ${k} scatters`);
  if (SCAT_FREESPIN[k - 1] !== (k >= SCAT_FROM ? GO_SCATFS[k - 1] : 0)) mismatch(`the free games for ${k} scatters`);
  if (k >= SCAT_FROM && GO_SCATFS[k - 1] !== FREE_SPINS_AWARD) mismatch(`the award for ${k} scatters`);
}
if (GO_LINES.length !== LINES || PAYLINES.length !== LINES) mismatch(`the number of bet lines (${GO_LINES.length})`);
for (let li = 0; li < LINES; li++) {
  if (GO_LINES[li].length !== REELS || GO_LINES[li].some((r, x) => r !== PAYLINES[li][x])) mismatch(`bet line ${li + 1}`);
}

/** pay(sym, count) with 1-based sym and count, the Go's run minimums applied. */
const pay = (sym: number, n: number) =>
  n >= (sym === GO_WILD ? RUN_FROM_W : RUN_FROM_L) ? (GO_PAY[sym - 1][n - 1] ?? 0) : 0;
const idOf = (s: SymbolId) => {
  const id = SYMBOL_ORDER.indexOf(s) + 1;
  if (id === 0) throw new Error(`symbol ${s} on a strip`);
  return id;
};

interface Reels {
  /** L[i] for 1-based reel i */
  L: number[];
  /** wild[i][r]: stops of reel i that read wild on row r */
  wild: number[][];
  /** counts[sym][i][r]: stops of reel i that read sym on row r (sym 1-based) */
  counts: number[][][];
  /** dist[i][k]: stops of reel i that show k scatters in the window */
  dist: number[][];
}

function precalc(reels: SymbolId[][], freeGame: boolean): Reels {
  const L = [0, ...reels.map((r) => r.length)];
  const wild: number[][] = [[]];
  const counts: number[][][] = [];
  for (let s = 0; s <= SN; s++) counts[s] = [[], ...reels.map(() => new Array(ROWS).fill(0))];
  const dist: number[][] = [[]];
  for (let i = 1; i <= REELS; i++) {
    const reel = reels[i - 1].map(idOf);
    const wi = new Array(ROWS).fill(0);
    const d = new Array(ROWS + 1).fill(0);
    for (let stop = 0; stop < reel.length; stop++) {
      const win = [0, 1, 2].map((y) => reel[(stop + y) % reel.length]);
      const reelWild = freeGame && win.includes(GO_WILD);
      for (let r = 0; r < ROWS; r++) {
        if (reelWild || win[r] === GO_WILD) wi[r]++;
        else counts[win[r]][i][r]++;
      }
      d[win.filter((s) => s === GO_SCAT).length]++;
    }
    wild.push(wi);
    dist.push(d);
  }
  return { L, wild, counts, dist };
}

/** Sum over all reshuffles of ONE line's pay, the line reading row rows[i - 1] of reel i. Line-bet units. */
function lineEv({ L, wild, counts }: Reels, rows: readonly number[], N: number): number {
  const w = (i: number) => wild[i][rows[i - 1]];
  const c = (s: number, i: number) => counts[s][i][rows[i - 1]];
  let ev = 0;
  let combos = 0;
  let lead = 1;
  for (let k = 0; k < REELS; k++) {
    if (k > 0) lead *= w(k);
    if (lead === 0) break;
    for (let S = 1; S <= SN; S++) {
      if (S === GO_WILD) continue;
      let run = lead * c(S, k + 1);
      for (let n = k + 1; n <= REELS && run > 0; n++) {
        if (n > k + 1) run *= w(n) + c(S, n);
        if (run === 0) break;
        let tail = 1;
        if (n < REELS) {
          tail = L[n + 1] - w(n + 1) - c(S, n + 1);
          for (let i = n + 2; i <= REELS; i++) tail *= L[i];
        }
        combos += run * tail;
        ev += run * tail * Math.max(pay(S, n), pay(GO_WILD, k));
      }
    }
  }
  let all = 1;
  for (let i = 1; i <= REELS; i++) all *= w(i);
  combos += all;
  ev += all * pay(GO_WILD, REELS);
  // Every reshuffle lands in exactly one (k, S, n) case or the five-wild one.
  if (combos !== N) throw new Error(`par sheet cases cover ${combos} reshuffles, want ${N}`);
  return ev;
}

/** Reshuffles by total scatter count: the scatter pays (total bets) and the free games awarded. */
function scatEv({ dist }: Reels) {
  let ways: number[] = [1];
  for (let i = 1; i <= REELS; i++) {
    const next = new Array(ways.length + ROWS).fill(0);
    for (let a = 0; a < ways.length; a++) for (let k = 0; k <= ROWS; k++) next[a + k] += ways[a] * dist[i][k];
    ways = next;
  }
  let pays = 0;
  let fs = 0;
  let triggers = 0;
  for (let c = SCAT_FROM; c < ways.length; c++) {
    if (ways[c] === 0) continue;
    if (c > 5) throw new Error(`${c} scatters can land, the tables stop at 5`);
    pays += ways[c] * GO_SCATPAY[c - 1];
    fs += ways[c] * GO_SCATFS[c - 1];
    if (GO_SCATFS[c - 1] > 0) triggers += ways[c];
  }
  return { pays, fs, triggers };
}

interface Block {
  N: number;
  /** each line's pay summed over every reshuffle, line bets */
  perLine: number[];
  scat: { pays: number; fs: number; triggers: number };
}

function block(reels: SymbolId[][], freeGame: boolean): Block {
  const r = precalc(reels, freeGame);
  const N = reels.reduce((a, x) => a * x.length, 1);
  return { N, perLine: GO_LINES.map((rows) => lineEv(r, rows, N)), scat: scatEv(r) };
}

/** The block's figures scoring the first `sel` lines (slotopol's Sel; cost sel line bets). */
function figures(b: Block, sel: number) {
  let units = 0;
  for (let li = 0; li < sel; li++) units += b.perLine[li];
  const lined = units / sel / b.N;
  const scat = b.scat.pays / b.N;
  const q = b.scat.fs / b.N;
  return { lined, scat, sym: lined + scat, q, sq: 1 / (1 - q) };
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

const bon = block(FREE_REELS, true);
const bases = REEL_SETS.map((set) => ({ set, b: block(set.reels, false) }));
for (const { set, b } of bases) {
  if (b.perLine.some((v) => v !== b.perLine[0])) {
    bad++;
    console.log(`  MISMATCH set ${set.rtp}: base lines should all earn the same`);
  }
}

for (const sel of [1, LINES]) {
  console.log(
    sel === 1
      ? '=== slotopol\'s par sheet as slotopol ran it: ONE line (Sel = 1, the middle row) ==='
      : '=== the game as played and paid: all 20 lines ===',
  );
  const fb = figures(bon, sel);
  const rtpFs = fb.sq * fb.sym;
  console.log('*bonus reels calculations*');
  console.log(`reels lengths [${FREE_REELS.map((r) => r.length).join(', ')}], total reshuffles ${bon.N}`);
  console.log(`symbols: ${sig5(fb.lined * 100)}(lined) + ${sig5(fb.scat * 100)}(scatter) = ${pct(fb.sym)}%`);
  console.log(`free spins ${bon.scat.fs}, q = ${sig5(fb.q)}, sq = 1/(1-q) = ${fb.sq.toFixed(6)}`);
  console.log(`RTP = sq*rtp(sym) = ${fb.sq.toFixed(6)}*${pct(fb.sym)} = ${pct(rtpFs)}%`);
  if (sel === 1) {
    const pb = printed.bon;
    check('reshuffles', bon.N, pb.total);
    check('lined', sig5(fb.lined * 100), pb.lined);
    check('scatter', sig5(fb.scat * 100), pb.scat);
    check('symbols', pct(fb.sym), pb.sym.toFixed(6));
    check('free spins', bon.scat.fs, pb.fs);
    check('q', sig5(fb.q), pb.q);
    check('sq', fb.sq.toFixed(6), pb.sq.toFixed(6));
    check('RTP per free game awarded', pct(rtpFs), pb.rtp.toFixed(6));
  }
  console.log('');

  let activeRtp = NaN;
  for (const { set, b } of bases) {
    const f = figures(b, sel);
    const total = f.sym + f.q * rtpFs;
    if (set === ACTIVE_REELS) activeRtp = total;
    console.log(`*regular reels ${set.rtp.toFixed(6)}%*${set === ACTIVE_REELS ? ' (ACTIVE)' : ''}`);
    console.log(`reels lengths [${set.reels.map((r) => r.length).join(', ')}], total reshuffles ${b.N}`);
    console.log(`symbols: ${sig5(f.lined * 100)}(lined) + ${sig5(f.scat * 100)}(scatter) = ${pct(f.sym)}%`);
    console.log(
      `free spins ${b.scat.fs}, q = ${sig5(f.q)}, sq = 1/(1-q) = ${f.sq.toFixed(6)}, free games 1 in ${(b.N / b.scat.triggers).toFixed(3)}`,
    );
    console.log(`RTP = ${pct(f.sym)}(sym) + ${sig5(f.q)}*${pct(rtpFs)}(fg) = ${pct(total)}%`);
    if (sel === 1) {
      const want = printed.sets.get(set.rtp.toFixed(6));
      if (!want) {
        bad++;
        console.log('  MISMATCH: slotopol prints no figures for this set');
      } else {
        check('reshuffles', b.N, want.total);
        check('symbols', pct(f.sym), want.sym.toFixed(6));
        check('lined', sig5(f.lined * 100), want.lined);
        check('scatter', sig5(f.scat * 100), want.scat);
        check('free spins', b.scat.fs, want.fs);
        check('q', sig5(f.q), want.q);
        check('sq', f.sq.toFixed(6), want.sq.toFixed(6));
        check('RTP', pct(total), want.rtp.toFixed(6));
      }
      check('label', pct(total), set.rtp.toFixed(6));
    }
  }
  if (sel === LINES) {
    check('shipped GAME_RTP', pct(activeRtp), GAME_RTP.toFixed(6));
    console.log(`\nACTIVE ${ACTIVE_REELS.rtp.toFixed(6)} on 20 lines: RTP ${pct(activeRtp)}%, shipped GAME_RTP ${GAME_RTP.toFixed(6)}%`);
  }
  console.log('');
}

console.log(
  bad === 0
    ? `slotopol's one-line par sheet is reproduced to 6 decimals for all ${REEL_SETS.length} base sets and the free ` +
        `games (symbols, integer free spins, q, sq and RTP of every block), and the 20-line game returns GAME_RTP ` +
        `${GAME_RTP.toFixed(6)}%.`
    : `${bad} figure(s) DO NOT match.`,
);
process.exit(bad === 0 ? 0 : 1);
