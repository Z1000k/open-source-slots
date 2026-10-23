/**
 * EXACT verification of every shipped reel set — no sampling anywhere.
 *
 * Phase 1 factors the game the way it actually factors:
 *
 *   - Line wins. Every bet line takes one row from each reel, and with a
 *     uniform stop that row's symbol is uniform over the strip, independent
 *     across reels. So every line has the same expectation, and that
 *     expectation is a weighted sum over the 10^5 symbol tuples. Each tuple is
 *     scored by the SHIPPED evaluate(), on a grid whose columns are constant,
 *     where all 10 lines read that tuple.
 *   - The free games trigger. checkReels proves no strip shows two scatters
 *     in one window, so a reel either shows a GALLEON or it does not, with
 *     probability count*3/length. That is 32 cases, again scored by the
 *     shipped evaluate(). The GALLEON pays nothing itself.
 *
 *   The free games run on their own strips with the GALLEON wild on the
 *   lines, so the bonus strips are scored through evaluate(grid, true).
 *
 *   RTP(free game) = rtp(sym on bonus strips) / (1 - q(bonus))   [retriggers]
 *   RTP(set)       = rtp(sym) + q * RTP(free game)
 *
 * Every figure is held against what slotopol itself printed into
 * columbus_data.yaml for each block: the symbol RTP, the integer count of
 * free spins over all reshuffles, q, and the RTP.
 *
 * Phase 2 then brute-forces every stop combination of every reel set and of
 * the bonus set (25,690,112 grids per set) with a fast integer evaluator
 * that is first proven to agree with the shipped evaluate() on millions of
 * random grids, paid and free. That reproduces phase 1 from a completely
 * different direction and also gives the exact hit rate, the biggest single
 * spin the strips allow, and the exact second moments, from which the exact
 * per-round standard deviation follows (what Monte Carlo gets judged by).
 *
 *   npm run sim:exact
 */
import { BONUS_REELS, REEL_SETS, ACTIVE_REELS } from '../engine/config/reelSets';
import { evaluate } from '../engine/evaluate';
import { LINE_PAY, SCAT_FREESPIN } from '../engine/config/paytable';
import { PAYLINES } from '../engine/config/paylines';
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
import { readPrinted, YAML, type Printed } from './printed';

const { bonus: PB, sets: printedSets } = readPrinted();
if (printedSets.size !== REEL_SETS.length) {
  throw new Error(`${YAML} prints ${printedSets.size} sets, the game ships ${REEL_SETS.length}`);
}

// ---------------------------------------------------------------- phase 1

