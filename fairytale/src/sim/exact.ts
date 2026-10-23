/**
 * EXACT verification — no sampling anywhere.
 *
 * Phase 1 scores every case with the SHIPPED evaluate(), coveredReel() and
 * windowAt():
 *
 *   - The free games, symbol by symbol. The expanding symbol covers the first
 *     2 or 3 reels, so a free game with a given symbol has only 55^3 or 55^2
 *     stop combinations: every one of them is landed and scored. That gives
 *     slotopol's RTP[es] (the expected win of one free game with es drawn)
 *     and the free spins it awards, exactly.
 *   - The pool: the symbol is drawn uniformly from the 28-entry pool before
 *     every free game, so per free game RTP(sym) and q are pool averages, and
 *       RTP(free game awarded) = RTP(sym) / (1 - q)       [retriggers]
 *   - Base line wins. Every bet line takes one row from each reel, and with
 *     a uniform stop that row's symbol is uniform over the strip,
 *     independent across reels. So every line has the same expectation, a
 *     weighted sum over the symbol tuples, each scored on a grid whose
 *     columns are constant, where all 10 lines read that tuple.
 *   - The LANTERN scatter. checkReels proves no strip shows two in one
 *     window, so a reel shows one with probability count*3/length or none.
 *     That is 32 cases; they give the scatter pay and the free spins.
 *       RTP(set) = symbols + q * RTP(free game awarded)
 *
 * Every figure is held against what slotopol printed into
 * fairyqueen_data.yaml: RTP[es] and the free spins of every expanding
 * symbol, the pool averages, RTPfs, and per base set the reshuffles, the
 * symbols figure, the integer free spins and the label.
 *
 * slotopol's par sheet scored the free games on ONE line (g.Sel = 1, the
 * middle row). For every symbol but the LANTERN that is the same as 10 lines
 * (each line reads the covered reels the same way), and for the LANTERN the
 * middle line runs into the lantern itself. Phase 1 also runs slotopol's live
 * ScanLined verbatim on the LANTERN cover, on that one line and on all 10, to
 * show where its live server parts from its own par sheet.
 *
 * Phase 2 brute-forces every stop combination of every base set and every
 * free game with a fast integer scorer first proven equal to the shipped
 * evaluate() on millions of random grids, base and free. It gives the exact
 * hit rates, the biggest single spins, and the exact second moments, hence
 * the exact per-round standard deviation (what Monte Carlo gets judged by).
 *
 *   npm run sim:exact              both phases
 *   npm run sim:exact -- --quick   phase 1 only
 */
