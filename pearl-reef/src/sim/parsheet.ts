/**
 * Analytic par sheet — a straight port of slotopol's own
 * dolphinspearl_calc.lua, sharing no code with our evaluate().
 *
 * It counts winning combinations in closed form instead of enumerating grids,
 * so if this and src/sim/exact.ts agree on all nine reel sets, the shipped
 * evaluator and the shipped strips are both right.
 *
 * Nothing here is typed by hand: the paytable, scatter table, free games
 * table and the wild and free-game multipliers are read straight out of
 * slotopol/dolphinspearl_calc.lua, and asserted equal to what the game
 * actually ships, so a typo in our tables is a failure here.
 *
 *   npm run sim:parsheet
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BONUS_REELS, REEL_SETS, ACTIVE_REELS } from '../engine/config/reelSets';
import { LINE_PAY, SCAT_FREESPIN, SCAT_PAY } from '../engine/config/paytable';
import {
  FREE_GAME_MULT,
  FREE_SPINS_AWARD,
  REELS,
  ROWS,
  SCATTER,
  SYMBOL_ORDER,
  WILD,
  WILD_MULT,
  type SymbolId,
} from '../engine/types';

const LUA_FILE = resolve(import.meta.dirname, '../../slotopol/dolphinspearl_calc.lua');
const src = readFileSync(LUA_FILE, 'utf8');

const need = (re: RegExp, what: string): RegExpExecArray => {
  const m = re.exec(src);
  if (!m) throw new Error(`could not read ${what} from ${LUA_FILE}`);
  return m;
};
const nums = (list: string): number[] =>
  list.trim() === '' ? [] : list.split(',').map((n) => Number(n.trim()));

/** PAYTABLE_LINE from the lua, indexed [sym - 1][count - 1]; the scatter's row is empty. */
const LUA_PAY: number[][] = [];
const payBlock = need(/local PAYTABLE_LINE = \{([\s\S]*?)\n\}/, 'PAYTABLE_LINE')[1];
for (const m of payBlock.matchAll(/\[\s*(\d+)\]\s*=\s*\{([\d,\s]*)\}/g)) {
  LUA_PAY[Number(m[1]) - 1] = nums(m[2]);
}
const LUA_SCAT = nums(need(/local PAYTABLE_SCAT = \{([\d,\s]+)\}/, 'PAYTABLE_SCAT')[1]);
const LUA_FS = nums(need(/local FREESPIN_SCAT = \{([\d,\s]+)\}/, 'FREESPIN_SCAT')[1]);
const [, sxs, sys] = need(/local sx, sy = (\d+), (\d+)/, 'sx, sy');
const [, wilds, scats] = need(/local wild, scat = (\d+), (\d+)/, 'wild, scat');
const LINE_MIN = Number(need(/local line_min = (\d+)/, 'line_min')[1]);
const SCAT_MIN = Number(need(/local scat_min = (\d+)/, 'scat_min')[1]);
const MW = Number(need(/local mw = (\d+)/, 'mw')[1]); // multiplier on wilds
const MFS = Number(need(/local mfs = (\d+)/, 'mfs')[1]); // multiplier on free spins

const SX = Number(sxs);
const SY = Number(sys);
const LUA_WILD = Number(wilds);
const LUA_SCAT_SYM = Number(scats);
const SN = LUA_PAY.length;

