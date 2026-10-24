/**
 * EXACT verification of every shipped reel set — no sampling anywhere.
 *
 * Phase 1 factors the game the way it actually factors:
 *
 *   - Line wins. Every bet line takes one row from each reel, and with a
 *     uniform stop that row's symbol is uniform over the strip, independent
 *     across reels. So every line has the same expectation, and that
 *     expectation is a weighted sum over the 13^5 symbol tuples. Each tuple is
 *     scored by the SHIPPED evaluate(), on a grid whose columns are constant,
 *     where all 9 lines read that tuple.
 *   - Scatter wins and the free games they award. checkReels proves no strip
 *     shows two scatters in one window, so a reel either shows a scatter or it
 *     does not, with probability count*3/length. That is 32 cases, again
 *     scored by the shipped evaluate().
 *
 *   RTP(free games) = rtp(sym on bonus strips) / (1 - q(bonus))   [retriggers]
 *   RTP(set)        = rtp(sym) + q * RTP(free games)
 *
 * Phase 2 then brute-forces every stop combination of the active set and of
 * the bonus set (102,564,030 and 57,153,600 grids) with a fast integer
 * evaluator that is first proven to agree with the shipped evaluate() on
 * millions of random grids. That reproduces phase 1 from a completely
 * different direction and also gives the exact hit rate and the biggest
 * single spin the strips allow.
 *
 *   npm run sim:exact
 */
import { BONUS_REELS, REEL_SETS } from '../engine/config/reelSets';
import { evaluate } from '../engine/evaluate';
import { LINE_PAY, SCAT_FREESPIN, SCAT_PAY } from '../engine/config/paytable';
import { PAYLINES } from '../engine/config/paylines';
import {
  LINES,
  REELS,
  ROWS,
  SCATTER,
  SYMBOL_ORDER,
  WILD,
  type Grid,
  type SymbolId,
} from '../engine/types';

// ---------------------------------------------------------------- phase 1

/** Expected line win of ONE bet line, in line-bet units = its RTP share. */
function lineRtp(reels: SymbolId[][]): number {
  const counts = reels.map((reel) => {
    const m = new Map<SymbolId, number>();
    for (const s of reel) m.set(s, (m.get(s) ?? 0) + 1);
    return [...m.entries()];
  });
  const n = reels.reduce((a, r) => a * r.length, 1);

  const column: SymbolId[] = new Array(REELS);
  let total = 0;

  const walk = (x: number, weight: number) => {
    if (x === REELS) {
      const grid: Grid = column.map((s) => [s, s, s]);
      let pay = 0;
      for (const w of evaluate(grid).lineWins) pay += w.amount;
      // All 9 lines read the same tuple, so the sum of their total-bet
      // amounts is exactly what one line pays in line-bet units.
      if (pay > 0) total += weight * pay;
      return;
    }
    for (const [sym, c] of counts[x]) {
      column[x] = sym;
      walk(x + 1, weight * c);
    }
  };
  walk(0, 1);
  return total / n;
}

/** Scatter RTP and expected free games awarded per spin. */
function scatterRtp(reels: SymbolId[][]): { rtp: number; q: number } {
  const p = reels.map((reel) => {
    const c = reel.filter((s) => s === SCATTER).length;
    return (c * ROWS) / reel.length;
  });

  let rtp = 0;
  let q = 0;
  for (let mask = 0; mask < 1 << REELS; mask++) {
    let prob = 1;
    const grid: Grid = [];
    for (let x = 0; x < REELS; x++) {
      if (mask & (1 << x)) {
        prob *= p[x];
        grid.push([SCATTER, 'NINE', 'NINE']);
      } else {
        prob *= 1 - p[x];
        grid.push(['NINE', 'NINE', 'NINE']);
      }
    }
    if (prob === 0) continue;
    const r = evaluate(grid);
    rtp += prob * (r.scatterWin?.amount ?? 0);
    q += prob * r.freeSpinsWon;
  }
  return { rtp, q };
}

function symbolRtp(reels: SymbolId[][]) {
  const line = lineRtp(reels);
  const scat = scatterRtp(reels);
  return { line, scat: scat.rtp, q: scat.q, sym: line + scat.rtp };
}

const pct = (x: number) => (x * 100).toFixed(6);

/** q counts 45 free games per trigger, so 45/q is spins per trigger. */
const triggerRate = (q: number) => 45 / q;

console.log('=== phase 1: factored exact enumeration through the shipped evaluate() ===\n');

