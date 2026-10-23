/**
 * EXACT verification — no sampling anywhere.
 *
 * Phase 1 factors the game the way it actually factors, scoring every case
 * with the SHIPPED evaluate():
 *
 *   - Line wins. A bet line reads one row of each reel, and the stops are
 *     uniform and independent across reels. What a line reads on a reel is
 *     its row's symbol, except in a free game, where a reel showing a SAMURAI
 *     anywhere reads wild on every row. So per reel and per row we count the
 *     stops leaving each "state" (a symbol, or wild), and a line's expected
 *     pay is a weighted sum over the state tuples. Each tuple is scored once
 *     by evaluate() on a grid whose columns are constant (a SAMURAI column
 *     for the wild state, so evaluate() itself turns that reel wild in a free
 *     game), where all 20 lines read that tuple; then every line is weighted
 *     on its own rows.
 *   - The GONG scatter. Per reel we count the stops by how many GONGs the
 *     window shows, and score every combination of counts with evaluate():
 *     the scatter pay and the free games awarded.
 *
 *     RTP(free game awarded) = rtp(sym on the free reels) / (1 - q(free))   [retriggers]
 *     RTP(set)               = rtp(sym) + q * RTP(free game awarded)
 *
 * Which lines are scored matters, and only in the free games. In the base
 * game every line has the same expectation (one row per reel, uniform stops),
 * so the number of lines cannot move a figure. In the free games a SAMURAI
 * one row off a line still turns the reel wild for it, so each line shape
 * earns a different amount. slotopol printed katana_data.yaml from a scan
 * with ONE selected line (Sel = 1, the middle row): its free-games line
 * figure is exactly line 1 on its own. So phase 1 runs twice:
 *
 *   1A  slotopol's par sheet as slotopol ran it, middle line only. Every
 *       figure it printed is held against it: per block the reshuffles, the
 *       lined and scatter parts, the symbols figure, the integer free spins,
 *       q, sq and the RTP (the set's label).
 *   1B  the game as it is played and paid: all 20 lines. Same reels, same
 *       rules; this is the RTP the shipped game returns, held against
 *       GAME_RTP.
 *
 * Phase 2 brute-forces every stop combination of every base set and of the
 * free set with a fast integer scorer first proven equal to the shipped
 * evaluate() on millions of grids (strip windows and arbitrary ones, base and
 * free). Its integer sums must equal phase 1's exactly, all 20 lines and line
 * 1 alone, and it gives the exact hit rates, the biggest single spins and the
 * exact second moments, hence the exact per-round standard deviation (what
 * Monte Carlo is judged by).
 *
 *   npm run sim:exact              both phases
 *   npm run sim:exact -- --quick   phase 1 only
 */
import { ACTIVE_REELS, FREE_REELS, REEL_SETS } from '../engine/config/reelSets';
import { evaluate, wildReelsOf } from '../engine/evaluate';
import { windowAt } from '../engine/spin';
import { LINE_PAY, SCAT_FREESPIN, SCAT_MIN, SCAT_PAY } from '../engine/config/paytable';
import { PAYLINES } from '../engine/config/paylines';
import { GAME_RTP } from '../engine/config/rtp';
import {
  FREE_SPINS_AWARD,
  LINES,
  REELS,
  ROWS,
  SCATTER,
  SYMBOL_ORDER,
  WILD,
  type Grid,
  type SymbolId,
} from '../engine/types';
import { readPrinted } from './printed';

const QUICK = process.argv.includes('--quick');
const P = readPrinted();
if (P.sets.size !== REEL_SETS.length) {
  throw new Error(`slotopol prints ${P.sets.size} sets, the game ships ${REEL_SETS.length}`);
}

const pct = (x: number) => (x * 100).toFixed(6);
const sig5 = (x: number) => Number(x.toPrecision(5));
const reshuffles = (reels: SymbolId[][]) => reels.reduce((a, r) => a * r.length, 1);
let bad = 0;
const hold = (what: string, got: string | number, want: string | number): string => {
  const ok = got === want;
  if (!ok) bad++;
  return ok ? `${what} ${got} MATCH` : `${what} ${got} vs ${want} MISMATCH`;
};

// ---------------------------------------------------------------- phase 1

