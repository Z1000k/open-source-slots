/**
 * EXACT verification of the symbol maths, by full enumeration.
 *
 * Every reel stop combination is deterministic all the way through the
 * avalanche: once the five reels stop, the whole chain that follows is fixed.
 * So walking all 36^5 (or 39^5) stops and averaging gives the symbol RTP with
 * no sampling error at all, which is exactly how slotopol produced the par
 * sheet comments in cashfarm_data.yaml. We reproduce those numbers here:
 *
 *   symbols % (lined + scatter, cascades included)
 *   farm bonus hit rate (base spins per bonus)
 *   mean cascade length, longest chain
 *   total RTP = symbols % + 50 x bonus hit frequency
 *
 * The bonus itself is not enumerated (it is priced at Ebon = 50, measured
 * separately by npm run sim:bonus).
 *
 * Run: npm run sim:exact           all 12 reel sets
 *      npm run sim:exact 95.548865 one set
 */
import { RAW_REEL_SETS } from '../engine/config/reelSets';
import { PAYLINES } from '../engine/config/paylines';
import { LINE_PAY, SCAT_PAY } from '../engine/config/paytable';
import { SYMBOL_ORDER, LINES, REELS, ROWS, FALL_LIMIT } from '../engine/types';
import type { PaySymbol } from '../engine/types';

const WILD_ID = 1;
const SCAT_ID = 13;
const SYM_COUNT = 13;
/** slotopol prices every bonus at 50x total bet; see npm run sim:bonus. */
const EBON = 50;

/** linePay[sym][count] in TOTAL-bet multiples, 1-based sym and count. */
const linePay = new Float64Array((SYM_COUNT + 1) * (REELS + 1));
for (let s = 1; s <= SYM_COUNT; s++) {
  const name = SYMBOL_ORDER[s - 1];
  if (name === 'TRACTOR') continue;
  const row = LINE_PAY[name as PaySymbol];
  for (let c = 1; c <= REELS; c++) linePay[s * (REELS + 1) + c] = row[c - 1] / LINES;
}
const scatPay = new Float64Array(REELS + 1);
for (let c = 1; c <= REELS; c++) scatPay[c] = SCAT_PAY[c - 1];

/** lines[li * REELS + x] = row used by line li on reel x. */
const lines = new Int32Array(LINES * REELS);
for (let li = 0; li < LINES; li++) {
  for (let x = 0; x < REELS; x++) lines[li * REELS + x] = PAYLINES[li][x];
}

/** Working state, allocated once: grid[x * ROWS + y]. */
const grid = new Int32Array(REELS * ROWS);
const hits = new Uint8Array(REELS * ROWS);
const seed = new Int32Array(REELS);

interface SetStats {
  spins: number;
  win: number;
  /** pays from the base grid only, slotopol's Casc[0] */
  baseWin: number;
  linedWin: number;
  scatterWin: number;
  bonuses: number;
  /**
   * chain[k] = grids scanned at fall level k, the terminal non-paying scan
   * included, which is exactly slotopol's Casc[k].N. chain[0] is every stop,
   * chain[1] is every paying base spin.
   */
  chain: Float64Array;
  maxWin: number;
}

/** Scores the current grid, marks winning cells in `hits`, returns the pay. */
function scan(stats: SetStats): { win: number; cells: number } {
  hits.fill(0);
  let win = 0;
  let lined = 0;
  let cells = 0;

  for (let li = 0; li < LINES; li++) {
    const base = li * REELS;
    let wilds = 0;
    let syml = 0;
    let count = REELS;
    for (let x = 0; x < REELS; x++) {
      const s = grid[x * ROWS + lines[base + x]];
      if (s === WILD_ID) {
        if (syml === 0) wilds = x + 1;
      } else if (syml === 0) {
        syml = s;
      } else if (s !== syml) {
        count = x;
        break;
      }
    }

    const payWild = wilds >= 3 ? linePay[WILD_ID * (REELS + 1) + wilds] : 0;
    const paySym = count >= 3 && syml > 0 ? linePay[syml * (REELS + 1) + count] : 0;

    let n = 0;
    let pay = 0;
    if (paySym > payWild) {
      n = count;
      pay = paySym;
    } else if (payWild > 0) {
      n = wilds;
      pay = payWild;
    }
    if (pay > 0) {
      win += pay;
      lined += pay;
      for (let x = 0; x < n; x++) {
        const i = x * ROWS + lines[base + x];
        if (!hits[i]) {
          hits[i] = 1;
          cells++;
        }
      }
    }
  }

  let scatters = 0;
  for (let i = 0; i < REELS * ROWS; i++) if (grid[i] === SCAT_ID) scatters++;
  if (scatters >= 3) {
    const pay = scatPay[scatters];
    win += pay;
    stats.scatterWin += pay;
    stats.bonuses++;
    for (let i = 0; i < REELS * ROWS; i++) {
      if (grid[i] === SCAT_ID && !hits[i]) {
        hits[i] = 1;
        cells++;
      }
    }
  }

  stats.linedWin += lined;
  return { win, cells };
}

/** Clears the marked cells and drops the columns (slotopol PushFall). */
function pushFall(reels: number[][]): void {
  for (let x = 0; x < REELS; x++) {
    const off = x * ROWS;
    let n = 0;
    for (let y = 0; y < ROWS; y++) {
      if (!hits[off + y]) continue;
      for (let i = 0; i < y; i++) grid[off + y - i] = grid[off + y - i - 1];
      n++;
    }
    if (n === 0) continue;
    seed[x] -= n;
    const reel = reels[x];
    const len = reel.length;
    for (let y = 0; y < n; y++) {
      const p = seed[x] + y;
      grid[off + y] = reel[((p % len) + len) % len];
    }
  }
}

