/**
 * EXACT verification — no sampling anywhere.
 *
 * Phase 1 factors the game the way it actually factors, and scores every
 * case with the SHIPPED evaluate():
 *
 *   - Base line wins. Every bet line takes one row from each reel, and with
 *     a uniform stop that row's symbol is uniform over the strip,
 *     independent across reels. So every line has the same expectation, a
 *     weighted sum over the symbol tuples, each scored on a grid whose
 *     columns are constant, where all 10 lines read that tuple.
 *   - The SUN DISC scatter. checkReels proves no strip shows two in one
 *     window, so a reel shows one with probability count*3/length or none.
 *     That is 32 cases; they give the scatter pay and the free spins.
 *   - The free games' best way. It only asks which symbols each reel shows,
 *     never where. Given reel 1's window (its candidate symbols), each later
 *     reel matters only through WHICH of those candidates it shows: at most
 *     8 patterns per reel, counted off the strip. Every reel-1 window times
 *     every pattern combination is scored on a synthetic grid.
 *
 *   RTP(free game) = (way + scatter) / (1 - q(free))   [retriggers]
 *   RTP(set)       = symbols + q * RTP(free game)
 *
 * The base figures of all 20 sets are held against what slotopol printed
 * into dynastyofra_data.yaml (reshuffles, symbols, integer free spins).
 * slotopol's set labels assume its own, defective free games; phase 1 holds
 * them through slotopol's printed free-games figure, phase 2 rebuilds that
 * figure from scratch.
 *
 * Phase 2 brute-forces every stop combination of every base set, of our
 * free strips and of slotopol's free strips, with fast integer scorers first
 * proven equal to the shipped evaluate() on millions of random grids. On
 * slotopol's free strips it also runs a verbatim port of slotopol's
 * ScanWaysBon, which must reproduce slotopol's printed 509.147554% (the
 * proof of the diagnosis). It gives the exact hit rates, the biggest single
 * spins, and the exact second moments, hence the exact per-round standard
 * deviation (what Monte Carlo gets judged by).
 *
 *   npm run sim:exact              both phases
 *   npm run sim:exact -- --quick   phase 1 only
 */
import { ACTIVE_REELS, FREE_REELS, REEL_SETS, SLOTOPOL_FREE_REELS } from '../engine/config/reelSets';
import { evaluate } from '../engine/evaluate';
import { LINE_PAY, SCAT_FREESPIN, SCAT_PAY } from '../engine/config/paytable';
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
import { readPrinted, YAML } from './printed';

const QUICK = process.argv.includes('--quick');
const { bonus: PB, sets: printedSets } = readPrinted();
if (printedSets.size !== REEL_SETS.length) {
  throw new Error(`${YAML} prints ${printedSets.size} sets, the game ships ${REEL_SETS.length}`);
}

const pct = (x: number) => (x * 100).toFixed(6);
const reshuffles = (reels: SymbolId[][]) => reels.reduce((a, r) => a * r.length, 1);
let bad = 0;
const hold = (what: string, got: string | number, want: string | number): string => {
  const ok = got === want;
  if (!ok) bad++;
  return ok ? `${what} ${got} MATCH` : `${what} ${got} vs ${want} MISMATCH`;
};

// ---------------------------------------------------------------- phase 1

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

/** Expected scatter pay (total bets) and free games awarded per spin (q). */
function scatterPart(reels: SymbolId[][], freeGame: boolean): { pay: number; q: number } {
  const p = reels.map((reel) => (reel.filter((s) => s === SCATTER).length * ROWS) / reel.length);
  let pay = 0;
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
    const r = evaluate(grid, freeGame);
    pay += prob * (r.scatterHit?.amount ?? 0);
    q += prob * r.freeSpinsWon;
  }
  return { pay, q };
}

