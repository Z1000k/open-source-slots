/**
 * EXACT verification — no sampling anywhere.
 *
 * Phase 1 factors the game the way it actually factors, scoring every case
 * with the SHIPPED evaluate():
 *
 *   - Line wins. A bet line reads one row of each reel, the stops are
 *     uniform and independent across reels, and nothing in this game reaches
 *     across a window: a cell reads wild because of its own symbol (the
 *     MONARCH, or in a free game the crowned heir). So per reel and per row
 *     we count the stops leaving each symbol there, and a line's expected pay
 *     is a weighted sum over symbol tuples. Each tuple is scored once by
 *     evaluate() on a grid whose columns are constant, where all 20 lines
 *     read that tuple; then every line is weighted on its own rows.
 *   - The heirs. Per reel we count the stops by how many of each heir the
 *     window shows, and score every combination of counts with evaluate():
 *     who calls the free games, and in a free game the scatter pay.
 *
 *     q                      = triggers x 35 / reshuffles     (35: the average draw)
 *     RTP(free game awarded) = rtp(sym on the free reels) / (1 - q(free))   [retriggers]
 *     RTP(set)               = rtp(sym) + q * RTP(free game awarded)
 *
 *   1A  slotopol's par sheet as slotopol ran it (royaldynasty_scan.go): the
 *       free games scored with the HEIRESS calling them (g.TS = scat1). Every
 *       figure it printed is held against it: per block the reshuffles, the
 *       lined and scatter parts, the symbols figure, q, sq, the hit rate and
 *       the RTP (the set's label). Its "free spins" number is a tally of
 *       random draws, so it is only checked for plausibility.
 *   1B  the game as it is played and paid: a base trigger's free games are
 *       priced with whichever heir called them, held against GAME_RTP.
 *
 * Phase 2 brute-forces every stop combination of every base set and of the
 * free set, once per calling heir, with a fast integer scorer first proven
 * equal to the shipped evaluate() on millions of grids (strip windows and
 * arbitrary ones, base and both kinds of free game). Its integer sums must
 * equal phase 1's exactly, all 20 lines and line 1 alone, and it gives the
 * exact hit rates, the biggest single spins and the exact second moments,
 * hence the exact per-round standard deviation (what Monte Carlo is judged
 * by).
 *
 *   npm run sim:exact              both phases
 *   npm run sim:exact -- --quick   phase 1 only
 */
import { ACTIVE_REELS, FREE_REELS, REEL_SETS } from '../engine/config/reelSets';
import { evaluate } from '../engine/evaluate';
import { windowAt } from '../engine/spin';
import { LINE_PAY, RUN_MIN, SCAT_MIN, SCAT_PAY, WILD_MULT, WILD_RUN_MIN } from '../engine/config/paytable';
import { PAYLINES } from '../engine/config/paylines';
import { GAME_RTP } from '../engine/config/rtp';
import {
  FREE_GAMES_DRAW,
  HEIRS,
  LINES,
  REELS,
  ROWS,
  SYMBOL_ORDER,
  WILD,
  otherHeir,
  type Grid,
  type Heir,
  type SymbolId,
} from '../engine/types';
import { readPrinted } from './printed';

const QUICK = process.argv.includes('--quick');
const P = readPrinted();
if (P.sets.size !== REEL_SETS.length) {
  throw new Error(`slotopol prints ${P.sets.size} sets, the game ships ${REEL_SETS.length}`);
}

/** The free games draw: its mean (35, slotopol's par sheet constant) and E[K(K-1)], Var[K]. */
const EK = FREE_GAMES_DRAW.reduce((a, k) => a + k, 0) / FREE_GAMES_DRAW.length;
const EKK1 = FREE_GAMES_DRAW.reduce((a, k) => a + k * (k - 1), 0) / FREE_GAMES_DRAW.length;
const VARK = FREE_GAMES_DRAW.reduce((a, k) => a + k * k, 0) / FREE_GAMES_DRAW.length - EK * EK;
if (EK !== 35) throw new Error(`the draw averages ${EK}, slotopol's par sheet uses 35`);