/** Expected line win of ONE bet line, in line-bet units = its RTP share. */
function lineRtp(reels: SymbolId[][], freeGame: boolean): number {
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
      for (const w of evaluate(grid, freeGame).lineWins) pay += w.amount;
      // All 10 lines read the same tuple, so the sum of their total-bet
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

/** Expected free games awarded per spin (q). */
function triggerQ(reels: SymbolId[][], freeGame: boolean): number {
  const p = reels.map((reel) => {
    const c = reel.filter((s) => s === SCATTER).length;
    return (c * ROWS) / reel.length;
  });

  let q = 0;
  for (let mask = 0; mask < 1 << REELS; mask++) {
    let prob = 1;
    const grid: Grid = [];
    for (let x = 0; x < REELS; x++) {
      if (mask & (1 << x)) {
        prob *= p[x];
        grid.push([SCATTER, 'TEN', 'TEN']);
      } else {
        prob *= 1 - p[x];
        grid.push(['TEN', 'TEN', 'TEN']);
      }
    }
    if (prob === 0) continue;
    q += prob * evaluate(grid, freeGame).freeSpinsWon;
  }
  return q;
}

const pct = (x: number) => (x * 100).toFixed(6);
const reshuffles = (reels: SymbolId[][]) => reels.reduce((a, r) => a * r.length, 1);

/** q counts 10 free games per trigger, so 10/q is spins per trigger. */
const triggerRate = (q: number) => FREE_SPINS_AWARD / q;

/** Our figures against slotopol's printed ones; returns the number of mismatches. */
function hold(
  label: string,
  got: { sym: number; q: number; rtp: number; n: number },
  want: Printed,
): number {
  const fs = got.q * got.n;
  const checks: [string, boolean][] = [
    [`reshuffles ${got.n} vs ${want.total}`, got.n === want.total],
    [`symbols ${pct(got.sym)} vs ${want.sym.toFixed(6)}`, pct(got.sym) === want.sym.toFixed(6)],
    [`free spins ${fs.toFixed(3)} vs ${want.fs}`, Math.abs(fs - want.fs) < 1e-6],
    [`q ${got.q.toPrecision(5)} vs ${want.q}`, Number(got.q.toPrecision(5)) === Number(want.q.toPrecision(5))],
    [`RTP ${pct(got.rtp)} vs ${want.rtp.toFixed(6)}`, pct(got.rtp) === want.rtp.toFixed(6)],
  ];
  const bad = checks.filter(([, ok]) => !ok);
  console.log(
    bad.length === 0
      ? `  ${label}: symbols, free spins count, q and RTP all MATCH slotopol's printed figures`
      : `  ${label}: MISMATCH ${bad.map(([what]) => what).join('; ')}`,
  );
  return bad.length;
}

console.log('=== phase 1: factored exact enumeration through the shipped evaluate() ===\n');

const bonN = reshuffles(BONUS_REELS);
const bonSym = lineRtp(BONUS_REELS, true);
const bonQ = triggerQ(BONUS_REELS, true);
const sq = 1 / (1 - bonQ);
const rtpFs = sq * bonSym;
console.log('bonus strips, GALLEON wild');
console.log(`  reels lengths [${BONUS_REELS.map((r) => r.length).join(', ')}], reshuffles ${bonN}`);
console.log(`  symbols: ${pct(bonSym)}(lined) + 0(scatter) = ${pct(bonSym)}%`);
console.log(
  `  free: q = ${bonQ.toFixed(6)}, sq = 1/(1-q) = ${sq.toFixed(6)}, retrigger 1 in ${triggerRate(bonQ).toFixed(3)}`,
);
console.log(`  RTP = sq*rtp(sym) = ${pct(rtpFs)}% per free game awarded`);
let bad = hold('bonus', { sym: bonSym, q: bonQ, rtp: rtpFs, n: bonN }, PB);
console.log('');

for (const set of REEL_SETS) {
  const n = reshuffles(set.reels);
  const sym = lineRtp(set.reels, false);
  const q = triggerQ(set.reels, false);
  const total = sym + q * rtpFs;
  const label = `set ${set.rtp.toFixed(6)}%${set === ACTIVE_REELS ? ' (ACTIVE, original)' : ''}`;
  console.log(
    `${label}: symbols ${pct(sym)}%, q = ${q.toFixed(6)}, free games 1 in ${triggerRate(q).toFixed(3)}`,
  );
  console.log(`  RTP = ${pct(sym)} + ${q.toFixed(6)}*${pct(rtpFs)} = ${pct(total)}%`);
  bad += hold(label, { sym, q, rtp: total, n }, printedSets.get(set.rtp.toFixed(6))!);
  if (pct(total) !== set.rtp.toFixed(6)) {
    bad++;
    console.log(`  MISMATCH against the set's label ${set.rtp.toFixed(6)}`);
  }
}
console.log(
  bad === 0
    ? `\nphase 1: all ${REEL_SETS.length} reel sets and the free games reproduce slotopol to 6 decimals.\n`
    : `\nphase 1: ${bad} figure(s) DO NOT match slotopol.\n`,
);

// ---------------------------------------------------------------- phase 2

/**
 * Integer scorer over numeric symbol ids, used only to brute-force all stop
 * combinations at speed. Returns the spin win in LINE-BET units (divide by
 * 10 for total-bet multiples), so everything stays exact integer arithmetic.
 */
const PAY = new Int32Array(SYMBOL_ORDER.length * 5);
for (let s = 0; s < SYMBOL_ORDER.length; s++) {
  const row = LINE_PAY[SYMBOL_ORDER[s]];
  for (let k = 0; k < 5; k++) PAY[s * 5 + k] = row[k];
}
const SCATFS = new Int32Array(REELS * ROWS + 1);
for (let k = 1; k <= REELS * ROWS; k++) SCATFS[k] = SCAT_FREESPIN[Math.min(k, 5) - 1];
const WILD_N = SYMBOL_ORDER.indexOf(WILD) + 1;
const SCAT_N = SYMBOL_ORDER.indexOf(SCATTER) + 1;
const LINE_ROWS = new Int32Array(LINES * REELS);
for (let li = 0; li < LINES; li++) {
  for (let x = 0; x < REELS; x++) LINE_ROWS[li * REELS + x] = PAYLINES[li][x];
}

/** g[x * ROWS + y] holds the numeric symbol id; on a free game GALLEON is wild too. */
function fastWin(g: Int8Array, free: boolean): number {
  let units = 0;
  for (let li = 0; li < LINES; li++) {
    const base = li * REELS;
    let syml = 0;
    let numw = 0;
    let numl = REELS;
    for (let x = 1; x <= REELS; x++) {
      const s = g[(x - 1) * ROWS + LINE_ROWS[base + x - 1]];
      if (s === WILD_N || (free && s === SCAT_N)) {
        if (syml === 0) numw = x;
      } else if (syml === 0) {
        syml = s;
      } else if (s !== syml) {
        numl = x - 1;
        break;
      }
    }
    const payw = numw >= 2 ? PAY[(WILD_N - 1) * 5 + numw - 1] : 0;
    const payl = numl >= 2 && syml > 0 ? PAY[(syml - 1) * 5 + numl - 1] : 0;
    units += payl > payw ? payl : payw;
  }
  return units;
}

function fastFreeSpins(g: Int8Array): number {
  let sc = 0;
  for (let i = 0; i < REELS * ROWS; i++) if (g[i] === SCAT_N) sc++;
  return SCATFS[sc];
}

/** Prove the fast scorer says exactly what the shipped engine says, paid and free. */
function proveScorer(trials: number) {
  const pool = [...REEL_SETS.map((s) => s.reels), BONUS_REELS];
  const g = new Int8Array(REELS * ROWS);
  for (let t = 0; t < trials; t++) {
    const reels = pool[(Math.random() * pool.length) | 0];
    const freeGame = Math.random() < 0.5;
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
    const want = evaluate(grid, freeGame);
    const got = fastWin(g, freeGame) / LINES;
    if (Math.abs(want.totalWin - got) > 1e-9) {
      throw new Error(`scorer disagrees: engine ${want.totalWin} vs fast ${got} on ${JSON.stringify(grid)}`);
    }
    if (want.freeSpinsWon !== fastFreeSpins(g)) {
      throw new Error(`free spins disagree on ${JSON.stringify(grid)}`);
    }
  }
  console.log(`fast scorer agrees with the shipped evaluate() on ${trials} random grids, paid and free.\n`);
}

interface Brute {
  n: number;
  /** RTP fraction of the spin itself */
  sym: number;
  /** free spins summed over every reshuffle */
  fs: number;
  q: number;
  /** P(trigger) */
  pT: number;
  hitRate: number;
  /** biggest single spin, total-bet multiples */
  max: number;
  maxStops: number[];
  /** E[w], E[w^2], E[w * trigger] in total-bet multiples */
  m1: number;
  m2: number;
  mT: number;
}

/** Every stop combination of one reel set. */
function bruteForce(reels: SymbolId[][], free: boolean, label: string): Brute {
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

  // All sums are integers far below 2^53, so they are exact.
  let units = 0;
  let units2 = 0;
  let unitsT = 0;
  let fs = 0;
  let triggers = 0;
  let hits = 0;
  let max = 0;
  let maxStops: number[] = [];
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
            const w = fastWin(g, free);
            const f = fastFreeSpins(g);
            if (w > 0) {
              units += w;
              units2 += w * w;
              hits++;
              if (w > max) {
                max = w;
                maxStops = [a, b, c, d, e];
              }
            }
            if (f > 0) {
              fs += f;
              triggers++;
              unitsT += w;
            }
          }
        }
      }
    }
  }

  const sym = units / LINES / n;
  const q = fs / n;
  console.log(
    `${label}: ${n} grids in ${((Date.now() - started) / 1000).toFixed(1)}s\n` +
      `  rtp(sym) = ${pct(sym)}%, free spins ${fs}, q = ${q.toFixed(6)}, free games 1 in ${(n / triggers).toFixed(3)}, ` +
      `hit rate ${((hits / n) * 100).toFixed(4)}% (1 in ${(n / hits).toFixed(3)})\n` +
      `  biggest single spin ${(max / LINES).toFixed(4)}x total bet (${max} line-bets) at stops [${maxStops.join(', ')}]`,
  );
  return {
    n,
    sym,
    fs,
    q,
    pT: triggers / n,
    hitRate: hits / n,
    max: max / LINES,
    maxStops,
    m1: units / LINES / n,
    m2: units2 / (LINES * LINES) / n,
    mT: unitsT / LINES / n,
  };
}