/** Expected best-way pay of one free game, total bets, through the shipped evaluate(). */
function freeWays(reels: SymbolId[][]): number {
  const windows = reels.map((reel) =>
    reel.map((_, stop) => [0, 1, 2].map((y) => reel[(stop + y) % reel.length])),
  );
  let total = 0;
  for (const w1 of windows[0]) {
    const cands = [...new Set(w1.filter((s) => s !== SCATTER))];
    const n = cands.length;
    // A filler that can never start a way: a paying symbol not on reel 1.
    const filler = SYMBOL_ORDER.find((s) => s !== SCATTER && !w1.includes(s))!;
    // per later reel: how many stops show exactly the candidate subset t
    const pattern = windows.slice(1).map((ws) => {
      const cnt = new Array<number>(1 << n).fill(0);
      for (const w of ws) {
        let t = 0;
        for (let j = 0; j < n; j++) if (w.includes(cands[j])) t |= 1 << j;
        cnt[t]++;
      }
      return cnt;
    });
    const pick = [0, 0, 0, 0];
    const walk = (k: number, weight: number) => {
      if (k === REELS - 1) {
        const grid: Grid = [w1.slice()];
        for (const t of pick) {
          const col: SymbolId[] = [];
          for (let j = 0; j < n; j++) if (t & (1 << j)) col.push(cands[j]);
          while (col.length < ROWS) col.push(filler);
          grid.push(col);
        }
        total += weight * (evaluate(grid, true).wayWin?.amount ?? 0);
        return;
      }
      for (let t = 0; t < 1 << n; t++) {
        if (pattern[k][t] === 0) continue;
        pick[k] = t;
        walk(k + 1, weight * pattern[k][t]);
      }
    };
    walk(0, 1);
  }
  return total / reshuffles(reels);
}

console.log('=== phase 1: factored exact enumeration through the shipped evaluate() ===\n');

/** slotopol's strips, best way paid: what the fix would cost on them. */
const sWays = freeWays(SLOTOPOL_FREE_REELS);
const sScat = scatterPart(SLOTOPOL_FREE_REELS, true);
const sF = (sWays + sScat.pay) / (1 - sScat.q);
console.log(`slotopol's free strips, best way paid (NOT dealt; the cost of the fix on them):`);
console.log(`  ways ${pct(sWays)}% + scatter ${pct(sScat.pay)}% = ${pct(sWays + sScat.pay)}%, q = ${sScat.q.toFixed(6)}, ` +
  `${pct(sF)}% per free game awarded`);
console.log(`  ${hold('free spins over all reshuffles', Math.round(sScat.q * reshuffles(SLOTOPOL_FREE_REELS)), PB.fs)}\n`);

const fN = reshuffles(FREE_REELS);
const fWays = freeWays(FREE_REELS);
const fScat = scatterPart(FREE_REELS, true);
const fS = fWays + fScat.pay;
const sq = 1 / (1 - fScat.q);
const rtpFs = fS * sq;
console.log(`OUR free strips, lengths [${FREE_REELS.map((r) => r.length).join(', ')}], reshuffles ${fN}`);
console.log(`  ways ${pct(fWays)}% + scatter ${pct(fScat.pay)}% = ${pct(fS)}% per free spin`);
console.log(`  q = ${fScat.q.toFixed(6)}, sq = 1/(1-q) = ${sq.toFixed(6)}, retrigger 1 in ${(FREE_SPINS_AWARD / fScat.q).toFixed(3)} free spins`);
console.log(`  RTP(free game) = sq * ${pct(fS)} = ${pct(rtpFs)}% per free game awarded\n`);

let activeRtp1 = 0;
for (const set of REEL_SETS) {
  const n = reshuffles(set.reels);
  const lines = lineRtp(set.reels);
  const sc = scatterPart(set.reels, false);
  const sym = lines + sc.pay;
  const printed = printedSets.get(set.rtp.toFixed(6))!;
  const ours = sym + sc.q * rtpFs;
  const label = sym + sc.q * (PB.rtp / 100);
  const active = set === ACTIVE_REELS;
  if (active) activeRtp1 = ours;
  console.log(`set ${set.rtp.toFixed(6)}${active ? ' (ACTIVE, original)' : ''}: lines ${pct(lines)}% + scatter ${pct(sc.pay)}%, ` +
    `q = ${sc.q.toFixed(6)}, free games 1 in ${(FREE_SPINS_AWARD / sc.q).toFixed(3)}`);
  console.log(`  ${hold('reshuffles', n, printed.total)}; ${hold('symbols', pct(sym), printed.sym.toFixed(6))}; ` +
    `${hold('free spins', Math.round(sc.q * n), printed.fs)}`);
  if (Math.abs(sc.q * n - Math.round(sc.q * n)) > 1e-6) {
    bad++;
    console.log('  MISMATCH free spins are not a whole number over all reshuffles');
  }
  console.log(`  with slotopol's printed free games ${PB.rtp}%: ${hold('label', pct(label), set.rtp.toFixed(6))}`);
  console.log(`  with OUR free games: RTP = ${pct(sym)} + ${sc.q.toFixed(6)}*${pct(rtpFs)} = ${pct(ours)}%`);
}
console.log(`\nACTIVE set with our free games: RTP ${pct(activeRtp1)}%; shipped GAME_RTP ${GAME_RTP.toFixed(6)}: ` +
  hold('GAME_RTP', pct(activeRtp1), GAME_RTP.toFixed(6)));