import { ACTIVE_REELS, EXPAND_POOL, FREE_REELS, REEL_SETS } from '../engine/config/reelSets';
import { evaluate } from '../engine/evaluate';
import { coveredReel, windowAt } from '../engine/spin';
import { EXPAND_REELS, LINE_PAY, SCAT_FREESPIN, SCAT_PAY } from '../engine/config/paytable';
import { PAYLINES } from '../engine/config/paylines';
import { GAME_RTP } from '../engine/config/rtp';
import {
  BLANK,
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
import { readPrinted, YAML } from './printed';

const QUICK = process.argv.includes('--quick');
const P = readPrinted();
if (P.sets.size !== REEL_SETS.length) {
  throw new Error(`${YAML} prints ${P.sets.size} sets, the game ships ${REEL_SETS.length}`);
}

const pct = (x: number) => (x * 100).toFixed(6);
const sig5 = (x: number) => Number(x.toPrecision(5));
const reshuffles = (reels: SymbolId[][]) => reels.reduce((a, r) => a * r.length, 1);
const slotId = (s: SymbolId) => SYMBOL_ORDER.indexOf(s) + 1;
let bad = 0;
const hold = (what: string, got: string | number, want: string | number): string => {
  const ok = got === want;
  if (!ok) bad++;
  return ok ? `${what} ${got} MATCH` : `${what} ${got} vs ${want} MISMATCH`;
};

/** Every expanding symbol slotopol computes a block for: all but the wild. */
const EXPANDERS = SYMBOL_ORDER.filter((s) => s !== WILD);
const POOL_N = EXPAND_POOL.length;

// ---------------------------------------------------------------- phase 1

/** Exact statistics of one free game with `es` drawn. Units: LINE bets (integers). */
interface FreeStat {
  es: SymbolId;
  cover: number;
  n: number;
  /** spin pay summed over every stop combination: lines, scatter, and both */
  lined: number;
  scat: number;
  sum: number;
  /** sum of squared spin pays, and of pays on spins that retrigger */
  sq: number;
  sumT: number;
  fs: number;
  triggers: number;
  hits: number;
  max: number;
}

/** Land and score every stop combination of the reels `es` leaves uncovered. */
function freeExact(es: SymbolId): FreeStat {
  const cover = EXPAND_REELS[es];
  const covered = coveredReel(es);
  const lens = FREE_REELS.map((r) => r.length);
  let n = 1;
  for (let x = cover; x < REELS; x++) n *= lens[x];
  const st: FreeStat = { es, cover, n, lined: 0, scat: 0, sum: 0, sq: 0, sumT: 0, fs: 0, triggers: 0, hits: 0, max: 0 };
  for (let i = 0; i < n; i++) {
    const grid: Grid = [];
    let t = i;
    for (let x = 0; x < REELS; x++) {
      if (x < cover) grid.push(covered.slice());
      else {
        grid.push(windowAt(FREE_REELS[x], t % lens[x]));
        t = Math.floor(t / lens[x]);
      }
    }
    const r = evaluate(grid, { symbol: es, reels: cover });
    let lineUnits = 0;
    for (const w of r.lineWins) lineUnits += Math.round(w.amount * LINES);
    const scatUnits = (r.scatterHit?.amount ?? 0) * LINES;
    const w = lineUnits + scatUnits;
    if (Math.abs(w - r.totalWin * LINES) > 1e-9) throw new Error(`unit bookkeeping broke on ${JSON.stringify(grid)}`);
    st.lined += lineUnits;
    st.scat += scatUnits;
    st.sum += w;
    st.sq += w * w;
    if (w > 0) st.hits++;
    if (w > st.max) st.max = w;
    if (r.freeSpinsWon > 0) {
      st.fs += r.freeSpinsWon;
      st.triggers++;
      st.sumT += w;
    }
  }
  return st;
}

/**
 * slotopol's live ScanLined, verbatim, on numeric grids where the blank is
 * slotopol's 0: a 0 never sets syml, so a line can skip blanks. Line-bet units.
 */
const LROW = new Int32Array(LINES * REELS);
for (let li = 0; li < LINES; li++) for (let x = 0; x < REELS; x++) LROW[li * REELS + x] = PAYLINES[li][x];
const SN = SYMBOL_ORDER.length;
const BLANK_ID = SN + 1; // our fast scorers' blank: a real symbol that pays nothing
const WID = slotId(WILD);
const SID = slotId(SCATTER);
const PAY = new Int32Array((SN + 2) * 5);
for (let s = 1; s <= SN; s++) for (let k = 0; k < 5; k++) PAY[s * 5 + k] = LINE_PAY[SYMBOL_ORDER[s - 1]][k];

function slotopolLined(g: Int8Array, sel: number): number {
  let units = 0;
  for (let li = 0; li < sel; li++) {
    let numw = 0;
    let numl = 5;
    let syml = 0;
    for (let x = 1; x <= 5; x++) {
      const sx = g[(x - 1) * ROWS + LROW[li * REELS + x - 1]];
      if (sx === WID) {
        if (syml === 0) numw = x;
      } else if (syml === 0) {
        syml = sx;
      } else if (sx !== syml) {
        numl = x - 1;
        break;
      }
    }
    const payw = numw >= 2 ? PAY[WID * 5 + numw - 1] : 0;
    const payl = numl >= 2 && syml > 0 ? PAY[syml * 5 + numl - 1] : 0;
    units += payl > payw ? payl : payw;
  }
  return units;
}

/** The LANTERN cover through slotopol's live ScanLined, one line and all ten. Total bets per spin. */
function liveLantern(): { one: number; ten: number } {
  const lens = FREE_REELS.map((r) => r.length);
  const g = new Int8Array(REELS * ROWS);
  for (let x = 0; x < 2; x++) {
    g[x * ROWS] = 0;
    g[x * ROWS + 1] = SID;
    g[x * ROWS + 2] = 0;
  }
  let one = 0;
  let ten = 0;
  const n = lens[2] * lens[3] * lens[4];
  for (let i = 0; i < n; i++) {
    let t = i;
    for (let x = 2; x < REELS; x++) {
      const col = windowAt(FREE_REELS[x], t % lens[x]);
      t = Math.floor(t / lens[x]);
      for (let y = 0; y < ROWS; y++) g[x * ROWS + y] = slotId(col[y]);
    }
    let sc = 0;
    for (let k = 0; k < REELS * ROWS; k++) if (g[k] === SID) sc++;
    const scat = sc >= 2 ? SCAT_PAY[Math.min(sc, 5) - 1] : 0;
    one += slotopolLined(g, 1) + scat; // cost 1 line: scatter pays bet x 1 x pay
    ten += slotopolLined(g, LINES) / LINES + scat;
  }
  return { one: one / n, ten: ten / n };
}

/** Expected line win of ONE bet line, in line-bet units = its RTP share. */
function lineRtp(reels: SymbolId[][]): number {
  const counts = reels.map((reel) => {
    const m = new Map<SymbolId, number>();
    for (const s of reel) m.set(s, (m.get(s) ?? 0) + 1);
    return [...m.entries()];
  });
  const column: SymbolId[] = new Array(REELS);
  let total = 0;
  const walk = (x: number, weight: number) => {
    if (x === REELS) {
      const grid: Grid = column.map((s) => [s, s, s]);
      let pay = 0;
      // All 10 lines read the same tuple, so the sum of their total-bet
      // amounts is exactly what one line pays in line-bet units.
      for (const w of evaluate(grid).lineWins) pay += w.amount;
      if (pay > 0) total += weight * pay;
      return;
    }
    for (const [sym, c] of counts[x]) {
      column[x] = sym;
      walk(x + 1, weight * c);
    }
  };
  walk(0, 1);
  return total / reshuffles(reels);
}

/** Expected scatter pay (total bets) and free games awarded per base spin (q). */
function scatterPart(reels: SymbolId[][]): { pay: number; q: number } {
  const p = reels.map((reel) => (reel.filter((s) => s === SCATTER).length * ROWS) / reel.length);
  let pay = 0;
  let q = 0;
  for (let mask = 0; mask < 1 << REELS; mask++) {
    let prob = 1;
    const grid: Grid = [];
    for (let x = 0; x < REELS; x++) {
      if (mask & (1 << x)) {
        prob *= p[x];
        grid.push([SCATTER, 'TEN', 'NINE']);
      } else {
        prob *= 1 - p[x];
        grid.push(['TEN', 'NINE', 'TEN']);
      }
    }
    if (prob === 0) continue;
    const r = evaluate(grid);
    pay += prob * (r.scatterHit?.amount ?? 0);
    q += prob * r.freeSpinsWon;
  }
  return { pay, q };
}

console.log('=== phase 1: exact enumeration through the shipped evaluate() ===\n');
console.log('free games, every expanding symbol (every stop combination of its uncovered reels):');
const free = new Map<SymbolId, FreeStat>();
for (const es of EXPANDERS) {
  const st = freeExact(es);
  free.set(es, st);
  const id = slotId(es);
  const printed = P.es.get(id);
  const rtp = st.sum / LINES / st.n;
  const inPool = EXPAND_POOL.filter((s) => s === es).length;
  console.log(
    `  [${id}] ${es.padEnd(11)} covers ${st.cover}, ${String(st.n).padStart(6)} grids, in pool ${inPool}/${POOL_N}: ` +
      `lined ${pct(st.lined / LINES / st.n)}% + scatter ${pct(st.scat / LINES / st.n)}% = ${pct(rtp)}%, ` +
      `free spins ${st.fs}`,
  );
  if (!printed) {
    bad++;
    console.log(`    MISMATCH slotopol prints no block for symbol ${id}`);
    continue;
  }
  const checks = [hold('RTP', pct(rtp), printed.rtp.toFixed(6))];
  if (printed.fs !== undefined) {
    checks.push(hold('free spins', st.fs, printed.fs));
    checks.push(hold('lined', sig5((st.lined / LINES / st.n) * 100), printed.lined!));
    checks.push(hold('scatter', sig5((st.scat / LINES / st.n) * 100), printed.scat!));
  } else {
    checks.push(hold('free spins (none printed, so q = 0)', st.fs, 0));
  }
  console.log(`    ${checks.join('; ')}`);
}

// Pool averages, exactly slotopol's CalcStatReg.
let rtpSym = 0;
let qfs = 0;
for (const es of EXPAND_POOL) {
  const st = free.get(es)!;
  rtpSym += st.sum / LINES / st.n;
  qfs += st.fs / st.n;
}
rtpSym /= POOL_N;
qfs /= POOL_N;
const rtpFs = rtpSym / (1 - qfs);
console.log(
  `\npool of ${POOL_N}: RTP(sym) = ${pct(rtpSym)}% per free game, q = ${qfs.toFixed(6)} free spins per free game, ` +
    `sq = 1/(1-q) = ${(1 / (1 - qfs)).toFixed(6)}`,
);
console.log(`  RTP per free game awarded = sq * RTP(sym) = ${pct(rtpFs)}%`);
console.log(
  `  ${hold('RTPfs', pct(rtpFs), P.rtpfs.toFixed(6))}; ${hold('q', sig5(qfs), P.qfs)}; ` +
    `${hold('RTP(sym)', sig5(rtpSym * 100), P.rtpsym)}`,
);

const live = liveLantern();
const ours13 = free.get(SCATTER)!;
console.log(
  `\nthe LANTERN cover through slotopol's LIVE ScanLined (its blank read as "no symbol yet"):\n` +
    `  middle line only, as its par sheet ran it (g.Sel = 1): ${pct(live.one)}% ` +
    `(${hold('vs printed RTP[13]', pct(live.one), P.es.get(SID)!.rtp.toFixed(6))})\n` +
    `  all 10 lines: ${pct(live.ten)}%, because lines 2, 3, 8 and 9 skip both blanks and pay from reel 3.\n` +
    `  This game, all 10 lines, a blank pays nothing and blocks the line: ${pct(ours13.sum / LINES / ours13.n)}%.`,
);
const liveSym = rtpSym + (live.ten - ours13.sum / LINES / ours13.n) * (EXPAND_POOL.filter((s) => s === SCATTER).length / POOL_N);
const liveFs = liveSym / (1 - qfs);
console.log(`  slotopol's live server would pay ${pct(liveFs)}% per free game awarded instead of ${pct(rtpFs)}%.\n`);

console.log('base sets:');
let activeRtp1 = 0;
for (const set of REEL_SETS) {
  const n = reshuffles(set.reels);
  const lines = lineRtp(set.reels);
  const sc = scatterPart(set.reels);
  const sym = lines + sc.pay;
  const printed = P.sets.get(set.rtp.toFixed(6))!;
  const rtp = sym + sc.q * rtpFs;
  const active = set === ACTIVE_REELS;
  if (active) activeRtp1 = rtp;
  console.log(
    `set ${set.rtp.toFixed(6)}${active ? ' (ACTIVE)' : ''}: lines ${pct(lines)}% + scatter ${pct(sc.pay)}%, ` +
      `q = ${sc.q.toFixed(6)}, free games 1 in ${(FREE_SPINS_AWARD / sc.q).toFixed(3)}`,
  );
  const fsAll = sc.q * n;
  console.log(
    `  ${hold('reshuffles', n, printed.total)}; ${hold('symbols', pct(sym), printed.sym.toFixed(6))}; ` +
      `${hold('lined', sig5(lines * 100), printed.lined)}; ${hold('scatter', sig5(sc.pay * 100), printed.scat)}; ` +
      `${hold('free spins', Math.round(fsAll), printed.fs)}; ${hold('q', sig5(sc.q), printed.q)}`,
  );
  if (Math.abs(fsAll - Math.round(fsAll)) > 1e-6) {
    bad++;
    console.log('  MISMATCH free spins are not a whole number over all reshuffles');
  }
  console.log(`  RTP = ${pct(sym)} + ${sc.q.toFixed(6)}*${pct(rtpFs)} = ${pct(rtp)}%: ${hold('label', pct(rtp), set.rtp.toFixed(6))}`);
}
console.log(
  `\nACTIVE set ${ACTIVE_REELS.rtp.toFixed(6)}: RTP ${pct(activeRtp1)}%; ` +
    hold('shipped GAME_RTP', pct(activeRtp1), GAME_RTP.toFixed(6)),
);
console.log(
  bad === 0
    ? `phase 1: every figure slotopol printed for the ${EXPANDERS.length} expanding symbols, the pool and all ` +
        `${REEL_SETS.length} base sets is reproduced to 6 decimals.\n`
    : `phase 1: ${bad} figure(s) DO NOT match.\n`,
);
if (QUICK) process.exit(bad === 0 ? 0 : 1);

// ---------------------------------------------------------------- phase 2

/** scatter pay in line-bet units and free spins, by count 0..15 */
const SCATU = new Int32Array(REELS * ROWS + 1);
const SCATFS = new Int32Array(REELS * ROWS + 1);
for (let k = 1; k <= REELS * ROWS; k++) {
  SCATU[k] = SCAT_PAY[Math.min(k, 5) - 1] * LINES;
  SCATFS[k] = SCAT_FREESPIN[Math.min(k, 5) - 1];
}
const fastId = (s: SymbolId) => (s === BLANK ? BLANK_ID : slotId(s));

/** This game's line rule on numeric grids, BLANK a real symbol that pays nothing. Line-bet units. */
function lineUnits(g: Int8Array): number {
  let units = 0;
  for (let li = 0; li < LINES; li++) {
    let syml = 0;
    let numw = 0;
    let numl = REELS;
    for (let x = 0; x < REELS; x++) {
      const s = g[x * ROWS + LROW[li * REELS + x]];
      if (s === WID) {
        if (syml === 0) numw = x + 1;
      } else if (syml === 0) syml = s;
      else if (s !== syml) {
        numl = x;
        break;
      }
    }
    const payw = numw >= 2 ? PAY[WID * 5 + numw - 1] : 0;
    const payl = numl >= 2 && syml > 0 ? PAY[syml * 5 + numl - 1] : 0;
    units += payl > payw ? payl : payw;
  }
  return units;
}

/** Prove the fast scorer says exactly what the shipped engine says. */
function proveScorer(trials: number) {
  const g = new Int8Array(REELS * ROWS);
  for (let t = 0; t < trials; t++) {
    const grid: Grid = [];
    let expand: { symbol: SymbolId; reels: number } | undefined;
    if (t % 2 === 0) {
      const reels = REEL_SETS[(t >> 1) % REEL_SETS.length].reels;
      for (let x = 0; x < REELS; x++) grid.push(windowAt(reels[x], (Math.random() * reels[x].length) | 0));
    } else {
      const es = EXPANDERS[(t >> 1) % EXPANDERS.length];
      expand = { symbol: es, reels: EXPAND_REELS[es] };
      for (let x = 0; x < REELS; x++) {
        grid.push(x < expand.reels ? coveredReel(es) : windowAt(FREE_REELS[x], (Math.random() * FREE_REELS[x].length) | 0));
      }
    }
    let sc = 0;
    for (let x = 0; x < REELS; x++) {
      for (let y = 0; y < ROWS; y++) {
        g[x * ROWS + y] = fastId(grid[x][y]);
        if (grid[x][y] === SCATTER) sc++;
      }
    }
    const want = evaluate(grid, expand);
    const got = lineUnits(g) + SCATU[sc];
    if (Math.abs(want.totalWin * LINES - got) > 1e-9) {
      throw new Error(`scorer disagrees: engine ${want.totalWin * LINES} vs fast ${got} line bets on ${JSON.stringify(grid)}`);
    }
    if (want.freeSpinsWon !== SCATFS[sc]) throw new Error(`free spins disagree on ${JSON.stringify(grid)}`);
  }
  console.log(`fast scorer agrees with the shipped evaluate() on ${trials} random grids, base and free.\n`);
}

interface Brute {
  n: number;
  /** spin pay in LINE bets, summed exactly; squares as a BigInt */
  sum: number;
  sq: bigint;
  sumT: number;
  fs: number;
  triggers: number;
  hits: number;
  max: number;
  maxStops: number[];
}

/** Every stop combination of one base set. */
function bruteBase(reels: SymbolId[][], label: string): Brute {
  const L = reels.map((r) => r.length);
  const win = reels.map((r) => {
    const w = new Int8Array(r.length * ROWS);
    for (let stop = 0; stop < r.length; stop++) for (let y = 0; y < ROWS; y++) w[stop * ROWS + y] = fastId(r[(stop + y) % r.length]);
    return w;
  });
  const lan = reels.map((r) => {
    const out = new Int8Array(r.length);
    for (let stop = 0; stop < r.length; stop++) for (let y = 0; y < ROWS; y++) if (r[(stop + y) % r.length] === SCATTER) out[stop]++;
    return out;
  });
  const n = L.reduce((a, b) => a * b, 1);
  const g = new Int8Array(REELS * ROWS);
  const r: Brute = { n, sum: 0, sq: 0n, sumT: 0, fs: 0, triggers: 0, hits: 0, max: 0, maxStops: [] };
  const t0 = Date.now();
  for (let a = 0; a < L[0]; a++) {
    for (let y = 0; y < ROWS; y++) g[y] = win[0][a * ROWS + y];
    let part = 0;
    for (let b = 0; b < L[1]; b++) {
      for (let y = 0; y < ROWS; y++) g[ROWS + y] = win[1][b * ROWS + y];
      for (let c = 0; c < L[2]; c++) {
        for (let y = 0; y < ROWS; y++) g[2 * ROWS + y] = win[2][c * ROWS + y];
        for (let d = 0; d < L[3]; d++) {
          for (let y = 0; y < ROWS; y++) g[3 * ROWS + y] = win[3][d * ROWS + y];
          const sc4 = lan[0][a] + lan[1][b] + lan[2][c] + lan[3][d];
          for (let e = 0; e < L[4]; e++) {
            for (let y = 0; y < ROWS; y++) g[4 * ROWS + y] = win[4][e * ROWS + y];
            const sc = sc4 + lan[4][e];
            const w = lineUnits(g) + SCATU[sc];
            if (w > 0) {
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

/** Every stop combination of one free game with `es` drawn, through the fast scorer. */
function bruteFree(es: SymbolId): FreeStat {
  const cover = EXPAND_REELS[es];
  const covered = coveredReel(es).map(fastId);
  const g = new Int8Array(REELS * ROWS);
  for (let x = 0; x < cover; x++) for (let y = 0; y < ROWS; y++) g[x * ROWS + y] = covered[y];
  const lens = FREE_REELS.map((r) => r.length);
  let n = 1;
  for (let x = cover; x < REELS; x++) n *= lens[x];
  const baseSc = es === SCATTER ? cover : 0;
  const st: FreeStat = { es, cover, n, lined: 0, scat: 0, sum: 0, sq: 0, sumT: 0, fs: 0, triggers: 0, hits: 0, max: 0 };
  for (let i = 0; i < n; i++) {
    let t = i;
    let sc = baseSc;
    for (let x = cover; x < REELS; x++) {
      const reel = FREE_REELS[x];
      const stop = t % lens[x];
      t = Math.floor(t / lens[x]);
      for (let y = 0; y < ROWS; y++) {
        const s = reel[(stop + y) % reel.length];
        g[x * ROWS + y] = fastId(s);
        if (s === SCATTER) sc++;
      }
    }
    const li = lineUnits(g);
    const w = li + SCATU[sc];
    st.lined += li;
    st.scat += SCATU[sc];
    st.sum += w;
    st.sq += w * w;
    if (w > 0) st.hits++;
    if (w > st.max) st.max = w;
    if (SCATFS[sc] > 0) {
      st.fs += SCATFS[sc];
      st.triggers++;
      st.sumT += w;
    }
  }
  return st;
}

/**
 * Exact mean and SD of one complete round, in total bets. A free games
 * session is 10 independent "spin trees": a spin Y that may award K = 10 more
 * spins (K and Y come from the same grid and the same drawn symbol, so they
 * are correlated), each of which starts its own tree. With T one tree:
 *   E[T]   = E[Y] / (1 - E[K])
 *   E[T^2] = (E[Y^2] + 2 E[YK] E[T] + E[K(K-1)] E[T]^2) / (1 - E[K])
 * Free-game moments are pool averages of the per-symbol moments.
 */
function roundMoments(base: Brute) {
  const A = FREE_SPINS_AWARD;
  let m1 = 0;
  let m2 = 0;
  let mT = 0;
  let pTb = 0;
  for (const es of EXPAND_POOL) {
    const st = free.get(es)!;
    m1 += st.sum / LINES / st.n;
    m2 += st.sq / (LINES * LINES) / st.n;
    mT += st.sumT / LINES / st.n;
    pTb += st.triggers / st.n;
  }
  m1 /= POOL_N;
  m2 /= POOL_N;
  mT /= POOL_N;
  pTb /= POOL_N;
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
  return { mean: eR, sd: Math.sqrt(eR2 - eR * eR), eS, sdS: Math.sqrt(varS), spins: A / (1 - eK) };
}

console.log('=== phase 2: brute force over every stop combination ===\n');
proveScorer(4_000_000);

console.log('free games again, through the fast scorer:');
let freeMax = 0;
let freeMaxEs: SymbolId = SCATTER;
let everyFreePays = true;
for (const es of EXPANDERS) {
  const a = free.get(es)!;
  const b = bruteFree(es);
  const same = a.n === b.n && a.sum === b.sum && a.sq === b.sq && a.sumT === b.sumT && a.fs === b.fs && a.lined === b.lined;
  if (!same) bad++;
  if (b.hits !== b.n) everyFreePays = false;
  if (b.max > freeMax) {
    freeMax = b.max;
    freeMaxEs = es;
  }
  console.log(
    `  ${es.padEnd(11)} ${pct(b.sum / LINES / b.n)}%, biggest ${b.max / LINES}x, hit rate ${((b.hits / b.n) * 100).toFixed(2)}%` +
      `${same ? ', identical to phase 1' : ' MISMATCH with phase 1'}`,
  );
}
console.log('');

let active: Brute | null = null;
for (const set of REEL_SETS) {
  const isActive = set === ACTIVE_REELS;
  const r = bruteBase(set.reels, `set ${set.rtp.toFixed(6)}${isActive ? ' (ACTIVE)' : ''}`);
  if (isActive) active = r;
  const printed = P.sets.get(set.rtp.toFixed(6))!;
  const q = r.fs / r.n;
  console.log(
    `  ${hold('symbols', pct(r.sum / LINES / r.n), printed.sym.toFixed(6))}; ${hold('free spins', r.fs, printed.fs)}; ` +
      `${hold('label', pct(r.sum / LINES / r.n + q * rtpFs), set.rtp.toFixed(6))}\n`,
  );
}

const m = roundMoments(active!);
const activeRtp2 = active!.sum / LINES / active!.n + (active!.fs / active!.n) * rtpFs;
const baseRtp = active!.sum / LINES / active!.n;
console.log(
  `ACTIVE set ${ACTIVE_REELS.rtp.toFixed(6)}, exact per round:\n` +
    `  RTP ${pct(activeRtp2)}%  (base ${pct(baseRtp)}% + free games ${pct(activeRtp2 - baseRtp)}%), ` +
    `phase 1 ${pct(activeRtp1)}%, ${hold('GAME_RTP', pct(activeRtp2), GAME_RTP.toFixed(6))}\n` +
    `  mean by moments ${pct(m.mean)}%, standard deviation ${m.sd.toFixed(4)} total bets per round\n` +
    `  free games: 1 in ${(active!.n / active!.triggers).toFixed(3)} rounds, ${m.spins.toFixed(4)} spins per session, ` +
    `${(m.eS * 100).toFixed(4)}% of the bet per session (SD ${m.sdS.toFixed(3)} bets)\n` +
    `  base hit rate ${((active!.hits / active!.n) * 100).toFixed(4)}%, ` +
    `${everyFreePays ? 'every free game pays (each drawn symbol covers a paying run)' : 'some free games pay nothing'}\n` +
    `  biggest single base spin ${active!.max / LINES}x, biggest single free spin ${freeMax / LINES}x (${freeMaxEs} drawn)`,
);
if (Math.abs(activeRtp2 - activeRtp1) > 1e-12 || Math.abs(m.mean - activeRtp2) > 1e-12) {
  bad++;
  console.log('  MISMATCH between phase 1, phase 2 and the moments');
}
console.log(bad === 0 ? '\nALL CHECKS PASS.' : `\n${bad} CHECK(S) FAILED.`);
process.exit(bad === 0 ? 0 : 1);