const pct = (x: number) => (x * 100).toFixed(6);
const sig5 = (x: number) => Number(x.toPrecision(5));
const reshuffles = (reels: SymbolId[][]) => reels.reduce((a, r) => a * r.length, 1);
let bad = 0;
const hold = (what: string, got: string | number, want: string | number): string => {
  const ok = got === want;
  if (!ok) bad++;
  return ok ? `${what} ${got} MATCH` : `${what} ${got} vs ${want} MISMATCH`;
};
const callerName = (c: Heir | null) => (c === null ? 'base' : `${c} calling`);

// ---------------------------------------------------------------- phase 1

/** Exact sums over every reshuffle of one reel set. */
interface Sums {
  n: number;
  /** line wins summed over every reshuffle, in LINE bets, one integer per bet line */
  perLine: number[];
  /** scatter pays summed over every reshuffle, in TOTAL bets (an integer) */
  scatBets: number;
  /** reshuffles that award free games */
  triggers: number;
  /** the same, by the heir that calls them */
  byCaller: Record<Heir, number>;
}

/** For each reel and row: the number of stops that leave each symbol on that row. */
function rowStates(reels: SymbolId[][]): Map<SymbolId, number>[][] {
  return reels.map((reel) => {
    const rows: Map<SymbolId, number>[] = Array.from({ length: ROWS }, () => new Map());
    for (let stop = 0; stop < reel.length; stop++) {
      const col = windowAt(reel, stop);
      for (let y = 0; y < ROWS; y++) rows[y].set(col[y], (rows[y].get(col[y]) ?? 0) + 1);
    }
    return rows;
  });
}

