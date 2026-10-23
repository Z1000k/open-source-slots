/**
 * Analytic par sheet — closed forms that share no code with evaluate() or
 * exact.ts.
 *
 * slotopol ships no _calc.lua for dynastyofra, so the base side is our own
 * derivation of the line rule in dynastyofra_rule.go (ScanLinedReg): the SUN
 * DISC is skipped wherever it sits, a line pays as its first other symbol S
 * for as far as S reaches. With k leading sun discs, S at position k+1 and
 * S's run ending at n, per-reel symbol counts c_i(S), sun disc counts w_i
 * and lengths L_i, the reshuffles giving exactly (k, S, n) on a line number
 *
 *   w_1..w_k * c_{k+1}(S) * prod_{k+1<i<=n} (w_i + c_i(S))
 *            * (L_{n+1} - w_{n+1} - c_{n+1}(S)) * prod_{i>n+1} L_i
 *
 * (the break factor only when n < 5), plus w_1..w_5 lines of five sun discs,
 * which pay nothing. Every line has the same expectation, so this is the
 * whole line RTP. The scatter convolves each reel's count of sun discs per
 * window, read off the strips stop by stop.
 *
 * The free games are OUR rule, not slotopol's ScanWaysBon: the best way on
 * the screen pays, on all 10 lines. Its expectation is a tail sum over the
 * game's pay values v:
 *
 *   E[best] = sum over v of (v - previous v) * P(best >= v)
 *
 * Given reel 1's window, best >= v exactly when some candidate symbol s on
 * it shows on every reel 2..r_s(v), r_s(v) being the shortest run of s that
 * pays v or more. Reels are independent, so inclusion-exclusion over the
 * candidates gives that probability as products of "this reel's window
 * holds all of these symbols" counts.
 *
 * Nothing about the rules is typed by hand: the paytable, scatter pays,
 * free spins, the sun disc's id, the trigger count, the award and the
 * free-games multiplier are read straight out of slotopol's dynastyofra Go
 * source and asserted equal to what the game actually ships.
 *
 *   npm run sim:parsheet
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACTIVE_REELS, FREE_REELS, REEL_SETS, SLOTOPOL_FREE_REELS } from '../engine/config/reelSets';
import { LINE_PAY, SCAT_FREESPIN, SCAT_PAY } from '../engine/config/paytable';
import { GAME_RTP } from '../engine/config/rtp';
import { FREE_SPINS_AWARD, REELS, ROWS, SCATTER, SYMBOL_ORDER, WILD, type SymbolId } from '../engine/types';
import { readPrinted } from './printed';

const rule = readFileSync(resolve(import.meta.dirname, '../../slotopol/dynastyofra_rule.go'), 'utf8');
const scan = readFileSync(resolve(import.meta.dirname, '../../slotopol/dynastyofra_scan.go'), 'utf8');

const need = (src: string, re: RegExp, what: string): RegExpExecArray => {
  const m = re.exec(src);
  if (!m) throw new Error(`could not read ${what} from the slotopol source`);
  return m;
};
const nums = (list: string): number[] =>
  list.trim() === '' ? [] : list.split(',').map((n) => Number(n.trim()));

const SN = Number(need(rule, /\bsn\s*=\s*(\d+)/, 'sn')[1]);
const WSC = Number(need(rule, /\bwsc\s*=\s*(\d+)/, 'wsc')[1]);
/** LinePay from the Go, indexed [sym - 1][count - 1]; the sun disc's row is empty. */
const GO_PAY: number[][] = [];
const payBlock = need(rule, /var LinePay = \[sn\]\[5\]float64\{([\s\S]*?)\n\}/, 'LinePay')[1];
for (const m of payBlock.matchAll(/\{([\d,\s]*)\},/g)) GO_PAY.push(nums(m[1]));
const GO_SCATPAY = nums(need(rule, /var ScatPay = \[5\]float64\{([\d,\s]+)\}/, 'ScatPay')[1]);
const GO_SCATFS = nums(need(rule, /var ScatFreespin = \[5\]int\{([\d,\s]+)\}/, 'ScatFreespin')[1]);
const SCAT_MIN = Number(need(rule, /count := g\.SymNum\(wsc\); count >= (\d+)/, 'scatter minimum')[1]);
// Base lines skip the sun disc; the scatter pays the total bet; the free
// games pay their way on every selected line.
const WILD_SKIPS = /if sx == wsc \{\s*continue/.test(rule);
const SCAT_TOTAL_BET = /Pay:\s*g\.Bet \* float64\(g\.Sel\) \* pay/.test(rule);
const FREE_ALL_LINES = /wi\.Pay = pays[\s\S]*?for li, line := range BetLines\[:g\.Sel\]/.test(rule);
const [, mBon, lBon] = need(scan, /Parsheet_fgretrig\(w, sp, sb, g\.Cost\(\), (\d+), (\d+)\)/, 'free games parsheet');
const [, mReg, lReg] = need(
  scan,
  /Parsheet_fgretrig_split\(w, sp, sr, sb, g\.Cost\(\), (\d+), (\d+)\)/,
  'regular parsheet',
);
const MFS = Number(mBon); // multiplier on free spins

// The shipped game must say the same thing as the Go.
const mismatch = (what: string) => {
  throw new Error(`the shipped game disagrees with slotopol's Go source on ${what}`);
};
if (SN !== SYMBOL_ORDER.length || GO_PAY.length !== SN) mismatch(`symbol count (${SN})`);
if (SYMBOL_ORDER[WSC - 1] !== WILD || SYMBOL_ORDER[WSC - 1] !== SCATTER) mismatch('the sun disc (wild and scatter)');
if (!WILD_SKIPS) mismatch('the sun disc substituting on base lines');
if (!SCAT_TOTAL_BET) mismatch('the scatter paying the total bet');
if (!FREE_ALL_LINES) mismatch('the free games paying the way on every line');
if (MFS !== 1 || Number(mReg) !== MFS) mismatch('the free-game multiplier (the game ships none)');
if (Number(lBon) !== FREE_SPINS_AWARD || Number(lReg) !== FREE_SPINS_AWARD) mismatch('the free games award');
for (let s = 0; s < SN; s++) {
  const shipped = LINE_PAY[SYMBOL_ORDER[s]];
  for (let k = 0; k < 5; k++) {
    if (shipped[k] !== (GO_PAY[s][k] ?? 0)) {
      mismatch(`${SYMBOL_ORDER[s]} x${k + 1}: ships ${shipped[k]}, Go says ${GO_PAY[s][k] ?? 0}`);
    }
  }
}
for (let k = 1; k <= 5; k++) {
  const fsGo = k >= SCAT_MIN ? GO_SCATFS[k - 1] : 0;
  const payGo = k >= SCAT_MIN ? GO_SCATPAY[k - 1] : 0;
  if (SCAT_FREESPIN[k - 1] !== fsGo || (k >= SCAT_MIN && fsGo !== FREE_SPINS_AWARD)) mismatch(`free games for ${k} sun discs`);
  if (SCAT_PAY[k - 1] !== payGo) mismatch(`the scatter pay for ${k} sun discs`);
}

/** pay(sym, n) with 1-based sym and run length n */
const pay = (sym: number, n: number) => (n >= 1 ? (GO_PAY[sym - 1][n - 1] ?? 0) : 0);

interface Reels {
  L: number[]; // 1-based
  counts: number[][]; // [sym][reel], both 1-based
  dist: number[][]; // [reel][k]: stops showing k sun discs
  N: number;
}

function precalc(reels: SymbolId[][]): Reels {
  const L = [0, ...reels.map((r) => r.length)];
  const N = reels.reduce((a, r) => a * r.length, 1);
  const counts: number[][] = [];
  for (let s = 0; s <= SN; s++) counts[s] = new Array(REELS + 1).fill(0);
  const dist: number[][] = [[]];
  for (let i = 1; i <= REELS; i++) {
    const reel = reels[i - 1];
    for (const sym of reel) counts[SYMBOL_ORDER.indexOf(sym) + 1][i]++;
    const d = new Array(ROWS + 1).fill(0);
    for (let stop = 0; stop < reel.length; stop++) {
      let k = 0;
      for (let y = 0; y < ROWS; y++) if (SYMBOL_ORDER.indexOf(reel[(stop + y) % reel.length]) + 1 === WSC) k++;
      d[k]++;
    }
    dist.push(d);
  }
  return { L, counts, dist, N };
}

/** Sum over all reshuffles of ONE line's pay, in line-bet units. */
function lineEv({ L, counts, N }: Reels): number {
  const w = counts[WSC];
  let ev = 0;
  let combos = 0;
  let lead = 1;
  for (let k = 0; k < REELS; k++) {
    if (k > 0) lead *= w[k];
    if (lead === 0) break;
    for (let S = 1; S <= SN; S++) {
      if (S === WSC) continue;
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
        ev += run * tail * pay(S, n);
      }
    }
  }
  let all = 1;
  for (let i = 1; i <= REELS; i++) all *= w[i];
  combos += all; // five sun discs: no line pay

  // Every reshuffle lands in exactly one (k, S, n) case or the five-disc one.
  if (combos !== N) throw new Error(`par sheet cases cover ${combos} reshuffles, want ${N}`);
  return ev;
}