console.log(
  bad === 0
    ? `phase 1: all ${REEL_SETS.length} base sets reproduce slotopol's printed base figures to 6 decimals, ` +
        `and every label through slotopol's own free-games figure.\n`
    : `phase 1: ${bad} figure(s) DO NOT match.\n`,
);
if (QUICK) process.exit(bad === 0 ? 0 : 1);

// ---------------------------------------------------------------- phase 2

const SN = SYMBOL_ORDER.length;
const WSC = SYMBOL_ORDER.indexOf(WILD) + 1;
if (SYMBOL_ORDER.indexOf(SCATTER) + 1 !== WSC) throw new Error('the wild and the scatter are one symbol here');
const PAY = new Int32Array((SN + 1) * 5);
for (let s = 1; s <= SN; s++) for (let k = 0; k < 5; k++) PAY[s * 5 + k] = LINE_PAY[SYMBOL_ORDER[s - 1]][k];
/** scatter pay in total bets and free spins, by count 0..15 */
const SCATP = new Int32Array(REELS * ROWS + 1);
const SCATFS = new Int32Array(REELS * ROWS + 1);
for (let k = 1; k <= REELS * ROWS; k++) {
  SCATP[k] = SCAT_PAY[Math.min(k, 5) - 1];
  SCATFS[k] = SCAT_FREESPIN[Math.min(k, 5) - 1];
}
const LROW = new Int32Array(LINES * REELS);
for (let li = 0; li < LINES; li++) for (let x = 0; x < REELS; x++) LROW[li * REELS + x] = PAYLINES[li][x];

/** Base spin in LINE-BET units: line pays plus 10x the scatter pay. g[x*3+y] = symbol id. */
function baseUnits(g: Int8Array): number {
  let units = 0;
  for (let li = 0; li < LINES; li++) {
    let syml = 0;
    let numl = REELS;
    for (let x = 0; x < REELS; x++) {
      const s = g[x * ROWS + LROW[li * REELS + x]];
      if (s === WSC) continue;
      if (syml === 0) syml = s;
      else if (s !== syml) {
        numl = x;
        break;
      }
    }
    if (syml > 0) units += PAY[syml * 5 + numl - 1];
  }
  return units;
}

/** Best way in TOTAL-bet units from per-reel presence masks (bit s = symbol id s). */
function wayUnits(m: Int32Array): number {
  let best = 0;
  const m0 = m[0] & ~(1 << WSC);
  for (let s = 1; s <= SN; s++) {
    if (!(m0 & (1 << s))) continue;
    let run = 1;
    while (run < REELS && m[run] & (1 << s)) run++;
    const p = PAY[s * 5 + run - 1];
    if (p > best) best = p;
  }
  return best;
}

/** slotopol's ScanWaysBon, ported verbatim (labelled continues included): the per-line pay. */
function slotopolWays(g: Int8Array): number {
  let pays = 0;
  const line = [0, 0, 0, 0, 0];
  const LX = (x: number) => g[(x - 1) * ROWS + line[x - 1] - 1];
  loop1: for (line[0] = 1; line[0] <= 3; line[0]++) {
    loop2: for (line[1] = 1; line[1] <= 3; line[1]++) {
      loop3: for (line[2] = 1; line[2] <= 3; line[2]++) {
        loop4: for (line[3] = 1; line[3] <= 3; line[3]++) {
          loop5: for (line[4] = 1; line[4] <= 3; line[4]++) {
            let numl = 5;
            const syml = LX(1);
            for (let x = 2; x <= 5; x++) {
              if (LX(x) !== syml) {
                numl = x - 1;
                break;
              }
            }
            if (syml > 0) {
              const payl = PAY[syml * 5 + numl - 1];
              if (payl > pays) {
                pays = payl;
                switch (numl) {
                  case 3:
                    continue loop3;
                  case 4:
                    continue loop4;
                  case 5:
                    continue loop5;
                }
              }
            }
            switch (numl + 1) {
              case 1:
                continue loop1;
              case 2:
                continue loop2;
              case 3:
                continue loop3;
              case 4:
                continue loop4;
              case 5:
                continue loop5;
            }
          }
        }
      }
    }
  }
  return pays;
}

