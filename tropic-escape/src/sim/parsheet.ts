/**
 * Analytic par sheet — a straight port of slotopol's own
 * bananasgobahamas_calc.lua, sharing no code with our evaluate().
 *
 * It counts winning combinations in closed form instead of enumerating grids,
 * so if this and src/sim/exact.ts agree on all seven reel sets, the shipped
 * evaluator and the shipped strips are both right.
 *
 * The paytable below is transcribed from the lua as well, and asserted equal
 * to the one the game actually ships, so a typo in either is a failure here.
 *
 *   npm run sim:parsheet
 */
import { BONUS_REELS, REEL_SETS } from '../engine/config/reelSets';
import { LINE_PAY, SCAT_FREESPIN, SCAT_PAY } from '../engine/config/paytable';
import { ROWS, SYMBOL_ORDER, type SymbolId } from '../engine/types';

const SX = 5; // reels
const SY = ROWS; // rows
const SN = 13; // symbols
const WILD = 1;
const SCAT = 13;
const LINE_MIN = 2;
const SCAT_MIN = 2;
const MW = 2; // multiplier on wilds

/** PAYTABLE_LINE from the lua, indexed [sym][count-1]. */
const LUA_PAY: number[][] = [
  [0, 10, 250, 2500, 9000], // 1 banana
  [0, 2, 30, 120, 800], // 2 strawberry
  [0, 2, 30, 120, 800], // 3 water
  [0, 0, 20, 100, 400], // 4 pineapple
  [0, 0, 20, 70, 250], // 5 mango
  [0, 0, 20, 70, 250], // 6 coconut
  [0, 0, 10, 50, 120], // 7 ace
  [0, 0, 10, 50, 120], // 8 king
  [0, 0, 4, 30, 100], // 9 queen
  [0, 0, 4, 30, 100], // 10 jack
  [0, 0, 4, 30, 100], // 11 ten
  [0, 2, 4, 30, 100], // 12 nine
  [0, 0, 0, 0, 0], // 13 suitcase, never pays on a line
];
const LUA_SCAT = [0, 2, 4, 20, 500];
const LUA_FS = [0, 0, 45, 45, 45];

// The shipped tables must say the same thing.
for (let s = 0; s < SN; s++) {
  const shipped = LINE_PAY[SYMBOL_ORDER[s]];
  for (let k = 0; k < 5; k++) {
    if (shipped[k] !== LUA_PAY[s][k]) {
      throw new Error(`paytable mismatch: ${SYMBOL_ORDER[s]} x${k + 1} ships ${shipped[k]}, lua says ${LUA_PAY[s][k]}`);
    }
  }
}
for (let k = 0; k < 5; k++) {
  if (SCAT_PAY[k] !== LUA_SCAT[k]) throw new Error(`scatter pay mismatch at ${k + 1}`);
  if (SCAT_FREESPIN[k] !== LUA_FS[k]) throw new Error(`free games mismatch at ${k + 1}`);
}

/** pay(sym, count) with 1-based sym and count, like the lua's tables. */
const pay = (sym: number, n: number) => LUA_PAY[sym - 1][n - 1];

interface Reels {
  /** L[i] for 1-based reel i */
  L: number[];
  /** counts[sym][i], both 1-based */
  counts: number[][];
  /** total reshuffles */
  N: number;
}

function precalc(reels: SymbolId[][]): Reels {
  const L = [0, ...reels.map((r) => r.length)];
  const N = reels.reduce((a, r) => a * r.length, 1);
  const counts: number[][] = [];
  for (let s = 0; s <= SN; s++) counts[s] = new Array(SX + 1).fill(0);
  for (let i = 1; i <= SX; i++) {
    for (const sym of reels[i - 1]) counts[SYMBOL_ORDER.indexOf(sym) + 1][i]++;
  }
  return { L, counts, N };
}