/** Scatter pays (total bets) and free spins summed over all reshuffles. */
function scatEv({ dist }: Reels): { pays: number; fs: number; triggers: number } {
  let ways = [1];
  for (let i = 1; i <= REELS; i++) {
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
    pays += ways[c] * GO_SCATPAY[Math.min(c, 5) - 1];
    fs += ways[c] * GO_SCATFS[Math.min(c, 5) - 1];
    triggers += ways[c];
  }
  return { pays, fs, triggers };
}

/** E[best way] of one free game in total bets: the tail sum with inclusion-exclusion. */
function bestWayEv(reels: SymbolId[][]): number {
  const strips = reels.map((r) => r.map((s) => SYMBOL_ORDER.indexOf(s) + 1));
  const L = strips.map((s) => s.length);
  const windows = strips.map((s) => s.map((_, i) => new Set([0, 1, 2].map((y) => s[(i + y) % s.length]))));
  const memo = new Map<string, number>();
  /** stops of reel k (0-based) whose window holds every symbol in U */
  const holding = (k: number, U: number[]): number => {
    if (U.length === 0) return L[k];
    const key = `${k}:${[...U].sort((a, b) => a - b).join(',')}`;
    let v = memo.get(key);
    if (v === undefined) {
      v = 0;
      for (const w of windows[k]) if (U.every((s) => w.has(s))) v++;
      memo.set(key, v);
    }
    return v;
  };
  const values = [...new Set(GO_PAY.flat().filter((v) => v > 0))].sort((a, b) => a - b);
  let ev = 0;
  for (const w1 of windows[0]) {
    const cands = [...w1].filter((s) => s !== WSC);
    let prev = 0;
    for (const v of values) {
      const live: { s: number; r: number }[] = [];
      for (const s of cands) {
        let r = 1;
        while (r <= REELS && pay(s, r) < v) r++;
        if (r <= REELS) live.push({ s, r });
      }
      let union = 0;
      for (let T = 1; T < 1 << live.length; T++) {
        let p = 1;
        let size = 0;
        for (let j = 0; j < live.length; j++) if (T & (1 << j)) size++;
        for (let k = 1; k < REELS; k++) {
          const U = live.filter((x, j) => T & (1 << j) && x.r >= k + 1).map((x) => x.s);
          p *= holding(k, U) / L[k];
        }
        union += size % 2 === 1 ? p : -p;
      }
      ev += (v - prev) * union;
      prev = v;
    }
  }
  return ev / L[0];
}