/** Exact sums over every reshuffle of one reel set. */
interface Sums {
  n: number;
  /** line wins summed over every reshuffle, in LINE bets, one integer per bet line */
  perLine: number[];
  /** scatter pays summed over every reshuffle, in TOTAL bets (an integer) */
  scatBets: number;
  /** free games awarded, summed over every reshuffle (an integer) */
  fs: number;
}

/**
 * For each reel and row: the number of stops that leave each line state on
 * that row. The state is the row's symbol; in a free game a reel the engine
 * turns wild (wildReelsOf on that window) reads as the SAMURAI on every row.
 */
function rowStates(reels: SymbolId[][], freeGame: boolean): Map<SymbolId, number>[][] {
  return reels.map((reel) => {
    const rows: Map<SymbolId, number>[] = Array.from({ length: ROWS }, () => new Map());
    for (let stop = 0; stop < reel.length; stop++) {
      const col = windowAt(reel, stop);
      const wild = freeGame && wildReelsOf([col, col, col, col, col]).length > 0;
      for (let y = 0; y < ROWS; y++) {
        const s = wild ? WILD : col[y];
        rows[y].set(s, (rows[y].get(s) ?? 0) + 1);
      }
    }
    return rows;
  });
}

/** Line wins over every reshuffle, in line bets, per line: every state tuple scored once, weighted per line. */
function lineSums(reels: SymbolId[][], freeGame: boolean): number[] {
  const states = rowStates(reels, freeGame);
  /** every state a reel can show on any row */
  const union = states.map((rows) => [...new Set(rows.flatMap((m) => [...m.keys()]))]);
  const column: SymbolId[] = new Array(REELS);
  const perLine: number[] = new Array(LINES).fill(0);
  const walk = (x: number) => {
    if (x === REELS) {
      const grid: Grid = column.map((s) => [s, s, s]);
      let pay = 0;
      // All 20 lines read the same tuple, so the sum of their total-bet
      // amounts is exactly what one line pays in line-bet units.
      for (const w of evaluate(grid, freeGame).lineWins) pay += w.amount;
      pay = Math.round(pay);
      if (pay === 0) return;
      for (let li = 0; li < LINES; li++) {
        let wl = 1;
        for (let r = 0; r < REELS && wl > 0; r++) wl *= states[r][PAYLINES[li][r]].get(column[r]) ?? 0;
        perLine[li] += wl * pay;
      }
      return;
    }
    for (const s of union[x]) {
      column[x] = s;
      walk(x + 1);
    }
  };
  walk(0);
  return perLine;
}

/** Scatter pays (total bets) and free games awarded over every reshuffle: every combination of per-reel GONG counts. */
function scatterSum(reels: SymbolId[][], freeGame: boolean): { scatBets: number; fs: number } {
  const byCount = reels.map((reel) => {
    const c = new Array(ROWS + 1).fill(0);
    for (let stop = 0; stop < reel.length; stop++) c[windowAt(reel, stop).filter((s) => s === SCATTER).length]++;
    return c;
  });
  let scatBets = 0;
  let fs = 0;
  const k: number[] = new Array(REELS);
  const walk = (x: number, weight: number) => {
    if (weight === 0) return;
    if (x === REELS) {
      const grid: Grid = k.map((n) => [0, 1, 2].map((y) => (y < n ? SCATTER : 'TEN')));
      const r = evaluate(grid, freeGame);
      scatBets += weight * (r.scatterHit?.amount ?? 0);
      fs += weight * r.freeSpinsWon;
      return;
    }
    for (let n = 0; n <= ROWS; n++) {
      k[x] = n;
      walk(x + 1, weight * byCount[x][n]);
    }
  };
  walk(0, 1);
  return { scatBets, fs };
}

function exactSums(reels: SymbolId[][], freeGame: boolean): Sums {
  return { n: reshuffles(reels), perLine: lineSums(reels, freeGame), ...scatterSum(reels, freeGame) };
}

/** A block's figures when the first `sel` lines are scored (cost `sel` line bets). */
function figures(s: Sums, sel: number) {
  let units = 0;
  for (let li = 0; li < sel; li++) units += s.perLine[li];
  const lined = units / sel / s.n;
  const scat = s.scatBets / s.n;
  const q = s.fs / s.n;
  return { lined, scat, sym: lined + scat, q, sq: 1 / (1 - q) };
}