function lineEv({ L, counts }: Reels): number {
  let ev = 0;
  const w = counts[WILD];
  const wpays = LUA_PAY[WILD - 1];

  for (let sym = 1; sym <= SN; sym++) {
    if (sym === WILD) continue;
    const s = counts[sym];
    const c = [0];
    for (let i = 1; i <= SX; i++) c[i] = s[i] + w[i];

    for (let n = LINE_MIN; n <= SX; n++) {
      const payout = pay(sym, n);
      if (payout <= 0) continue;

      let combsTotal = 1;
      let combsNoWild = 1;
      for (let i = 1; i <= SX; i++) {
        if (i <= n) {
          combsTotal *= c[i];
          combsNoWild *= s[i];
        } else if (i === n + 1) {
          combsTotal *= L[i] - c[i];
          combsNoWild *= L[i] - c[i];
        } else {
          combsTotal *= L[i];
          combsNoWild *= L[i];
        }
      }

      // Runs a leading block of wilds would rather be paid as wilds.
      let betterWilds = 0;
      let wnMin = 0;
      for (let wn = LINE_MIN; wn <= n; wn++) {
        if (wpays[wn - 1] >= payout * MW) {
          wnMin = wn;
          break;
        }
      }
      if (wnMin > 0) {
        let bw = 1;
        for (let i = 1; i <= SX; i++) {
          if (i <= wnMin) bw *= w[i];
          else if (i <= n) bw *= c[i];
          else if (i === n + 1) bw *= L[i] - c[i];
          else bw *= L[i];
        }
        betterWilds = bw;
      }

      const combsWithWild = combsTotal - combsNoWild - betterWilds;
      ev += (combsNoWild + combsWithWild * MW) * payout;
    }
  }

  // The wild scored as a symbol in its own right.
  for (let n = LINE_MIN; n <= SX; n++) {
    const payout = wpays[n - 1];
    if (payout <= 0) continue;

    let wc = 1;
    for (let i = 1; i <= SX; i++) {
      if (i <= n) wc *= w[i];
      else if (i === n + 1) wc *= L[i] - w[i];
      else wc *= L[i];
    }

    // Minus the runs where a longer substituted run is worth more.
    let losses = 0;
    if (n < SX) {
      for (let sym = 1; sym <= SN; sym++) {
        if (sym === WILD) continue;
        const s = counts[sym];
        const c = [0];
        for (let i = 1; i <= SX; i++) c[i] = s[i] + w[i];
        for (let sn = n + 1; sn <= SX; sn++) {
          if (pay(sym, sn) * MW <= payout) continue;
          let loss = 1;
          for (let i = 1; i <= SX; i++) {
            if (i <= n) loss *= w[i];
            else if (i === n + 1) loss *= s[i];
            else if (i <= sn) loss *= c[i];
            else if (i === sn + 1) loss *= L[i] - c[i];
            else loss *= L[i];
          }
          losses += loss;
        }
      }
    }
    ev += (wc - losses) * payout;
  }

  return ev;
}

function scatEv({ L, counts }: Reels): { ev: number; fsSum: number; fsNum: number } {
  const c = counts[SCAT];
  let ev = 0;
  let fsSum = 0;
  let fsNum = 0;

  const walk = (i: number, scats: number, comb: number) => {
    if (i > SX) {
      if (scats >= SCAT_MIN) {
        ev += comb * LUA_SCAT[scats - 1];
        if (LUA_FS[scats - 1] > 0) {
          fsSum += comb * LUA_FS[scats - 1];
          fsNum += comb;
        }
      }
      return;
    }
    walk(i + 1, scats + 1, comb * c[i] * SY);
    walk(i + 1, scats, comb * (L[i] - c[i] * SY));
  };
  walk(1, 0, 1);
  return { ev, fsSum, fsNum };
}

const pct = (x: number) => (x * 100).toFixed(6);

function analyse(reels: SymbolId[][]) {
  const r = precalc(reels);
  const rtpLine = lineEv(r) / r.N;
  const { ev, fsSum, fsNum } = scatEv(r);
  const rtpScat = ev / r.N;
  return {
    N: r.N,
    L: r.L.slice(1),
    rtpLine,
    rtpScat,
    sym: rtpLine + rtpScat,
    q: fsSum / r.N,
    trigger: r.N / fsNum,
  };
}

const bon = analyse(BONUS_REELS);
const sq = 1 / (1 - bon.q);
const rtpFs = sq * bon.sym;
console.log('*bonus reels calculations*');
console.log(`reels lengths [${bon.L.join(', ')}], total reshuffles ${bon.N}`);
console.log(`symbols: ${pct(bon.rtpLine)}(lined) + ${pct(bon.rtpScat)}(scatter) = ${pct(bon.sym)}%`);
console.log(
  `free: HRfg = 1/${bon.trigger.toFixed(3)}, q = ${bon.q.toFixed(5)}, sq = 1/(1-q) = ${sq.toFixed(6)}`,
);
console.log(`RTP = sq*rtp(sym) = ${pct(rtpFs)}%   [slotopol: 210.461503%]\n`);

let bad = 0;
for (const set of REEL_SETS) {
  const a = analyse(set.reels);
  const total = a.sym + a.q * rtpFs;
  const ok = (total * 100).toFixed(6) === set.rtp.toFixed(6);
  if (!ok) bad++;
  console.log(`*regular reels ${set.rtp.toFixed(6)}%*`);
  console.log(`reels lengths [${a.L.join(', ')}], total reshuffles ${a.N}`);
  console.log(`symbols: ${pct(a.rtpLine)}(lined) + ${pct(a.rtpScat)}(scatter) = ${pct(a.sym)}%`);
  console.log(`free: HRfg = 1/${a.trigger.toFixed(3)}, q = ${a.q.toFixed(5)}`);
  console.log(
    `RTP = ${pct(a.sym)}(sym) + ${a.q.toFixed(5)}*${pct(rtpFs)}(fg) = ${pct(total)}%  ` +
      `${ok ? 'MATCH' : `MISMATCH, slotopol says ${set.rtp.toFixed(6)}`}\n`,
  );
}

console.log(
  bad === 0
    ? `all ${REEL_SETS.length} reel sets reproduce slotopol's published RTP to 6 decimals.`
    : `${bad} reel set(s) DO NOT match slotopol.`,
);
process.exit(bad === 0 ? 0 : 1);