const pct = (x: number) => (x * 100).toFixed(6);
const printed = readPrinted();
let bad = 0;
const check = (what: string, got: string | number, want: string | number) => {
  if (got !== want) {
    bad++;
    console.log(`  MISMATCH ${what}: ${got}, want ${want}`);
  }
};

// slotopol's strips under the best-way rule: the fix's cost had they been kept.
{
  const r = precalc(SLOTOPOL_FREE_REELS);
  const s = scatEv(r);
  const way = bestWayEv(SLOTOPOL_FREE_REELS);
  console.log("*slotopol's free strips, best way paid* (not dealt)");
  console.log(`ways ${pct(way)}% + scatter ${pct(s.pays / r.N)}% = ${pct(way + s.pays / r.N)}%, ` +
    `free spins ${s.fs}, ${pct((MFS * (way + s.pays / r.N)) / (1 - s.fs / r.N))}% per free game awarded`);
  check('free spins on slotopol free strips', s.fs, printed.bonus.fs);
  console.log('');
}

// OUR free games: rtp_fs = mfs * sq * (way + scatter), retriggers included.
const fr = precalc(FREE_REELS);
const fs = scatEv(fr);
const fWay = bestWayEv(FREE_REELS);
const fSym = fWay + fs.pays / fr.N;
const fq = fs.fs / fr.N;
const sq = 1 / (1 - fq);
const rtpFs = MFS * sq * fSym;
console.log('*our free reels* (best way pays on all 10 lines, sun disc not wild)');
console.log(`reels lengths [${fr.L.slice(1).join(', ')}], total reshuffles ${fr.N}`);
console.log(`symbols: ${pct(fWay)}(ways) + ${pct(fs.pays / fr.N)}(scatter) = ${pct(fSym)}%`);
console.log(`free spins ${fs.fs}, q = ${fq.toFixed(6)}, sq = 1/(1-q) = ${sq.toFixed(6)}, HRfg = 1/${(fr.N / fs.triggers).toFixed(3)}`);
console.log(`RTP = ${MFS}*sq*rtp(sym) = ${pct(rtpFs)}% per free game awarded\n`);