console.log('=== phase 1: factored exact enumeration through the shipped evaluate() ===\n');

const free1 = exactSums(FREE_REELS, true);
const sets1 = new Map<number, Sums>();
for (const set of REEL_SETS) sets1.set(set.rtp, exactSums(set.reels, false));

// In the base game every line must earn the same; that is why no base figure can see the line count.
for (const set of REEL_SETS) {
  const pl = sets1.get(set.rtp)!.perLine;
  if (pl.some((v) => v !== pl[0])) {
    bad++;
    console.log(`MISMATCH set ${set.rtp}: base lines do not all earn the same`);
  }
}
const freeLine = free1.perLine.map((u) => u / free1.n);
console.log(
  `every base line earns the same on all ${REEL_SETS.length} sets; in the free games the 20 lines earn ` +
    `${pct(Math.min(...freeLine))}% to ${pct(Math.max(...freeLine))}% each (line 1, the middle: ${pct(freeLine[0])}%)\n`,
);

console.log('--- 1A: slotopol\'s par sheet as slotopol ran it, ONE line (Sel = 1, the middle row) ---\n');
const ff1 = figures(free1, 1);
const rtpFs1 = ff1.sym / (1 - ff1.q);
const pb = P.bon;
console.log(`free games: reels lengths [${FREE_REELS.map((r) => r.length).join(', ')}], reshuffles ${free1.n}`);
console.log(`  symbols: ${pct(ff1.lined)}(lined) + ${pct(ff1.scat)}(scatter) = ${pct(ff1.sym)}% per free game`);
console.log(`  free spins ${free1.fs}, q = ${ff1.q.toFixed(6)}, sq = 1/(1-q) = ${ff1.sq.toFixed(6)}`);
console.log(`  RTP = sq*rtp(sym) = ${pct(rtpFs1)}% per free game awarded`);
console.log(
  `  ${hold('reshuffles', free1.n, pb.total)}; ${hold('lined', sig5(ff1.lined * 100), pb.lined)}; ` +
    `${hold('scatter', sig5(ff1.scat * 100), pb.scat)}; ${hold('symbols', pct(ff1.sym), pb.sym.toFixed(6))};\n` +
    `  ${hold('free spins', free1.fs, pb.fs)}; ${hold('q', sig5(ff1.q), pb.q)}; ` +
    `${hold('sq', ff1.sq.toFixed(6), pb.sq.toFixed(6))}; ${hold('RTP', pct(rtpFs1), pb.rtp.toFixed(6))}\n`,
);

const labels = REEL_SETS.map((s) => s.rtp.toFixed(6));
console.log(`${hold('RTP list printed at the top of rmap', P.list.join(' '), labels.join(' '))}`);
for (const set of REEL_SETS) {
  const s = sets1.get(set.rtp)!;
  const f = figures(s, 1);
  const rtp = f.sym + f.q * rtpFs1;
  const printed = P.sets.get(set.rtp.toFixed(6));
  console.log(
    `set ${set.rtp.toFixed(6)}${set === ACTIVE_REELS ? ' (ACTIVE)' : ''}: lines ${pct(f.lined)}% + scatter ${pct(f.scat)}% = ` +
      `${pct(f.sym)}%, q = ${f.q.toFixed(6)}, free games 1 in ${((FREE_SPINS_AWARD * s.n) / s.fs).toFixed(3)}`,
  );
  if (!printed) {
    bad++;
    console.log('  MISMATCH: slotopol prints no figures for this set');
    continue;
  }
  console.log(
    `  ${hold('reshuffles', s.n, printed.total)}; ${hold('lined', sig5(f.lined * 100), printed.lined)}; ` +
      `${hold('scatter', sig5(f.scat * 100), printed.scat)}; ${hold('symbols', pct(f.sym), printed.sym.toFixed(6))};\n` +
      `  ${hold('free spins', s.fs, printed.fs)}; ${hold('q', sig5(f.q), printed.q)}; ` +
      `${hold('sq', f.sq.toFixed(6), printed.sq.toFixed(6))}`,
  );
  console.log(
    `  RTP = ${pct(f.sym)} + ${f.q.toFixed(6)}*${pct(rtpFs1)} = ${pct(rtp)}%: ` +
      `${hold('label', pct(rtp), set.rtp.toFixed(6))}; ${hold('printed RTP', pct(rtp), printed.rtp.toFixed(6))}`,
  );
}
const bad1A = bad;
console.log(
  bad1A === 0
    ? `\n1A: every figure slotopol printed for the free games and all ${REEL_SETS.length} base sets is reproduced ` +
        `(6 decimals where printed so).\n`
    : `\n1A: ${bad1A} figure(s) DO NOT match.\n`,
);