const ids = (reel: SymbolId[]) => reel.map((s) => SYMBOL_ORDER.indexOf(s) + 1);

/** Prove the fast scorers say exactly what the shipped engine says. */
function proveScorers(trials: number) {
  const g = new Int8Array(REELS * ROWS);
  const m = new Int32Array(REELS);
  const pools: { reels: SymbolId[][]; free: boolean }[] = [
    ...REEL_SETS.map((s) => ({ reels: s.reels, free: false })),
    { reels: FREE_REELS, free: true },
    { reels: SLOTOPOL_FREE_REELS, free: true },
  ];
  for (let t = 0; t < trials; t++) {
    const { reels, free } = pools[t % pools.length];
    const grid: Grid = [];
    for (let x = 0; x < REELS; x++) {
      const reel = reels[x];
      const stop = (Math.random() * reel.length) | 0;
      const col: SymbolId[] = [];
      m[x] = 0;
      for (let y = 0; y < ROWS; y++) {
        const sym = reel[(stop + y) % reel.length];
        col.push(sym);
        const id = SYMBOL_ORDER.indexOf(sym) + 1;
        g[x * ROWS + y] = id;
        m[x] |= 1 << id;
      }
      grid.push(col);
    }
    let sc = 0;
    for (let i = 0; i < REELS * ROWS; i++) if (g[i] === WSC) sc++;
    const want = evaluate(grid, free);
    const got = free ? wayUnits(m) + SCATP[sc] : baseUnits(g) / LINES + SCATP[sc];
    if (Math.abs(want.totalWin - got) > 1e-9) {
      throw new Error(`scorer disagrees (${free ? 'free' : 'base'}): engine ${want.totalWin} vs fast ${got} on ${JSON.stringify(grid)}`);
    }
    if (want.freeSpinsWon !== SCATFS[sc]) throw new Error(`free spins disagree on ${JSON.stringify(grid)}`);
  }
  console.log(`fast scorers agree with the shipped evaluate() on ${trials} random grids, base and free.\n`);
}

interface Brute {
  n: number;
  /** spin pay (lines/ways plus scatter), total bets, summed exactly */
  sum: number;
  /** of which the scatter pays */
  scat: number;
  fs: number;
  triggers: number;
  hits: number;
  /** biggest single spin, total bets */
  max: number;
  maxStops: number[];
  /** E[w], E[w^2], E[w * trigger] in total bets */
  m1: number;
  m2: number;
  mT: number;
  /** slotopol-free mode only: the verbatim ScanWaysBon sum and how many grids it underpays */
  verbatim?: number;
  underpaid?: number;
}

type Mode = 'base' | 'free' | 'slotopol';