for (const set of REEL_SETS) {
  const r = precalc(set.reels);
  const lines = lineEv(r) / r.N;
  const s = scatEv(r);
  const sym = lines + s.pays / r.N;
  const q = s.fs / r.N;
  const ours = sym + q * rtpFs;
  const want = printed.sets.get(set.rtp.toFixed(6));
  const active = set === ACTIVE_REELS;
  console.log(`*regular reels ${set.rtp.toFixed(6)}*${active ? ' (ACTIVE, original)' : ''}`);
  console.log(`reels lengths [${r.L.slice(1).join(', ')}], total reshuffles ${r.N}`);
  console.log(`symbols: ${pct(lines)}(lined) + ${pct(s.pays / r.N)}(scatter) = ${pct(sym)}%`);
  console.log(`free spins ${s.fs}, q = ${q.toFixed(6)}, HRfg = 1/${(r.N / s.triggers).toFixed(3)}`);
  console.log(`RTP = ${pct(sym)}(sym) + ${q.toFixed(6)}*${pct(rtpFs)}(fg) = ${pct(ours)}%`);
  if (!want) {
    bad++;
    console.log('  MISMATCH: slotopol prints no figures for this set');
  } else {
    check('reshuffles', r.N, want.total);
    check('symbols', pct(sym), want.sym.toFixed(6));
    check('free spins', s.fs, want.fs);
    check("label through slotopol's printed free games", pct(sym + q * (printed.bonus.rtp / 100)), set.rtp.toFixed(6));
  }
  if (active) check('GAME_RTP', pct(ours), GAME_RTP.toFixed(6));
  console.log('');
}

console.log(
  bad === 0
    ? `all ${REEL_SETS.length} base sets reproduce slotopol's printed base figures to 6 decimals (symbols, ` +
        `integer free spins), every label reproduces through slotopol's free-games figure, and the ACTIVE set ` +
        `with our free games is GAME_RTP ${GAME_RTP.toFixed(6)}% exactly.`
    : `${bad} figure(s) DO NOT match.`,
);
process.exit(bad === 0 ? 0 : 1);