console.log('--- 1B: the game as played and paid, all 20 lines ---\n');
const ff20 = figures(free1, LINES);
const rtpFs20 = ff20.sym / (1 - ff20.q);
console.log(
  `free games: symbols ${pct(ff20.lined)}(lined) + ${pct(ff20.scat)}(scatter) = ${pct(ff20.sym)}% per free game, ` +
    `q = ${ff20.q.toFixed(6)}\n  RTP = sq*rtp(sym) = ${pct(rtpFs20)}% per free game awarded ` +
    `(slotopol's one-line figure ${pct(rtpFs1)}%)`,
);
let activeRtp1 = NaN;
let activeBase1 = NaN;
for (const set of REEL_SETS) {
  const f = figures(sets1.get(set.rtp)!, LINES);
  const rtp = f.sym + f.q * rtpFs20;
  if (set === ACTIVE_REELS) {
    activeRtp1 = rtp;
    activeBase1 = f.sym;
  }
  console.log(
    `set ${set.rtp.toFixed(6)}${set === ACTIVE_REELS ? ' (ACTIVE)' : ''}: RTP = ${pct(f.sym)} + ` +
      `${f.q.toFixed(6)}*${pct(rtpFs20)} = ${pct(rtp)}%  (label ${set.rtp.toFixed(6)}, ` +
      `${rtp * 100 - set.rtp >= 0 ? '+' : ''}${(rtp * 100 - set.rtp).toFixed(6)}pp)`,
  );
}
console.log(
  `\nACTIVE set ${ACTIVE_REELS.rtp.toFixed(6)} on 20 lines: RTP ${pct(activeRtp1)}% ` +
    `(base ${pct(activeBase1)}% + free games ${pct(activeRtp1 - activeBase1)}%); ` +
    hold('shipped GAME_RTP', pct(activeRtp1), GAME_RTP.toFixed(6)),
);
console.log(bad === 0 ? 'phase 1: all checks pass.\n' : `phase 1: ${bad} figure(s) DO NOT match.\n`);
if (QUICK) process.exit(bad === 0 ? 0 : 1);

// ---------------------------------------------------------------- phase 2

const SN = SYMBOL_ORDER.length;
const slotId = (s: SymbolId) => SYMBOL_ORDER.indexOf(s) + 1;
const WID = slotId(WILD);
const SID = slotId(SCATTER);
const LROW = new Int32Array(LINES * REELS);
for (let li = 0; li < LINES; li++) for (let x = 0; x < REELS; x++) LROW[li * REELS + x] = PAYLINES[li][x];
const PAY = new Int32Array((SN + 1) * 5);
for (let s = 1; s <= SN; s++) for (let k = 0; k < 5; k++) PAY[s * 5 + k] = LINE_PAY[SYMBOL_ORDER[s - 1]][k];
/** scatter pay in LINE bets and free games, by GONG count 0..15 */
const SCATU = new Int32Array(REELS * ROWS + 1);
const SCATFS = new Int32Array(REELS * ROWS + 1);
for (let k = SCAT_MIN; k <= REELS * ROWS; k++) {
  SCATU[k] = SCAT_PAY[Math.min(k, 5) - 1] * LINES;
  SCATFS[k] = SCAT_FREESPIN[Math.min(k, 5) - 1];
}

/** what the last lineUnits() call paid on line 1 alone */
let firstLine = 0;

/** The line rule on numeric grids, wr[x] = 1 when reel x is wild. Line-bet units, all 20 lines. */
function lineUnits(g: Int8Array, wr: Uint8Array): number {
  let units = 0;
  for (let li = 0; li < LINES; li++) {
    const base = li * REELS;
    let syml = 0;
    let numw = 0;
    let numl = REELS;
    for (let x = 0; x < REELS; x++) {
      const s = g[x * ROWS + LROW[base + x]];
      if (s === WID || wr[x] !== 0) {
        if (syml === 0) numw = x + 1;
      } else if (syml === 0) syml = s;
      else if (s !== syml) {
        numl = x;
        break;
      }
    }
    const payw = numw >= 3 ? PAY[WID * 5 + numw - 1] : 0;
    const payl = numl >= 3 && syml > 0 ? PAY[syml * 5 + numl - 1] : 0;
    const p = payl > payw ? payl : payw;
    if (li === 0) firstLine = p;
    units += p;
  }
  return units;
}