const bon = symbolRtp(BONUS_REELS);
const sq = 1 / (1 - bon.q);
const rtpFs = sq * bon.sym;
console.log('bonus strips');
console.log(
  `  reels lengths [${BONUS_REELS.map((r) => r.length).join(', ')}], ` +
    `reshuffles ${BONUS_REELS.reduce((a, r) => a * r.length, 1)}`,
);
console.log(`  symbols: ${pct(bon.line)}(lined) + ${pct(bon.scat)}(scatter) = ${pct(bon.sym)}%`);
console.log(
  `  free: q = ${bon.q.toFixed(6)}, sq = 1/(1-q) = ${sq.toFixed(6)}, ` +
    `retrigger rate 1/${triggerRate(bon.q).toFixed(3)}`,
);
console.log(`  RTP = sq*rtp(sym) = ${pct(rtpFs)}%   [slotopol: 210.461503%]\n`);

let bad = 0;
for (const set of REEL_SETS) {
  const r = symbolRtp(set.reels);
  const total = r.sym + r.q * rtpFs;
  const ok = (total * 100).toFixed(6) === set.rtp.toFixed(6);
  if (!ok) bad++;
  console.log(
    `set ${set.rtp.toFixed(6)}%: symbols ${pct(r.line)}(lined) + ${pct(r.scat)}(scatter) = ` +
      `${pct(r.sym)}%, q = ${r.q.toFixed(6)}, free games 1/${triggerRate(r.q).toFixed(3)}`,
  );
  console.log(
    `  RTP = ${pct(r.sym)} + ${r.q.toFixed(5)}*${pct(rtpFs)} = ${pct(total)}%  ` +
      `${ok ? 'MATCH' : `MISMATCH, slotopol says ${set.rtp.toFixed(6)}`}`,
  );
}
console.log(
  bad === 0
    ? `\nall ${REEL_SETS.length} reel sets reproduce slotopol's published RTP to 6 decimals.\n`
    : `\n${bad} reel set(s) DO NOT match slotopol.\n`,
);

// ---------------------------------------------------------------- phase 2

/**
 * Integer scorer over numeric symbol ids, used only to brute-force all stop
 * combinations at speed. Returns the spin win in LINE-BET units (divide by 9
 * for total-bet multiples) so everything stays exact integer arithmetic.
 */
const PAY = new Int32Array(SYMBOL_ORDER.length * 5);
for (let s = 0; s < SYMBOL_ORDER.length; s++) {
  const row = LINE_PAY[SYMBOL_ORDER[s]];
  for (let k = 0; k < 5; k++) PAY[s * 5 + k] = row[k];
}
const SCAT = new Int32Array(6);
const SCATFS = new Int32Array(6);
for (let k = 0; k < 5; k++) {
  SCAT[k] = SCAT_PAY[k];
  SCATFS[k] = SCAT_FREESPIN[k];
}
const WILD_N = SYMBOL_ORDER.indexOf(WILD) + 1;
const SCAT_N = SYMBOL_ORDER.indexOf(SCATTER) + 1;
const LINE_ROWS = new Int32Array(LINES * REELS);
for (let li = 0; li < LINES; li++) {
  for (let x = 0; x < REELS; x++) LINE_ROWS[li * REELS + x] = PAYLINES[li][x];
}

/** g[x * ROWS + y] holds the numeric symbol id. */
function fastWin(g: Int8Array): number {
  let units = 0;
  for (let li = 0; li < LINES; li++) {
    const base = li * REELS;
    let syml = 0;
    let numw = 0;
    let numl = REELS;
    let mw = 1;
    for (let x = 1; x <= REELS; x++) {
      const s = g[(x - 1) * ROWS + LINE_ROWS[base + x - 1]];
      if (s === WILD_N) {
        if (syml === 0) numw = x;
        mw = 2;
      } else if (syml === 0) {
        syml = s;
      } else if (s !== syml) {
        numl = x - 1;
        break;
      }
    }
    const payw = numw >= 2 ? PAY[(WILD_N - 1) * 5 + numw - 1] : 0;
    const payl = numl >= 2 && syml > 0 ? PAY[(syml - 1) * 5 + numl - 1] : 0;
    const won = payl * mw > payw ? payl * mw : payw;
    units += won;
  }
  let sc = 0;
  for (let i = 0; i < REELS * ROWS; i++) if (g[i] === SCAT_N) sc++;
  if (sc >= 2) units += LINES * SCAT[sc - 1];
  return units;
}

function fastFreeSpins(g: Int8Array): number {
  let sc = 0;
  for (let i = 0; i < REELS * ROWS; i++) if (g[i] === SCAT_N) sc++;
  return sc >= 2 ? SCATFS[sc - 1] : 0;
}