function enumerateSet(reels: number[][]): SetStats {
  const stats: SetStats = {
    spins: 0,
    win: 0,
    baseWin: 0,
    linedWin: 0,
    scatterWin: 0,
    bonuses: 0,
    chain: new Float64Array(FALL_LIMIT + 2),
    maxWin: 0,
  };
  const len = reels.map((r) => r.length);

  for (let p0 = 0; p0 < len[0]; p0++) {
    for (let p1 = 0; p1 < len[1]; p1++) {
      for (let p2 = 0; p2 < len[2]; p2++) {
        for (let p3 = 0; p3 < len[3]; p3++) {
          for (let p4 = 0; p4 < len[4]; p4++) {
            const start = [p0, p1, p2, p3, p4];
            for (let x = 0; x < REELS; x++) {
              const reel = reels[x];
              const n = reel.length;
              seed[x] = start[x];
              for (let y = 0; y < ROWS; y++) grid[x * ROWS + y] = reel[(start[x] + y) % n];
            }

            stats.spins++;
            let roundWin = 0;
            // Every scan performed is counted, the final non-paying one too,
            // which is what slotopol's Casc[cfn].N counts.
            for (let fall = 0; fall < FALL_LIMIT; fall++) {
              const r = scan(stats);
              stats.chain[fall]++;
              roundWin += r.win;
              if (fall === 0) stats.baseWin += r.win;
              if (r.cells === 0) break;
              pushFall(reels);
            }
            stats.win += roundWin;
            if (roundWin > stats.maxWin) stats.maxWin = roundWin;
          }
        }
      }
    }
  }
  return stats;
}

function pct(v: number): string {
  return (v * 100).toFixed(6) + '%';
}

const only = process.argv[2] ? Number(process.argv[2]) : null;
const targets = only ? RAW_REEL_SETS.filter((s) => s.rtp === only) : RAW_REEL_SETS;
if (targets.length === 0) throw new Error(`no reel set with rtp ${only}`);

let allMatch = true;
for (const set of targets) {
  const t0 = Date.now();
  const st = enumerateSet(set.reels);
  const symRtp = st.win / st.spins;
  const linedRtp = st.linedWin / st.spins;
  const scatRtp = st.scatterWin / st.spins;
  const hitRate = st.spins / st.bonuses;
  const farmRtp = (EBON * st.bonuses) / st.spins;
  const total = symRtp + farmRtp;
  // slotopol's Mcascade: all pays divided by the pays of the base grid alone.
  const mcascade = st.win / st.baseWin;
  let ncascmax = 0;
  while (st.chain[ncascmax] > 0) ncascmax++;

  const p = set.parsheet;
  const ok = (a: number, b: number, eps: number) => Math.abs(a - b) < eps;
  /** slotopol prints these to 5 significant figures, so compare like for like. */
  const ok5 = (a: number, b: number) => Number(a.toPrecision(5)) === b;
  const symOk = ok(symRtp * 100, p.symRtp, 5e-6);
  const hitOk = ok5(hitRate, p.farmHitRate);
  const farmOk = ok(farmRtp * 100, p.farmRtp, 5e-6);
  const totalOk = ok(total * 100, set.rtp, 5e-6);
  const cascOk = ok5(mcascade, p.mcascade ?? 0);
  const maxOk = ncascmax === p.ncascmax;
  const chainOk = p.chain.every((n, i) => st.chain[i + 1] === n);
  if (!(symOk && hitOk && farmOk && totalOk && cascOk && maxOk && chainOk)) allMatch = false;

  console.log(`--- reel set ${set.rtp.toFixed(6)}  (lengths ${set.reels.map((r) => r.length).join(', ')})`);
  console.log(`  stops enumerated  ${st.spins.toLocaleString()}`);
  console.log(`  symbols           ${pct(linedRtp)} lined + ${pct(scatRtp)} scatter = ${pct(symRtp)}`);
  console.log(`    slotopol says   ${p.symRtp.toFixed(6)}%   ${symOk ? 'MATCH' : 'MISMATCH'}`);
  console.log(`  bonus hit rate    1/${hitRate.toFixed(5)}`);
  console.log(`    slotopol says   1/${p.farmHitRate.toFixed(5)}   ${hitOk ? 'MATCH' : 'MISMATCH'}`);
  console.log(`  bonus RTP         ${pct(farmRtp)}`);
  console.log(`    slotopol says   ${p.farmRtp.toFixed(6)}%   ${farmOk ? 'MATCH' : 'MISMATCH'}`);
  console.log(`  TOTAL RTP         ${pct(total)}`);
  console.log(`    slotopol says   ${set.rtp.toFixed(6)}%   ${totalOk ? 'MATCH' : 'MISMATCH'}`);
  console.log(`  cascade counters  N[2..5] ${p.chain.map((_, i) => st.chain[i + 1]).join(', ')}`);
  console.log(`    slotopol says   N[2..5] ${p.chain.join(', ')}   ${chainOk ? 'MATCH' : 'MISMATCH'}`);
  console.log(`  Mcascade          ${mcascade.toPrecision(5)}  (slotopol ${p.mcascade})   ${cascOk ? 'MATCH' : 'MISMATCH'}`);
  console.log(`  Ncascmax          ${ncascmax}  (slotopol ${p.ncascmax})   ${maxOk ? 'MATCH' : 'MISMATCH'}`);
  console.log(`  base hit rate     1/${(st.spins / st.chain[1]).toFixed(3)} spins pay something`);
  console.log(`  biggest symbol win ${st.maxWin.toFixed(2)}x total bet`);
  console.log(`  took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

console.log('');
console.log(allMatch ? 'ALL SETS MATCH slotopol' : 'MISMATCH, see above');
process.exit(allMatch ? 0 : 1);