/**
 * Exact mean and SD of one complete round, in total bets. A free games
 * session is 10 independent "spin trees": a spin Y that may award K = 10 more
 * spins (K and Y come from the same grid, so they are correlated), each of
 * which starts its own tree. With T the value of one tree:
 *   E[T]   = E[Y] / (1 - E[K])
 *   E[T^2] = (E[Y^2] + 2 E[YK] E[T] + E[K(K-1)] E[T]^2) / (1 - E[K])
 * The session is 10 trees, independent of the base spin that started it.
 */
function roundMoments(base: Brute, bon: Brute) {
  const A = FREE_SPINS_AWARD;
  const eK = A * bon.pT;
  const muT = bon.m1 / (1 - eK);
  const eT2 = (bon.m2 + 2 * A * bon.mT * muT + A * (A - 1) * bon.pT * muT * muT) / (1 - eK);
  const varT = eT2 - muT * muT;
  const eS = A * muT;
  const varS = A * varT;
  const eR = base.m1 + base.pT * eS;
  const eR2 = base.m2 + 2 * base.mT * eS + base.pT * (varS + eS * eS);
  return { mean: eR, sd: Math.sqrt(eR2 - eR * eR), eS, sdS: Math.sqrt(varS), spins: A / (1 - eK) };
}

