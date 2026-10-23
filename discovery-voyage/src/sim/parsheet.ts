/**
 * Analytic par sheet — counts winning combinations in closed form, sharing
 * no code with our evaluate().
 *
 * slotopol ships no _calc.lua for columbus, so this is our own derivation
 * of the line rule in columbus_rule.go. A line pays max(run pay, wild pay),
 * where the run is decided by k, the number of leading wilds, S, the first
 * non-wild symbol (at position k+1), and n, how far S's run reaches with
 * wilds substituting. With per-reel symbol counts c_i(s), wild counts w_i and
 * lengths L_i, the number of reshuffles giving exactly (k, S, n) on a line is
 *
 *   w_1..w_k * c_{k+1}(S) * prod_{k+1<i<=n} (w_i + c_i(S))
 *            * (L_{n+1} - w_{n+1} - c_{n+1}(S)) * prod_{i>n+1} L_i
 *
 * (the break factor only when n < 5), plus w_1..w_5 lines of five wilds.
 * Every line has the same expectation (one row per reel, uniform stops), so
 * this is the whole line RTP. The scatter side convolves each reel's count
 * of GALLEONs per window, read off the strips stop by stop.
 *
 * Nothing about the rules is typed by hand: the paytable, wild and scatter
 * ids, the free-game wild (wbon), the trigger count and award, and the
 * free-game multiplier are read straight out of slotopol's columbus Go
 * source and asserted equal to what the game actually ships, so a typo in
 * our tables is a failure here.
 *
 *   npm run sim:parsheet
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BONUS_REELS, REEL_SETS, ACTIVE_REELS } from '../engine/config/reelSets';
import { LINE_PAY, SCAT_FREESPIN } from '../engine/config/paytable';
import { FREE_SPINS_AWARD, REELS, ROWS, SCATTER, SYMBOL_ORDER, WILD, type SymbolId } from '../engine/types';
import { readPrinted } from './printed';

const RULE_FILE = resolve(import.meta.dirname, '../../slotopol/columbus_rule.go');
const SCAN_FILE = resolve(import.meta.dirname, '../../slotopol/columbus_scan.go');
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
/** LinePay from the Go, indexed [sym - 1][count - 1]; the ship's row is empty. */
const GO_PAY: number[][] = [];
const payBlock = need(rule, /var LinePay = \[sn\]\[5\]float64\{([\s\S]*?)\n\}/, 'LinePay')[1];
for (const m of payBlock.matchAll(/\{([\d,\s]*)\},/g)) GO_PAY.push(nums(m[1]));
/** In free games the scatter is also wild on the lines: `if g.FSR > 0 { wbon = scat }`. */
const FREE_WILD_SCAT =
  /if g\.FSR > 0 \{\s*wbon = scat\s*\}/.test(rule) && /sx == wild \|\| sx == wbon/.test(rule);
const SCAT_MIN = Number(need(rule, /count := g\.SymNum\(scat\); count >= (\d+)/, 'scatter minimum')[1]);
const FS_AWARD = Number(need(rule, /FS:\s*(\d+),/, 'free spins award')[1]);
const [, mBon, lBon] = need(scan, /Parsheet_fgretrig\(w, sp, sb, g\.Cost\(\), (\d+), (\d+)\)/, 'bonus parsheet');
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
if (SYMBOL_ORDER[GO_WILD - 1] !== WILD) mismatch('the wild');
if (SYMBOL_ORDER[GO_SCAT - 1] !== SCATTER) mismatch('the scatter');
if (!FREE_WILD_SCAT) mismatch('the scatter turning wild in free games');
if (MFS !== 1 || Number(mReg) !== MFS) mismatch('the free-game multiplier (the game ships none)');
if (Number(lBon) !== FS_AWARD || Number(lReg) !== FS_AWARD || FS_AWARD !== FREE_SPINS_AWARD) {
  mismatch('the free games award');
}
for (let s = 0; s < SN; s++) {
  const shipped = LINE_PAY[SYMBOL_ORDER[s]];
  for (let k = 0; k < 5; k++) {
    if (shipped[k] !== (GO_PAY[s][k] ?? 0)) {
      mismatch(`${SYMBOL_ORDER[s]} x${k + 1}: ships ${shipped[k]}, Go says ${GO_PAY[s][k] ?? 0}`);
    }
  }
}
for (let k = 1; k <= 5; k++) {
  if (SCAT_FREESPIN[k - 1] !== (k >= SCAT_MIN ? FS_AWARD : 0)) mismatch(`free games for ${k} scatters`);
}

/** pay(sym, count) with 1-based sym and count; runs under 2 never pay (numw/numl >= 2). */
const pay = (sym: number, n: number) => (n >= 2 ? (GO_PAY[sym - 1][n - 1] ?? 0) : 0);

interface Reels {
  /** L[i] for 1-based reel i */
  L: number[];
  /** counts[sym][i], both 1-based */
  counts: number[][];
  /** dist[i][k]: stops of reel i that show k scatters in the window */
  dist: number[][];
  /** total reshuffles */
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
      for (let y = 0; y < ROWS; y++) if (SYMBOL_ORDER.indexOf(reel[(stop + y) % reel.length]) + 1 === GO_SCAT) k++;
      d[k]++;
    }
    dist.push(d);
  }
  return { L, counts, dist, N };
}