/** Line wins over every reshuffle, in line bets, per line: every symbol tuple scored once, weighted per line. */
function lineSums(reels: SymbolId[][], caller: Heir | null): number[] {
  const states = rowStates(reels);
  /** every symbol a reel can show on any row */
  const union = states.map((rows) => [...new Set(rows.flatMap((m) => [...m.keys()]))]);
  const column: SymbolId[] = new Array(REELS);
  const perLine: number[] = new Array(LINES).fill(0);
  const walk = (x: number) => {
    if (x === REELS) {
      const grid: Grid = column.map((s) => [s, s, s]);
      let pay = 0;
      // All 20 lines read the same tuple, so the sum of their total-bet
      // amounts is exactly what one line pays in line-bet units.
      for (const w of evaluate(grid, caller).lineWins) pay += w.amount;
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

/** Scatter pays (total bets) and free games calls over every reshuffle: every combination of per-reel heir counts. */
function scatterSum(reels: SymbolId[][], caller: Heir | null): Pick<Sums, 'scatBets' | 'triggers' | 'byCaller'> {
  const byCount = reels.map((reel) => {
    const m = new Map<string, { a: number; b: number; n: number }>();
    for (let stop = 0; stop < reel.length; stop++) {
      const w = windowAt(reel, stop);
      const a = w.filter((s) => s === 'HEIRESS').length;
      const b = w.filter((s) => s === 'HEIR').length;
      const e = m.get(`${a},${b}`) ?? { a, b, n: 0 };
      e.n++;
      m.set(`${a},${b}`, e);
    }
    return [...m.values()];
  });
  const out = { scatBets: 0, triggers: 0, byCaller: { HEIRESS: 0, HEIR: 0 } as Record<Heir, number> };
  const cols: SymbolId[][] = new Array(REELS);
  const walk = (x: number, weight: number) => {
    if (x === REELS) {
      const r = evaluate(cols, caller);
      if (r.scatterHit) {
        out.scatBets += weight * r.scatterHit.amount;
        out.triggers += weight;
        out.byCaller[r.scatterHit.symbol] += weight;
      }
      return;
    }
    for (const { a, b, n } of byCount[x]) {
      const col: SymbolId[] = [];
      for (let i = 0; i < a; i++) col.push('HEIRESS');
      for (let i = 0; i < b; i++) col.push('HEIR');
      while (col.length < ROWS) col.push('NINE');
      cols[x] = col;
      walk(x + 1, weight * n);
    }
  };
  walk(0, 1);
  return out;
}

function exactSums(reels: SymbolId[][], caller: Heir | null): Sums {
  return { n: reshuffles(reels), perLine: lineSums(reels, caller), ...scatterSum(reels, caller) };
}

/** A block's figures when the first `sel` lines are scored (cost `sel` line bets). */
function figures(s: Sums, sel: number) {
  let units = 0;
  for (let li = 0; li < sel; li++) units += s.perLine[li];
  const lined = units / sel / s.n;
  const scat = s.scatBets / s.n;
  const q = (s.triggers * EK) / s.n;
  return { lined, scat, sym: lined + scat, q, sq: 1 / (1 - q), hr: s.n / s.triggers };
}

console.log('=== phase 1: factored exact enumeration through the shipped evaluate() ===\n');

const free1: Record<Heir, Sums> = {
  HEIRESS: exactSums(FREE_REELS, 'HEIRESS'),
  HEIR: exactSums(FREE_REELS, 'HEIR'),
};
const sets1 = new Map<number, Sums>();
for (const set of REEL_SETS) sets1.set(set.rtp, exactSums(set.reels, null));

// Every line must earn the same, base and free alike: that is why no figure can see the line count.
const blocks1: [string, Sums][] = [
  ...REEL_SETS.map((s) => [`set ${s.rtp}`, sets1.get(s.rtp)!] as [string, Sums]),
  ...HEIRS.map((h) => [`free games, ${h} calling`, free1[h]] as [string, Sums]),
];
for (const [what, s] of blocks1) {
  if (s.perLine.some((v) => v !== s.perLine[0])) {
    bad++;
    console.log(`MISMATCH ${what}: the lines do not all earn the same`);
  }
}
for (const h of HEIRS) {
  if (free1[h].byCaller[otherHeir(h)] !== 0 || free1[h].byCaller[h] !== free1[h].triggers) {
    bad++;
    console.log(`MISMATCH free games, ${h} calling: a retrigger came from the other heir`);
  }
}
console.log(
  `every line earns the same, on all ${REEL_SETS.length} base sets and in the free games whichever heir calls them ` +
    `(one symbol per reel, no reach across a window)\n`,
);

console.log("--- 1A: slotopol's par sheet as slotopol ran it, free games with the HEIRESS calling (g.TS = scat1) ---\n");

/** slotopol's random free spins tally against its expectation 35 x triggers, in standard deviations. */
const tallyZ = (printedFs: number, triggers: number) => (printedFs - EK * triggers) / Math.sqrt(VARK * triggers);
const fA = figures(free1.HEIRESS, 1);
const rtpFs1 = fA.sym / (1 - fA.q);
const pb = P.bon;
console.log(`free games: reels lengths [${FREE_REELS.map((r) => r.length).join(', ')}], reshuffles ${free1.HEIRESS.n}`);
console.log(`  symbols: ${pct(fA.lined)}(lined) + ${pct(fA.scat)}(scatter) = ${pct(fA.sym)}% per free game`);
console.log(
  `  triggers ${free1.HEIRESS.triggers}, q = triggers*35/N = ${fA.q.toFixed(8)}, sq = 1/(1-q) = ${fA.sq.toFixed(6)}, ` +
    `hit rate 1/${fA.hr.toFixed(4)}`,
);
console.log(`  RTP = sq*rtp(sym) = ${pct(rtpFs1)}% per free game awarded`);
console.log(
  `  ${hold('reshuffles', free1.HEIRESS.n, pb.total)}; ${hold('lined', sig5(fA.lined * 100), pb.lined)}; ` +
    `${hold('scatter', sig5(fA.scat * 100), pb.scat)}; ${hold('symbols', pct(fA.sym), pb.sym.toFixed(6))};\n` +
    `  ${hold('q', sig5(fA.q), pb.q)}; ${hold('sq', fA.sq.toFixed(6), pb.sq.toFixed(6))}; ` +
    `${hold('hit rate', sig5(fA.hr), pb.hr)}; ${hold('RTP', pct(rtpFs1), pb.rtp.toFixed(6))}`,
);
const zb = tallyZ(pb.fs, free1.HEIRESS.triggers);
if (Math.abs(zb) > 5) bad++;
console.log(
  `  slotopol's random free spins tally ${pb.fs} vs 35 x ${free1.HEIRESS.triggers} = ${EK * free1.HEIRESS.triggers}: ` +
    `${zb >= 0 ? '+' : ''}${zb.toFixed(2)} SD ${Math.abs(zb) <= 5 ? '(plausible)' : 'IMPLAUSIBLE'}\n`,
);

const labels = REEL_SETS.map((s) => s.rtp.toFixed(6));
console.log(`${hold('RTP list printed at the top of rmap', P.list.join(' '), labels.join(' '))}`);
let worstTally = 0;
for (const set of REEL_SETS) {
  const s = sets1.get(set.rtp)!;
  const f = figures(s, 1);
  const rtp = f.sym + f.q * rtpFs1;
  const printed = P.sets.get(set.rtp.toFixed(6));
  console.log(
    `set ${set.rtp.toFixed(6)}${set === ACTIVE_REELS ? ' (ACTIVE)' : ''}: lines ${pct(f.lined)}% + scatter ${pct(f.scat)}% = ` +
      `${pct(f.sym)}%, triggers ${s.triggers} (HEIRESS ${s.byCaller.HEIRESS}, HEIR ${s.byCaller.HEIR}), ` +
      `q = ${f.q.toFixed(8)}, free games 1 in ${f.hr.toFixed(3)}`,
  );
  if (!printed) {
    bad++;
    console.log('  MISMATCH: slotopol prints no figures for this set');
    continue;
  }
  const z = tallyZ(printed.fs, s.triggers);
  worstTally = Math.max(worstTally, Math.abs(z));
  if (Math.abs(z) > 5) bad++;
  console.log(
    `  ${hold('reshuffles', s.n, printed.total)}; ${hold('lined', sig5(f.lined * 100), printed.lined)}; ` +
      `${hold('scatter', sig5(f.scat * 100), printed.scat)}; ${hold('symbols', pct(f.sym), printed.sym.toFixed(6))};\n` +
      `  ${hold('q', sig5(f.q), printed.q)}; ${hold('sq', f.sq.toFixed(6), printed.sq.toFixed(6))}; ` +
      `${hold('hit rate', sig5(f.hr), printed.hr)}; free spins tally ${z >= 0 ? '+' : ''}${z.toFixed(2)} SD`,
  );
  console.log(
    `  RTP = ${pct(f.sym)} + ${f.q.toFixed(8)}*${pct(rtpFs1)} = ${pct(rtp)}%: ` +
      `${hold('label', pct(rtp), set.rtp.toFixed(6))}; ${hold('printed RTP', pct(rtp), printed.rtp.toFixed(6))}`,
  );
}
const bad1A = bad;
console.log(
  bad1A === 0
    ? `\n1A: every figure slotopol printed for the free games and all ${REEL_SETS.length} base sets is reproduced ` +
        `(6 decimals where printed so); its random free spins tallies all sit within ${worstTally.toFixed(2)} SD of ` +
        `35 x triggers.\n`
    : `\n1A: ${bad1A} figure(s) DO NOT match.\n`,
);

console.log('--- 1B: the game as played and paid: each trigger priced with the heir who called it ---\n');
const rtpFsOf = {} as Record<Heir, number>;
for (const h of HEIRS) {
  const f = figures(free1[h], LINES);
  rtpFsOf[h] = f.sym / (1 - f.q);
  console.log(
    `free games, ${h} calling: ${pct(f.lined)}(lined) + ${pct(f.scat)}(scatter) = ${pct(f.sym)}% per free game, ` +
      `q = ${f.q.toFixed(8)}, RTP ${pct(rtpFsOf[h])}% per free game awarded`,
  );
}
console.log(
  `  ${hold('free games worth the same whichever heir calls', pct(rtpFsOf.HEIR), pct(rtpFsOf.HEIRESS))} ` +
    `(every free strip holds one HEIRESS and one HEIR)\n`,
);
let activeRtp1 = NaN;
let activeBase1 = NaN;
for (const set of REEL_SETS) {
  const s = sets1.get(set.rtp)!;
  const f = figures(s, LINES);
  const rtp =
    f.sym + ((s.byCaller.HEIRESS * EK) / s.n) * rtpFsOf.HEIRESS + ((s.byCaller.HEIR * EK) / s.n) * rtpFsOf.HEIR;
  if (set === ACTIVE_REELS) {
    activeRtp1 = rtp;
    activeBase1 = f.sym;
  }
  console.log(
    `set ${set.rtp.toFixed(6)}${set === ACTIVE_REELS ? ' (ACTIVE)' : ''}: RTP ${pct(rtp)}%  (label ${set.rtp.toFixed(6)}, ` +
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
const AID = slotId('HEIRESS');
const BID = slotId('HEIR');
const LROW = new Int32Array(LINES * REELS);
for (let li = 0; li < LINES; li++) for (let x = 0; x < REELS; x++) LROW[li * REELS + x] = PAYLINES[li][x];
const PAY = new Int32Array((SN + 1) * 5);
for (let s = 1; s <= SN; s++) for (let k = 0; k < 5; k++) PAY[s * 5 + k] = LINE_PAY[SYMBOL_ORDER[s - 1]][k];
/** the calling heir's scatter pay in a free game, in LINE bets, by count 0..15 */
const SCATU = new Int32Array(REELS * ROWS + 1);
for (let k = SCAT_MIN; k <= REELS * ROWS; k++) SCATU[k] = SCAT_PAY[Math.min(k, 5) - 1] * LINES;

/** what the last lineUnits() call paid on line 1 alone */
let firstLine = 0;

/** The line rule on numeric grids, `ps` the crowned heir's id in a free game (0 in the base game). Line-bet units, all 20 lines. */
function lineUnits(g: Int8Array, ps: number): number {
  let units = 0;
  for (let li = 0; li < LINES; li++) {
    const base = li * REELS;
    let syml = 0;
    let numw = 0;
    let numl = REELS;
    let mw = 1;
    for (let x = 0; x < REELS; x++) {
      const s = g[x * ROWS + LROW[base + x]];
      if (s === WID || s === ps) {
        if (syml === 0) numw = x + 1;
        mw = WILD_MULT;
      } else if (syml === 0) syml = s;
      else if (s !== syml) {
        numl = x;
        break;
      }
    }
    const payw = numw >= WILD_RUN_MIN ? PAY[WID * 5 + numw - 1] : 0;
    const payl = numl >= RUN_MIN && syml > 0 ? PAY[syml * 5 + numl - 1] * mw : 0;
    const p = payl > payw ? payl : payw;
    if (li === 0) firstLine = p;
    units += p;
  }
  return units;
}

/** Prove the fast scorer says exactly what the shipped engine says, on strip windows and arbitrary grids. */
function proveScorer(trials: number) {
  const g = new Int8Array(REELS * ROWS);
  const modes: (Heir | null)[] = [null, 'HEIRESS', 'HEIR'];
  for (let t = 0; t < trials; t++) {
    const caller = modes[t % 3];
    const arbitrary = ((t / 3) | 0) % 2 === 1;
    const reels = caller !== null ? FREE_REELS : REEL_SETS[((t / 6) | 0) % REEL_SETS.length].reels;
    const grid: Grid = [];
    for (let x = 0; x < REELS; x++) {
      grid.push(
        arbitrary
          ? [0, 1, 2].map(() => SYMBOL_ORDER[(Math.random() * SN) | 0])
          : windowAt(reels[x], (Math.random() * reels[x].length) | 0),
      );
    }
    let ca = 0;
    let cb = 0;
    for (let x = 0; x < REELS; x++) {
      for (let y = 0; y < ROWS; y++) {
        const id = slotId(grid[x][y]);
        g[x * ROWS + y] = id;
        if (id === AID) ca++;
        if (id === BID) cb++;
      }
    }
    const want = evaluate(grid, caller);
    const ps = caller === null ? 0 : slotId(otherHeir(caller));
    const lines = lineUnits(g, ps);
    let scat = 0;
    let calls: Heir | null = null;
    if (caller === null) calls = ca >= SCAT_MIN ? 'HEIRESS' : cb >= SCAT_MIN ? 'HEIR' : null;
    else {
      const c = caller === 'HEIRESS' ? ca : cb;
      if (c >= SCAT_MIN) {
        calls = caller;
        scat = SCATU[c];
      }
    }
    if (Math.abs(want.totalWin * LINES - (lines + scat)) > 1e-9) {
      throw new Error(
        `scorer disagrees: engine ${want.totalWin * LINES} vs fast ${lines + scat} line bets on ${JSON.stringify(grid)} ${callerName(caller)}`,
      );
    }
    const line1 = want.lineWins.find((w) => w.line === 0);
    if (Math.abs((line1 ? line1.amount * LINES : 0) - firstLine) > 1e-9) throw new Error(`line 1 disagrees on ${JSON.stringify(grid)}`);
    if ((want.scatterHit?.symbol ?? null) !== calls) throw new Error(`the call disagrees on ${JSON.stringify(grid)} ${callerName(caller)}`);
    if (want.caller !== caller || want.freeGame !== (caller !== null)) throw new Error('free game flags disagree');
  }
  console.log(`fast scorer agrees with the shipped evaluate() on ${trials} grids (strip windows and arbitrary, base and both callers).\n`);
}

interface Brute {
  n: number;
  /** all 20 lines and line 1 alone, LINE bets summed over every reshuffle */
  lineUnits: number;
  line1Units: number;
  /** scatter pays in LINE bets */
  scatUnits: number;
  /** reshuffles that award free games, and by the heir that calls them */
  triggers: number;
  byCaller: Record<Heir, number>;
  /** spin pay in LINE bets summed exactly, its squares as a BigInt */
  sum: number;
  sq: bigint;
  /** pay summed over the spins that award free games, by the calling heir */
  sumT: Record<Heir, number>;
  hits: number;
  max: number;
  maxStops: number[];
}

/** Every stop combination of one reel set; `caller` null for the base game. */
function brute(reels: SymbolId[][], caller: Heir | null, label: string): Brute {
  const L = reels.map((r) => r.length);
  const win = reels.map((r) => {
    const w = new Int8Array(r.length * ROWS);
    for (let stop = 0; stop < r.length; stop++) for (let y = 0; y < ROWS; y++) w[stop * ROWS + y] = slotId(r[(stop + y) % r.length]);
    return w;
  });
  const countOf = (id: number) =>
    reels.map((r) => {
      const out = new Int8Array(r.length);
      for (let stop = 0; stop < r.length; stop++) for (let y = 0; y < ROWS; y++) if (slotId(r[(stop + y) % r.length]) === id) out[stop]++;
      return out;
    });
  const heA = countOf(AID);
  const heB = countOf(BID);
  const ps = caller === null ? 0 : slotId(otherHeir(caller));
  const n = L.reduce((a, b) => a * b, 1);
  const g = new Int8Array(REELS * ROWS);
  const r: Brute = {
    n,
    lineUnits: 0,
    line1Units: 0,
    scatUnits: 0,
    triggers: 0,
    byCaller: { HEIRESS: 0, HEIR: 0 },
    sum: 0,
    sq: 0n,
    sumT: { HEIRESS: 0, HEIR: 0 },
    hits: 0,
    max: 0,
    maxStops: [],
  };
  const t0 = Date.now();
  for (let a = 0; a < L[0]; a++) {
    for (let y = 0; y < ROWS; y++) g[y] = win[0][a * ROWS + y];
    for (let b = 0; b < L[1]; b++) {
      for (let y = 0; y < ROWS; y++) g[ROWS + y] = win[1][b * ROWS + y];
      let part = 0;
      for (let c = 0; c < L[2]; c++) {
        for (let y = 0; y < ROWS; y++) g[2 * ROWS + y] = win[2][c * ROWS + y];
        for (let d = 0; d < L[3]; d++) {
          for (let y = 0; y < ROWS; y++) g[3 * ROWS + y] = win[3][d * ROWS + y];
          const a4 = heA[0][a] + heA[1][b] + heA[2][c] + heA[3][d];
          const b4 = heB[0][a] + heB[1][b] + heB[2][c] + heB[3][d];
          for (let e = 0; e < L[4]; e++) {
            for (let y = 0; y < ROWS; y++) g[4 * ROWS + y] = win[4][e * ROWS + y];
            const ca = a4 + heA[4][e];
            const cb = b4 + heB[4][e];
            const li = lineUnits(g, ps);
            let scat = 0;
            let calls: Heir | null = null;
            if (caller === null) calls = ca >= SCAT_MIN ? 'HEIRESS' : cb >= SCAT_MIN ? 'HEIR' : null;
            else {
              const k = caller === 'HEIRESS' ? ca : cb;
              if (k >= SCAT_MIN) {
                calls = caller;
                scat = SCATU[k];
              }
            }
            const w = li + scat;
            if (w > 0) {
              r.lineUnits += li;
              r.line1Units += firstLine;
              r.scatUnits += scat;
              r.sum += w;
              part += w * w;
              r.hits++;
              if (w > r.max) {
                r.max = w;
                r.maxStops = [a, b, c, d, e];
              }
            }
            if (calls !== null) {
              r.triggers++;
              r.byCaller[calls]++;
              r.sumT[calls] += w;
            }
          }
        }
      }
      r.sq += BigInt(part);
    }
  }
  console.log(
    `${label}: ${n} grids in ${((Date.now() - t0) / 1000).toFixed(1)}s\n` +
      `  spin RTP ${pct(r.sum / LINES / n)}%, free games 1 in ${(n / r.triggers).toFixed(3)} ` +
      `(HEIRESS ${r.byCaller.HEIRESS}, HEIR ${r.byCaller.HEIR}), hit rate ${((r.hits / n) * 100).toFixed(4)}%, ` +
      `biggest spin ${r.max / LINES}x total bet at stops [${r.maxStops.join(', ')}]`,
  );
  return r;
}

/** Brute force against phase 1: the 20-line sum, line 1 alone, the scatter and the calls, all exact integers. */
const agrees = (b: Brute, s: Sums) =>
  b.n === s.n &&
  b.lineUnits === s.perLine.reduce((a, v) => a + v, 0) &&
  b.line1Units === s.perLine[0] &&
  b.scatUnits === s.scatBets * LINES &&
  b.triggers === s.triggers &&
  b.byCaller.HEIRESS === s.byCaller.HEIRESS &&
  b.byCaller.HEIR === s.byCaller.HEIR;

/**
 * One free games session in total bets, for free games one heir called. A
 * session is K "spin trees", K drawn from the free games draw: a free spin Y
 * that may retrigger (indicator I, from the same grid as Y, so correlated)
 * and then draws K' more spins, each of which starts its own tree. With T
 * one tree, p = P(I), q = p E[K]:
 *   E[T]   = E[Y] / (1 - q)
 *   E[T^2] = (E[Y^2] + 2 E[Y I] E[K] E[T] + p E[K(K-1)] E[T]^2) / (1 - q)
 *   E[S] = E[K] E[T],  Var[S] = E[K] Var[T] + Var[K] E[T]^2
 */
function session(fr: Brute, caller: Heir) {
  const m1 = fr.sum / LINES / fr.n;
  const m2 = Number(fr.sq) / (LINES * LINES) / fr.n;
  const mT = fr.sumT[caller] / LINES / fr.n;
  const p = fr.triggers / fr.n;
  const q = p * EK;
  const muT = m1 / (1 - q);
  const eT2 = (m2 + 2 * mT * EK * muT + p * EKK1 * muT * muT) / (1 - q);
  const varT = eT2 - muT * muT;
  return {
    eS: EK * muT,
    varS: EK * varT + VARK * muT * muT,
    spins: EK / (1 - q),
    perSpin: m1,
    sdSpin: Math.sqrt(m2 - m1 * m1),
    rtpFs: muT,
  };
}

/** Exact mean and SD of one complete round, in total bets: the base spin plus, on a call, that heir's session. */
function roundMoments(base: Brute, sess: Record<Heir, ReturnType<typeof session>>) {
  const bm1 = base.sum / LINES / base.n;
  const bm2 = Number(base.sq) / (LINES * LINES) / base.n;
  let eR = bm1;
  let eR2 = bm2;
  for (const h of HEIRS) {
    const p = base.byCaller[h] / base.n;
    const bmT = base.sumT[h] / LINES / base.n;
    const s = sess[h];
    eR += p * s.eS;
    eR2 += 2 * bmT * s.eS + p * (s.varS + s.eS * s.eS);
  }
  return { mean: eR, sd: Math.sqrt(eR2 - eR * eR), sdBase: Math.sqrt(bm2 - bm1 * bm1) };
}

console.log('=== phase 2: brute force over every stop combination ===\n');
proveScorer(6_000_000);

const fr = {} as Record<Heir, Brute>;
const sess = {} as Record<Heir, ReturnType<typeof session>>;
for (const h of HEIRS) {
  fr[h] = brute(FREE_REELS, h, `free reels, ${h} calling (the ${otherHeir(h)} crowned)`);
  sess[h] = session(fr[h], h);
  console.log(
    `  ${hold('integer sums vs phase 1 (20 lines, line 1, scatter, calls)', agrees(fr[h], free1[h]) ? 'identical' : 'differ', 'identical')}; ` +
      `${hold('RTP per free game awarded', pct(sess[h].rtpFs), pct(rtpFsOf[h]))}\n`,
  );
}

let active: Brute | null = null;
for (const set of REEL_SETS) {
  const isActive = set === ACTIVE_REELS;
  const r = brute(set.reels, null, `set ${set.rtp.toFixed(6)}${isActive ? ' (ACTIVE)' : ''}`);
  if (isActive) active = r;
  const rtp =
    r.sum / LINES / r.n +
    ((r.byCaller.HEIRESS * EK) / r.n) * sess.HEIRESS.rtpFs +
    ((r.byCaller.HEIR * EK) / r.n) * sess.HEIR.rtpFs;
  console.log(
    `  ${hold('integer sums vs phase 1', agrees(r, sets1.get(set.rtp)!) ? 'identical' : 'differ', 'identical')}; ` +
      `RTP ${pct(rtp)}%\n`,
  );
}

const m = roundMoments(active!, sess);
const baseRtp = active!.sum / LINES / active!.n;
const activeRtp2 =
  baseRtp +
  ((active!.byCaller.HEIRESS * EK) / active!.n) * sess.HEIRESS.rtpFs +
  ((active!.byCaller.HEIR * EK) / active!.n) * sess.HEIR.rtpFs;
console.log(
  `ACTIVE set ${ACTIVE_REELS.rtp.toFixed(6)}, the shipped 20-line game, exact per round:\n` +
    `  RTP ${pct(activeRtp2)}%  (base ${pct(baseRtp)}% + free games ${pct(activeRtp2 - baseRtp)}%), ` +
    `phase 1 ${pct(activeRtp1)}%, ${hold('GAME_RTP', pct(activeRtp2), GAME_RTP.toFixed(6))}\n` +
    `  mean by moments ${pct(m.mean)}%, standard deviation ${m.sd.toFixed(4)} total bets per round ` +
    `(base spin alone ${m.sdBase.toFixed(4)})\n` +
    `  free games: 1 in ${(active!.n / active!.triggers).toFixed(3)} rounds (${active!.triggers} of ${active!.n} stop combinations: ` +
    `HEIRESS ${active!.byCaller.HEIRESS}, HEIR ${active!.byCaller.HEIR})\n` +
    HEIRS.map(
      (h) =>
        `  ${h} calling: ${sess[h].spins.toFixed(4)} spins per session, ${(sess[h].eS * 100).toFixed(4)}% of the bet per session ` +
        `(SD ${Math.sqrt(sess[h].varS).toFixed(3)} bets); one free game ${pct(sess[h].perSpin)}% (SD ${sess[h].sdSpin.toFixed(4)} bets), ` +
        `retrigger 1 in ${(fr[h].n / fr[h].triggers).toFixed(3)}, hit rate ${((fr[h].hits / fr[h].n) * 100).toFixed(4)}%, ` +
        `biggest single free spin ${fr[h].max / LINES}x`,
    ).join('\n') +
    `\n  base hit rate ${((active!.hits / active!.n) * 100).toFixed(4)}%, biggest single base spin ${active!.max / LINES}x`,
);
if (Math.abs(activeRtp2 - activeRtp1) > 1e-12 || Math.abs(m.mean - activeRtp2) > 1e-12) {
  bad++;
  console.log('  MISMATCH between phase 1, phase 2 and the moments');
}
console.log(bad === 0 ? '\nALL CHECKS PASS.' : `\n${bad} CHECK(S) FAILED.`);
process.exit(bad === 0 ? 0 : 1);