console.log('=== phase 2: brute force over every stop combination ===\n');
proveScorer(2_000_000);

const bonB = bruteForce(BONUS_REELS, true, 'bonus strips (GALLEON wild)');
const sqB = 1 / (1 - bonB.q);
const rtpFsB = sqB * bonB.sym;
console.log(`  free games ${pct(rtpFsB)}% per free game awarded`);
let badB = hold('bonus', { sym: bonB.sym, q: bonB.q, rtp: rtpFsB, n: bonB.n }, PB);
if (bonB.fs !== PB.fs) {
  badB++;
  console.log(`  MISMATCH integer free spins ${bonB.fs} vs slotopol ${PB.fs}`);
}
console.log('');

let active: Brute | null = null;
for (const set of REEL_SETS) {
  const label = `set ${set.rtp.toFixed(6)}%${set === ACTIVE_REELS ? ' (ACTIVE, original)' : ''}`;
  const r = bruteForce(set.reels, false, label);
  if (set === ACTIVE_REELS) active = r;
  const total = r.sym + r.q * rtpFsB;
  console.log(`  RTP = ${pct(r.sym)} + ${r.q.toFixed(6)}*${pct(rtpFsB)} = ${pct(total)}%`);
  const printed = printedSets.get(set.rtp.toFixed(6))!;
  badB += hold(label, { sym: r.sym, q: r.q, rtp: total, n: r.n }, printed);
  if (r.fs !== printed.fs) {
    badB++;
    console.log(`  MISMATCH integer free spins ${r.fs} vs slotopol ${printed.fs}`);
  }
  if (pct(total) !== set.rtp.toFixed(6)) {
    badB++;
    console.log(`  MISMATCH against the set's label ${set.rtp.toFixed(6)}`);
  }
  console.log('');
}

console.log(
  badB === 0
    ? `phase 2: all ${REEL_SETS.length} reel sets and the free games reproduce slotopol to 6 decimals, ` +
        `free spin counts exactly.`
    : `phase 2: ${badB} figure(s) DO NOT match slotopol.`,
);
console.log(
  `phase 1 vs phase 2, free games: ${pct(rtpFs)} vs ${pct(rtpFsB)}, agreement to ` +
    `${Math.abs(rtpFs - rtpFsB) < 1e-12 ? 'machine precision' : 'CHECK THIS'}`,
);

if (active) {
  const m = roundMoments(active, bonB);
  console.log(
    `\nACTIVE set ${ACTIVE_REELS.rtp.toFixed(6)}%, exact per round:\n` +
      `  mean ${pct(m.mean)}%  (base ${pct(active.sym)}% + free games ${pct(m.mean - active.sym)}%)\n` +
      `  standard deviation ${m.sd.toFixed(4)} total bets per round\n` +
      `  free games: 1 in ${(1 / active.pT).toFixed(3)} rounds, ${m.spins.toFixed(4)} spins per session, ` +
      `${(m.eS * 100).toFixed(4)}% of the bet per session (SD ${m.sdS.toFixed(3)} bets)\n` +
      `  base hit rate ${(active.hitRate * 100).toFixed(4)}%, biggest single base spin ${active.max}x, ` +
      `biggest single free spin ${bonB.max}x`,
  );
}
process.exit(bad === 0 && badB === 0 ? 0 : 1);