/** Prove the fast scorer says exactly what the shipped engine says. */
function proveScorer(trials: number) {
  const pool = [...REEL_SETS.map((s) => s.reels), BONUS_REELS];
  const g = new Int8Array(REELS * ROWS);
  for (let t = 0; t < trials; t++) {
    const reels = pool[(Math.random() * pool.length) | 0];
    const grid: Grid = [];
    for (let x = 0; x < REELS; x++) {
      const reel = reels[x];
      const stop = (Math.random() * reel.length) | 0;
      const col: SymbolId[] = [];
      for (let y = 0; y < ROWS; y++) {
        const sym = reel[(stop + y) % reel.length];
        col.push(sym);
        g[x * ROWS + y] = SYMBOL_ORDER.indexOf(sym) + 1;
      }
      grid.push(col);
    }
    const want = evaluate(grid);
    const got = fastWin(g) / LINES;
    if (Math.abs(want.totalWin - got) > 1e-9) {
      throw new Error(`scorer disagrees: engine ${want.totalWin} vs fast ${got}`);
    }
    if (want.freeSpinsWon !== fastFreeSpins(g)) {
      throw new Error(`free spins disagree on ${JSON.stringify(grid)}`);
    }
  }
  console.log(`fast scorer agrees with the shipped evaluate() on ${trials} random grids.`);
}

/** Every stop combination of one reel set. */
function bruteForce(reels: SymbolId[][], label: string) {
  const windows = reels.map((reel) => {
    const w = new Int8Array(reel.length * ROWS);
    for (let stop = 0; stop < reel.length; stop++) {
      for (let y = 0; y < ROWS; y++) {
        w[stop * ROWS + y] = SYMBOL_ORDER.indexOf(reel[(stop + y) % reel.length]) + 1;
      }
    }
    return w;
  });
  const L = reels.map((r) => r.length);
  const n = L.reduce((a, b) => a * b, 1);
  const g = new Int8Array(REELS * ROWS);

  let units = 0;
  let fs = 0;
  let hits = 0;
  let max = 0;
  const started = Date.now();

  for (let a = 0; a < L[0]; a++) {
    for (let y = 0; y < ROWS; y++) g[y] = windows[0][a * ROWS + y];
    for (let b = 0; b < L[1]; b++) {
      for (let y = 0; y < ROWS; y++) g[ROWS + y] = windows[1][b * ROWS + y];
      for (let c = 0; c < L[2]; c++) {
        for (let y = 0; y < ROWS; y++) g[2 * ROWS + y] = windows[2][c * ROWS + y];
        for (let d = 0; d < L[3]; d++) {
          for (let y = 0; y < ROWS; y++) g[3 * ROWS + y] = windows[3][d * ROWS + y];
          for (let e = 0; e < L[4]; e++) {
            for (let y = 0; y < ROWS; y++) g[4 * ROWS + y] = windows[4][e * ROWS + y];
            const w = fastWin(g);
            if (w > 0) {
              units += w;
              hits++;
              if (w > max) max = w;
            }
            fs += fastFreeSpins(g);
          }
        }
      }
    }
  }

  const sym = units / LINES / n;
  const q = fs / n;
  console.log(
    `${label}: ${n} grids in ${((Date.now() - started) / 1000).toFixed(1)}s\n` +
      `  rtp(sym) = ${pct(sym)}%, q = ${q.toFixed(6)}, hit rate ${((hits / n) * 100).toFixed(4)}% ` +
      `(1 in ${(n / hits).toFixed(3)})\n` +
      `  biggest single spin ${(max / LINES).toFixed(4)}x total bet`,
  );
  return { sym, q, max: max / LINES, hitRate: hits / n };
}

console.log('=== phase 2: brute force over every stop combination ===\n');
proveScorer(2_000_000);

const bonBrute = bruteForce(BONUS_REELS, 'bonus strips');
const actIndex = REEL_SETS.findIndex((s) => s.rtp === 95.364527);
const act = REEL_SETS[actIndex];
const actBrute = bruteForce(act.reels, `active set ${act.rtp.toFixed(6)}%`);

const sqB = 1 / (1 - bonBrute.q);
const rtpFsB = sqB * bonBrute.sym;
const totalB = actBrute.sym + actBrute.q * rtpFsB;
console.log(
  `\nbrute force: free games ${pct(rtpFsB)}% per trigger, ` +
    `active set RTP = ${pct(totalB)}%  [slotopol: ${act.rtp.toFixed(6)}%]`,
);
console.log(
  `phase 1 vs phase 2 on the active set: ${pct(rtpFs)} vs ${pct(rtpFsB)} (free games), ` +
    `agreement to ${Math.abs(rtpFs - rtpFsB) < 1e-12 ? 'machine precision' : 'CHECK THIS'}`,
);