/** Every stop combination of one reel set. */
function bruteForce(reels: SymbolId[][], mode: Mode, label: string): Brute {
  const L = reels.map((r) => r.length);
  const strips = reels.map(ids);
  const win = strips.map((s) => {
    const w = new Int8Array(s.length * ROWS);
    for (let stop = 0; stop < s.length; stop++) for (let y = 0; y < ROWS; y++) w[stop * ROWS + y] = s[(stop + y) % s.length];
    return w;
  });
  const mask = strips.map((s) => {
    const out = new Int32Array(s.length);
    for (let stop = 0; stop < s.length; stop++) for (let y = 0; y < ROWS; y++) out[stop] |= 1 << s[(stop + y) % s.length];
    return out;
  });
  const discs = strips.map((s) => {
    const out = new Int8Array(s.length);
    for (let stop = 0; stop < s.length; stop++) for (let y = 0; y < ROWS; y++) if (s[(stop + y) % s.length] === WSC) out[stop]++;
    return out;
  });
  const n = L.reduce((a, b) => a * b, 1);
  const g = new Int8Array(REELS * ROWS);
  const m = new Int32Array(REELS);
  // Base works in line-bet units (integers), free in total-bet units (integers).
  const unit = mode === 'base' ? LINES : 1;
  let sum = 0;
  let scat = 0;
  let sq = 0n;
  let sumT = 0;
  let fs = 0;
  let triggers = 0;
  let hits = 0;
  let max = 0;
  let maxStops: number[] = [];
  let verbatim = 0;
  let underpaid = 0;
  const t0 = Date.now();

  for (let a = 0; a < L[0]; a++) {
    for (let y = 0; y < ROWS; y++) g[y] = win[0][a * ROWS + y];
    m[0] = mask[0][a];
    let part = 0; // squares for this reel-1 stop, then into the BigInt
    for (let b = 0; b < L[1]; b++) {
      for (let y = 0; y < ROWS; y++) g[ROWS + y] = win[1][b * ROWS + y];
      m[1] = mask[1][b];
      for (let c = 0; c < L[2]; c++) {
        for (let y = 0; y < ROWS; y++) g[2 * ROWS + y] = win[2][c * ROWS + y];
        m[2] = mask[2][c];
        for (let d = 0; d < L[3]; d++) {
          for (let y = 0; y < ROWS; y++) g[3 * ROWS + y] = win[3][d * ROWS + y];
          m[3] = mask[3][d];
          const sc4 = discs[0][a] + discs[1][b] + discs[2][c] + discs[3][d];
          for (let e = 0; e < L[4]; e++) {
            m[4] = mask[4][e];
            const sc = sc4 + discs[4][e];
            let w: number;
            if (mode === 'base') {
              for (let y = 0; y < ROWS; y++) g[4 * ROWS + y] = win[4][e * ROWS + y];
              w = baseUnits(g) + LINES * SCATP[sc];
            } else {
              w = wayUnits(m) + SCATP[sc];
              if (mode === 'slotopol') {
                for (let y = 0; y < ROWS; y++) g[4 * ROWS + y] = win[4][e * ROWS + y];
                const v = slotopolWays(g);
                verbatim += v + SCATP[sc];
                if (v + SCATP[sc] < w) underpaid++;
              }
            }
            scat += SCATP[sc];
            if (w > 0) {
              sum += w;
              part += w * w;
              hits++;
              if (w > max) {
                max = w;
                maxStops = [a, b, c, d, e];
              }
            }
            const f = SCATFS[sc];
            if (f > 0) {
              fs += f;
              triggers++;
              sumT += w;
            }
          }
        }
      }
    }
    sq += BigInt(part);
  }
  const r: Brute = {
    n,
    sum: sum / unit,
    scat,
    fs,
    triggers,
    hits,
    max: max / unit,
    maxStops,
    m1: sum / unit / n,
    m2: Number(sq) / (unit * unit) / n,
    mT: sumT / unit / n,
  };
  if (mode === 'slotopol') {
    r.verbatim = verbatim;
    r.underpaid = underpaid;
  }
  console.log(
    `${label}: ${n} grids in ${((Date.now() - t0) / 1000).toFixed(1)}s\n` +
      `  spin RTP ${pct(r.m1)}% (scatter ${pct(scat / n)}%), free spins ${fs}, q = ${(fs / n).toFixed(6)}, ` +
      `free games 1 in ${(n / triggers).toFixed(3)}, hit rate ${((hits / n) * 100).toFixed(4)}% (1 in ${(n / hits).toFixed(3)})\n` +
      `  biggest single spin ${r.max}x total bet at stops [${maxStops.join(', ')}]`,
  );
  return r;
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
function roundMoments(base: Brute, free: Brute) {
  const A = FREE_SPINS_AWARD;
  const pTb = free.triggers / free.n;
  const pTr = base.triggers / base.n;
  const eK = A * pTb;
  const muT = free.m1 / (1 - eK);
  const eT2 = (free.m2 + 2 * A * free.mT * muT + A * (A - 1) * pTb * muT * muT) / (1 - eK);
  const varT = eT2 - muT * muT;
  const eS = A * muT;
  const varS = A * varT;
  const eR = base.m1 + pTr * eS;
  const eR2 = base.m2 + 2 * base.mT * eS + pTr * (varS + eS * eS);
  return { mean: eR, sd: Math.sqrt(eR2 - eR * eR), eS, sdS: Math.sqrt(varS), spins: A / (1 - eK) };
}

console.log('=== phase 2: brute force over every stop combination ===\n');
proveScorers(3_000_000);

const sB = bruteForce(SLOTOPOL_FREE_REELS, 'slotopol', "slotopol's free strips (sims only), best way paid");
const sVerb = sB.verbatim! / sB.n;
const sVerbF = sVerb / (1 - sB.fs / sB.n);
console.log(`  slotopol's ScanWaysBon ported verbatim: ${pct(sVerb)}% per free spin, ${pct(sVerbF)}% per free game awarded`);
console.log(`  ${hold("slotopol's printed symbols", pct(sVerb), PB.sym.toFixed(6))}; ` +
  `${hold("printed free-games RTP", pct(sVerbF), PB.rtp.toFixed(6))}; ${hold('free spins', sB.fs, PB.fs)}`);
console.log(`  the verbatim scan underpays ${sB.underpaid} of ${sB.n} free spins (1 in ${(sB.n / sB.underpaid!).toFixed(2)}); ` +
  `best way paid: ${pct(sB.m1)}% (phase 1 ${pct(sWays + sScat.pay)}%)`);
if (Math.abs(sB.m1 - (sWays + sScat.pay)) > 1e-12) {
  bad++;
  console.log('  MISMATCH phase 1 vs phase 2 on slotopol strips, best way');
}
console.log('');

const fB = bruteForce(FREE_REELS, 'free', 'OUR free strips');
const fq = fB.fs / fB.n;
const rtpFsB = fB.m1 / (1 - fq);
console.log(`  ${pct(rtpFsB)}% per free game awarded (phase 1 ${pct(rtpFs)}%), retrigger 1 in ${(fB.n / fB.triggers).toFixed(3)} free spins`);
if (Math.abs(rtpFsB - rtpFs) > 1e-12 || Math.abs(fq - fScat.q) > 1e-15) {
  bad++;
  console.log('  MISMATCH phase 1 vs phase 2 on our free strips');
}
console.log('');

let active: Brute | null = null;
for (const set of REEL_SETS) {
  const isActive = set === ACTIVE_REELS;
  const r = bruteForce(set.reels, 'base', `set ${set.rtp.toFixed(6)}${isActive ? ' (ACTIVE, original)' : ''}`);
  if (isActive) active = r;
  const printed = printedSets.get(set.rtp.toFixed(6))!;
  const q = r.fs / r.n;
  console.log(`  ${hold('symbols', pct(r.m1), printed.sym.toFixed(6))}; ${hold('free spins', r.fs, printed.fs)}; ` +
    `${hold('slotopol label (verbatim free games)', pct(r.m1 + q * sVerbF), set.rtp.toFixed(6))}`);
  console.log(`  with OUR free games: ${pct(r.m1 + q * rtpFsB)}%\n`);
}

const m = roundMoments(active!, fB);
const activeRtp2 = active!.m1 + (active!.fs / active!.n) * rtpFsB;
console.log(
  `ACTIVE set ${ACTIVE_REELS.rtp.toFixed(6)} with OUR free games, exact per round:\n` +
    `  RTP ${pct(activeRtp2)}%  (base ${pct(active!.m1)}% + free games ${pct(activeRtp2 - active!.m1)}%), ` +
    `phase 1 ${pct(activeRtp1)}%, ${hold('GAME_RTP', pct(activeRtp2), GAME_RTP.toFixed(6))}\n` +
    `  mean by moments ${pct(m.mean)}%, standard deviation ${m.sd.toFixed(4)} total bets per round\n` +
    `  free games: 1 in ${(active!.n / active!.triggers).toFixed(3)} rounds, ${m.spins.toFixed(4)} spins per session, ` +
    `${(m.eS * 100).toFixed(4)}% of the bet per session (SD ${m.sdS.toFixed(3)} bets)\n` +
    `  base hit rate ${((active!.hits / active!.n) * 100).toFixed(4)}%, free spin hit rate ${((fB.hits / fB.n) * 100).toFixed(4)}%\n` +
    `  biggest single base spin ${active!.max}x, biggest single free spin ${fB.max}x`,
);
if (Math.abs(activeRtp2 - activeRtp1) > 1e-12 || Math.abs(m.mean - activeRtp2) > 1e-12) {
  bad++;
  console.log('  MISMATCH between phase 1, phase 2 and the moments');
}
console.log(bad === 0 ? '\nALL CHECKS PASS.' : `\n${bad} CHECK(S) FAILED.`);
process.exit(bad === 0 ? 0 : 1);