/** Prove the fast scorer says exactly what the shipped engine says, on strip windows and arbitrary grids. */
function proveScorer(trials: number) {
  const g = new Int8Array(REELS * ROWS);
  const wr = new Uint8Array(REELS);
  for (let t = 0; t < trials; t++) {
    const freeGame = (t & 1) === 1;
    const arbitrary = (t & 2) === 2;
    const reels = freeGame ? FREE_REELS : REEL_SETS[(t >> 2) % REEL_SETS.length].reels;
    const grid: Grid = [];
    for (let x = 0; x < REELS; x++) {
      grid.push(
        arbitrary
          ? [0, 1, 2].map(() => SYMBOL_ORDER[(Math.random() * SN) | 0])
          : windowAt(reels[x], (Math.random() * reels[x].length) | 0),
      );
    }
    let sc = 0;
    for (let x = 0; x < REELS; x++) {
      wr[x] = 0;
      for (let y = 0; y < ROWS; y++) {
        const id = slotId(grid[x][y]);
        g[x * ROWS + y] = id;
        if (id === SID) sc++;
        if (freeGame && id === WID) wr[x] = 1;
      }
    }
    const want = evaluate(grid, freeGame);
    const got = lineUnits(g, wr) + SCATU[sc];
    if (Math.abs(want.totalWin * LINES - got) > 1e-9) {
      throw new Error(
        `scorer disagrees: engine ${want.totalWin * LINES} vs fast ${got} line bets on ${JSON.stringify(grid)} free=${freeGame}`,
      );
    }
    const line1 = want.lineWins.find((w) => w.line === 0);
    if (Math.abs((line1 ? line1.amount * LINES : 0) - firstLine) > 1e-9) throw new Error(`line 1 disagrees on ${JSON.stringify(grid)}`);
    if (want.freeSpinsWon !== SCATFS[sc]) throw new Error(`free spins disagree on ${JSON.stringify(grid)}`);
    const wantWild = want.wildReels.join(',');
    const gotWild = [...wr].flatMap((v, x) => (v ? [x] : [])).join(',');
    if (wantWild !== gotWild) throw new Error(`wild reels disagree on ${JSON.stringify(grid)} free=${freeGame}`);
  }
  console.log(`fast scorer agrees with the shipped evaluate() on ${trials} grids (strip windows and arbitrary, base and free).\n`);
}

interface Brute {
  n: number;
  /** all 20 lines and line 1 alone, LINE bets summed over every reshuffle */
  lineUnits: number;
  line1Units: number;
  /** scatter pays in TOTAL bets, free games awarded */
  scatBets: number;
  fs: number;
  /** spin pay in LINE bets summed exactly, its squares as a BigInt */
  sum: number;
  sq: bigint;
  /** pay summed over the spins that award free games */
  sumT: number;
  triggers: number;
  hits: number;
  max: number;
  maxStops: number[];
}