// The shipped game must say the same thing as the lua.
const mismatch = (what: string) => {
  throw new Error(`the shipped game disagrees with the lua on ${what}`);
};
if (SN !== SYMBOL_ORDER.length) mismatch(`symbol count (${SN})`);
if (SX !== REELS || SY !== ROWS) mismatch('grid size');
if (SYMBOL_ORDER[LUA_WILD - 1] !== WILD) mismatch('the wild');
if (SYMBOL_ORDER[LUA_SCAT_SYM - 1] !== SCATTER) mismatch('the scatter');
if (MW !== WILD_MULT) mismatch('the wild multiplier');
if (MFS !== FREE_GAME_MULT) mismatch('the free-game multiplier');
for (let s = 0; s < SN; s++) {
  const shipped = LINE_PAY[SYMBOL_ORDER[s]];
  for (let k = 0; k < 5; k++) {
    if (shipped[k] !== (LUA_PAY[s][k] ?? 0)) {
      mismatch(`${SYMBOL_ORDER[s]} x${k + 1}: ships ${shipped[k]}, lua says ${LUA_PAY[s][k] ?? 0}`);
    }
  }
}
for (let k = 0; k < 5; k++) {
  if (SCAT_PAY[k] !== LUA_SCAT[k]) mismatch(`scatter pay x${k + 1}`);
  if (SCAT_FREESPIN[k] !== LUA_FS[k]) mismatch(`free games x${k + 1}`);
  if (LUA_FS[k] !== 0 && LUA_FS[k] !== FREE_SPINS_AWARD) mismatch(`free games award x${k + 1}`);
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
  const w = counts[LUA_WILD];
  const wpays = LUA_PAY[LUA_WILD - 1];

  for (let sym = 1; sym <= SN; sym++) {
    if (sym === LUA_WILD || LUA_PAY[sym - 1].length === 0) continue;
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
        if (sym === LUA_WILD || LUA_PAY[sym - 1].length === 0) continue;
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
  const c = counts[LUA_SCAT_SYM];
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

// The lua scores the bonus strips WITHOUT the triple, then applies it:
// rtp_fs = mfs * sq * rtp_sym.
const bon = analyse(BONUS_REELS);
const sq = 1 / (1 - bon.q);
const rtpFs = MFS * sq * bon.sym;
const fgOk = (rtpFs * 100).toFixed(6) === '618.143873';
console.log('*bonus reels calculations*');
console.log(`reels lengths [${bon.L.join(', ')}], total reshuffles ${bon.N}`);
console.log(`symbols: ${pct(bon.rtpLine)}(lined) + ${pct(bon.rtpScat)}(scatter) = ${pct(bon.sym)}%`);
console.log(
  `free: HRfg = 1/${bon.trigger.toFixed(3)}, q = ${bon.q.toFixed(5)}, sq = 1/(1-q) = ${sq.toFixed(6)}`,
);
console.log(
  `RTP = ${MFS}*sq*rtp(sym) = ${MFS}*${sq.toFixed(5)}*${pct(bon.sym)} = ${pct(rtpFs)}%  ` +
    `${fgOk ? 'MATCH' : 'MISMATCH'} [slotopol: 618.143873%]\n`,
);

let bad = fgOk ? 0 : 1;
for (const set of REEL_SETS) {
  const a = analyse(set.reels);
  const total = a.sym + a.q * rtpFs;
  const ok = (total * 100).toFixed(6) === set.rtp.toFixed(6);
  if (!ok) bad++;
  console.log(`*regular reels ${set.rtp.toFixed(6)}%*${set === ACTIVE_REELS ? ' (ACTIVE, original)' : ''}`);
  console.log(`reels lengths [${a.L.join(', ')}], total reshuffles ${a.N}`);
  console.log(`symbols: ${pct(a.rtpLine)}(lined) + ${pct(a.rtpScat)}(scatter) = ${pct(a.sym)}%`);
  console.log(`free: HRfg = 1/${a.trigger.toFixed(3)}, q = ${a.q.toFixed(6)}`);
  console.log(
    `RTP = ${pct(a.sym)}(sym) + ${a.q.toFixed(6)}*${pct(rtpFs)}(fg) = ${pct(total)}%  ` +
      `${ok ? 'MATCH' : `MISMATCH, slotopol says ${set.rtp.toFixed(6)}`}\n`,
  );
}

console.log(
  bad === 0
    ? `all ${REEL_SETS.length} reel sets and the free games reproduce slotopol's published RTP to 6 decimals.`
    : `${bad} figure(s) DO NOT match slotopol.`,
);
process.exit(bad === 0 ? 0 : 1);