/** Sum over all reshuffles of ONE line's pay, in line-bet units. */
function lineEv({ L, counts, N }: Reels, wilds: number[]): number {
  const w = [0];
  for (let i = 1; i <= REELS; i++) w[i] = wilds.reduce((a, s) => a + counts[s][i], 0);
  const wpay = (k: number) => pay(GO_WILD, k);

  let ev = 0;
  let combos = 0;
  let lead = 1;
  for (let k = 0; k < REELS; k++) {
    if (k > 0) lead *= w[k];
    if (lead === 0) break;
    for (let S = 1; S <= SN; S++) {
      if (wilds.includes(S)) continue;
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

/** Reshuffles by total scatter count, then the free spins they award. */
function scatEv({ dist }: Reels): { fs: number; triggers: number } {
  let ways = [1];
  for (let i = 1; i <= REELS; i++) {
    const next = new Array(ways.length + ROWS).fill(0);
    for (let a = 0; a < ways.length; a++) {
      for (let k = 0; k <= ROWS; k++) next[a + k] += ways[a] * dist[i][k];
    }
    ways = next;
  }
  let fs = 0;
  let triggers = 0;
  for (let c = SCAT_MIN; c < ways.length; c++) {
    fs += ways[c] * FS_AWARD;
    triggers += ways[c];
  }
  return { fs, triggers };
}

const pct = (x: number) => (x * 100).toFixed(6);

function analyse(reels: SymbolId[][], freeGame: boolean) {
  const r = precalc(reels);
  const rtpLine = lineEv(r, freeGame ? [GO_WILD, GO_SCAT] : [GO_WILD]) / r.N;
  const { fs, triggers } = scatEv(r);
  return { N: r.N, L: r.L.slice(1), rtpLine, fs, q: fs / r.N, trigger: r.N / triggers };
}

const printed = readPrinted();
let bad = 0;
const check = (what: string, got: string | number, want: string | number) => {
  if (got !== want) {
    bad++;
    console.log(`  MISMATCH ${what}: ${got}, slotopol says ${want}`);
  }
};

// rtp_fs = mfs * sq * rtp_sym, exactly Parsheet_fgretrig.
const bon = analyse(BONUS_REELS, true);
const sq = 1 / (1 - bon.q);
const rtpFs = MFS * sq * bon.rtpLine;
console.log('*bonus reels calculations* (GALLEON wild on the lines)');
console.log(`reels lengths [${bon.L.join(', ')}], total reshuffles ${bon.N}`);
console.log(`symbols: ${pct(bon.rtpLine)}(lined) + 0(scatter) = ${pct(bon.rtpLine)}%`);
console.log(
  `free spins ${bon.fs}, q = ${bon.q.toFixed(6)}, sq = 1/(1-q) = ${sq.toFixed(6)}, HRfg = 1/${bon.trigger.toFixed(3)}`,
);
console.log(`RTP = ${MFS}*sq*rtp(sym) = ${pct(rtpFs)}%`);
check('bonus reshuffles', bon.N, printed.bonus.total);
check('bonus symbols', pct(bon.rtpLine), printed.bonus.sym.toFixed(6));
check('bonus free spins', bon.fs, printed.bonus.fs);
check('free games RTP', pct(rtpFs), printed.bonus.rtp.toFixed(6));
console.log('');

for (const set of REEL_SETS) {
  const a = analyse(set.reels, false);
  const total = a.rtpLine + a.q * rtpFs;
  const want = printed.sets.get(set.rtp.toFixed(6));
  console.log(`*regular reels ${set.rtp.toFixed(6)}%*${set === ACTIVE_REELS ? ' (ACTIVE, original)' : ''}`);
  console.log(`reels lengths [${a.L.join(', ')}], total reshuffles ${a.N}`);
  console.log(`symbols: ${pct(a.rtpLine)}(lined) + 0(scatter) = ${pct(a.rtpLine)}%`);
  console.log(`free spins ${a.fs}, q = ${a.q.toFixed(6)}, HRfg = 1/${a.trigger.toFixed(3)}`);
  console.log(`RTP = ${pct(a.rtpLine)}(sym) + ${a.q.toFixed(6)}*${pct(rtpFs)}(fg) = ${pct(total)}%`);
  if (!want) {
    bad++;
    console.log('  MISMATCH: slotopol prints no figures for this set');
  } else {
    check('reshuffles', a.N, want.total);
    check('symbols', pct(a.rtpLine), want.sym.toFixed(6));
    check('free spins', a.fs, want.fs);
  }
  check('RTP', pct(total), set.rtp.toFixed(6));
  console.log('');
}

console.log(
  bad === 0
    ? `all ${REEL_SETS.length} reel sets and the free games reproduce slotopol to 6 decimals ` +
        `(symbols, integer free spins and RTP of every block).`
    : `${bad} figure(s) DO NOT match slotopol.`,
);
process.exit(bad === 0 ? 0 : 1);