/** Every stop combination of one reel set; `freeGame` turns a reel showing a SAMURAI wild. */
function brute(reels: SymbolId[][], freeGame: boolean, label: string): Brute {
  const L = reels.map((r) => r.length);
  const win = reels.map((r) => {
    const w = new Int8Array(r.length * ROWS);
    for (let stop = 0; stop < r.length; stop++) for (let y = 0; y < ROWS; y++) w[stop * ROWS + y] = slotId(r[(stop + y) % r.length]);
    return w;
  });
  const gongs = reels.map((r) => {
    const out = new Int8Array(r.length);
    for (let stop = 0; stop < r.length; stop++) for (let y = 0; y < ROWS; y++) if (r[(stop + y) % r.length] === SCATTER) out[stop]++;
    return out;
  });
  const wild = reels.map((r) => {
    const out = new Uint8Array(r.length);
    if (freeGame) for (let stop = 0; stop < r.length; stop++) for (let y = 0; y < ROWS; y++) if (r[(stop + y) % r.length] === WILD) out[stop] = 1;
    return out;
  });
  const n = L.reduce((a, b) => a * b, 1);
  const g = new Int8Array(REELS * ROWS);
  const wr = new Uint8Array(REELS);
  const r: Brute = {
    n,
    lineUnits: 0,
    line1Units: 0,
    scatBets: 0,
    fs: 0,
    sum: 0,
    sq: 0n,
    sumT: 0,
    triggers: 0,
    hits: 0,
    max: 0,
    maxStops: [],
  };
  const t0 = Date.now();
  for (let a = 0; a < L[0]; a++) {
    for (let y = 0; y < ROWS; y++) g[y] = win[0][a * ROWS + y];
    wr[0] = wild[0][a];
    let part = 0;
    for (let b = 0; b < L[1]; b++) {
      for (let y = 0; y < ROWS; y++) g[ROWS + y] = win[1][b * ROWS + y];
      wr[1] = wild[1][b];
      for (let c = 0; c < L[2]; c++) {
        for (let y = 0; y < ROWS; y++) g[2 * ROWS + y] = win[2][c * ROWS + y];
        wr[2] = wild[2][c];
        for (let d = 0; d < L[3]; d++) {
          for (let y = 0; y < ROWS; y++) g[3 * ROWS + y] = win[3][d * ROWS + y];
          wr[3] = wild[3][d];
          const sc4 = gongs[0][a] + gongs[1][b] + gongs[2][c] + gongs[3][d];
          for (let e = 0; e < L[4]; e++) {
            for (let y = 0; y < ROWS; y++) g[4 * ROWS + y] = win[4][e * ROWS + y];
            wr[4] = wild[4][e];
            const sc = sc4 + gongs[4][e];
            const li = lineUnits(g, wr);
            const w = li + SCATU[sc];
            if (w > 0) {
              r.lineUnits += li;
              r.line1Units += firstLine;
              r.scatBets += SCATU[sc] / LINES;
              r.sum += w;
              part += w * w;
              r.hits++;
              if (w > r.max) {
                r.max = w;
                r.maxStops = [a, b, c, d, e];
              }
            }
            if (SCATFS[sc] > 0) {
              r.fs += SCATFS[sc];
              r.triggers++;
              r.sumT += w;
            }
          }
        }
      }
    }
    r.sq += BigInt(part);
  }
  console.log(
    `${label}: ${n} grids in ${((Date.now() - t0) / 1000).toFixed(1)}s\n` +
      `  spin RTP ${pct(r.sum / LINES / n)}%, free spins ${r.fs}, free games 1 in ${(n / r.triggers).toFixed(3)}, ` +
      `hit rate ${((r.hits / n) * 100).toFixed(4)}%, biggest spin ${r.max / LINES}x total bet at stops [${r.maxStops.join(', ')}]`,
  );
  return r;
}

/** Brute force against phase 1: the 20-line sum, line 1 alone, the scatter and the free games, all exact integers. */
const agrees = (b: Brute, s: Sums) =>
  b.n === s.n &&
  b.lineUnits === s.perLine.reduce((a, v) => a + v, 0) &&
  b.line1Units === s.perLine[0] &&
  b.scatBets === s.scatBets &&
  b.fs === s.fs;

/**
 * Exact mean and SD of one complete round, in total bets. A free games
 * session is 10 independent "spin trees": a free spin Y that may award K = 10
 * more spins (K and Y come from the same grid, so they are correlated), each
 * of which starts its own tree. With T one tree:
 *   E[T]   = E[Y] / (1 - E[K])
 *   E[T^2] = (E[Y^2] + 2 E[YK] E[T] + E[K(K-1)] E[T]^2) / (1 - E[K])
 * A round is the base spin plus, on a trigger, a session of 10 trees.
 */
function roundMoments(base: Brute, fr: Brute) {
  const A = FREE_SPINS_AWARD;
  const m1 = fr.sum / LINES / fr.n;
  const m2 = Number(fr.sq) / (LINES * LINES) / fr.n;
  const mT = fr.sumT / LINES / fr.n;
  const pTb = fr.triggers / fr.n;
  const eK = A * pTb;
  const muT = m1 / (1 - eK);
  const eT2 = (m2 + 2 * A * mT * muT + A * (A - 1) * pTb * muT * muT) / (1 - eK);
  const varT = eT2 - muT * muT;
  const eS = A * muT;
  const varS = A * varT;
  const bm1 = base.sum / LINES / base.n;
  const bm2 = Number(base.sq) / (LINES * LINES) / base.n;
  const bmT = base.sumT / LINES / base.n;
  const pTr = base.triggers / base.n;
  const eR = bm1 + pTr * eS;
  const eR2 = bm2 + 2 * bmT * eS + pTr * (varS + eS * eS);
  return {
    mean: eR,
    sd: Math.sqrt(eR2 - eR * eR),
    eS,
    sdS: Math.sqrt(varS),
    spins: A / (1 - eK),
    sdFree: Math.sqrt(m2 - m1 * m1),
    sdBase: Math.sqrt(bm2 - bm1 * bm1),
  };
}

console.log('=== phase 2: brute force over every stop combination ===\n');
proveScorer(4_000_000);

const fr = brute(FREE_REELS, true, 'free reels (a SAMURAI turns his reel wild)');
const frq = fr.fs / fr.n;
const rtpFs2 = fr.sum / LINES / fr.n / (1 - frq);
console.log(
  `  ${hold('integer sums vs phase 1 (20 lines, line 1, scatter, free spins)', agrees(fr, free1) ? 'identical' : 'differ', 'identical')}; ` +
    `${hold('RTP per free game awarded, 20 lines', pct(rtpFs2), pct(rtpFs20))}\n`,
);

let active: Brute | null = null;
for (const set of REEL_SETS) {
  const isActive = set === ACTIVE_REELS;
  const r = brute(set.reels, false, `set ${set.rtp.toFixed(6)}${isActive ? ' (ACTIVE)' : ''}`);
  if (isActive) active = r;
  console.log(
    `  ${hold('integer sums vs phase 1', agrees(r, sets1.get(set.rtp)!) ? 'identical' : 'differ', 'identical')}; ` +
      `20-line RTP ${pct(r.sum / LINES / r.n + (r.fs / r.n) * rtpFs2)}%\n`,
  );
}

const m = roundMoments(active!, fr);
const baseRtp = active!.sum / LINES / active!.n;
const activeRtp2 = baseRtp + (active!.fs / active!.n) * rtpFs2;
console.log(
  `ACTIVE set ${ACTIVE_REELS.rtp.toFixed(6)}, the shipped 20-line game, exact per round:\n` +
    `  RTP ${pct(activeRtp2)}%  (base ${pct(baseRtp)}% + free games ${pct(activeRtp2 - baseRtp)}%), ` +
    `phase 1 ${pct(activeRtp1)}%, ${hold('GAME_RTP', pct(activeRtp2), GAME_RTP.toFixed(6))}\n` +
    `  mean by moments ${pct(m.mean)}%, standard deviation ${m.sd.toFixed(4)} total bets per round ` +
    `(base spin alone ${m.sdBase.toFixed(4)})\n` +
    `  free games: 1 in ${(active!.n / active!.triggers).toFixed(3)} rounds (${active!.triggers} of ${active!.n} stop combinations), ` +
    `${m.spins.toFixed(4)} spins per session, ${(m.eS * 100).toFixed(4)}% of the bet per session (SD ${m.sdS.toFixed(3)} bets)\n` +
    `  one free game: ${pct(fr.sum / LINES / fr.n)}% (SD ${m.sdFree.toFixed(4)} bets), retrigger 1 in ${(fr.n / fr.triggers).toFixed(3)}, ` +
    `hit rate ${((fr.hits / fr.n) * 100).toFixed(4)}%\n` +
    `  base hit rate ${((active!.hits / active!.n) * 100).toFixed(4)}%\n` +
    `  biggest single base spin ${active!.max / LINES}x, biggest single free spin ${fr.max / LINES}x`,
);
if (Math.abs(activeRtp2 - activeRtp1) > 1e-12 || Math.abs(m.mean - activeRtp2) > 1e-12) {
  bad++;
  console.log('  MISMATCH between phase 1, phase 2 and the moments');
}
console.log(bad === 0 ? '\nALL CHECKS PASS.' : `\n${bad} CHECK(S) FAILED.`);
process.exit(bad === 0 ? 0 : 1);
