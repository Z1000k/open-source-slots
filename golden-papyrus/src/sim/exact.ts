/**
 * EXACT RTP by full enumeration — the gold verification: walk every
 * combination of reel stops (up to 269,100,000 per base set; 67,469,796 for
 * the bonus strip, scored for all nine expanding symbols in one pass), score
 * each grid with a numeric mirror of evaluate(), and sum. No randomness, so
 * the result must reproduce slotopol's published figures to 6 decimals.
 *
 * The numeric evaluator is proven equal to the real evaluate() first, on two
 * million engine-random grids, then trusted for the enumeration.
 */
import { REEL_SETS, BONUS_REELS, ACTIVE_REELS } from '../engine/config/reelSets';
import { SYMBOL_ORDER, LINES, ROWS, REELS, type SymbolId, type PaySymbol, type Grid } from '../engine/types';
import { PAYLINES } from '../engine/config/paylines';
import { LINE_PAY, SCAT_PAY } from '../engine/config/paytable';
import { evaluate } from '../engine/evaluate';
import { mulberry32 } from '../engine/rng';
import { spinGrid } from '../engine/spin';

const WILD = 10;
// payN[sym*6 + count] in per-line-bet units, sym 1..9, count 1..5
const payN = new Float64Array(66);
for (let s = 1; s <= 9; s++) {
  const row = LINE_PAY[SYMBOL_ORDER[s - 1] as PaySymbol];
  for (let c = 1; c <= 5; c++) payN[s * 6 + c] = row[c - 1];
}
const scatPay = new Float64Array(6);
for (let c = 3; c <= 5; c++) scatPay[c] = SCAT_PAY[c - 1];

const toNum = (reels: SymbolId[][]) => reels.map((r) => r.map((s) => SYMBOL_ORDER.indexOf(s) + 1));

interface ReelPre {
  n: number;
  /** win[stop*3 + y] = symbol in row y at this stop */
  win: Int32Array;
  /** books[stop] = PAPYRUS cells in the window */
  books: Int32Array;
  /** cnt[stop*10 + sym-1] = cells of sym in the window */
  cnt: Int32Array;
}

function precompute(reel: number[]): ReelPre {
  const n = reel.length;
  const win = new Int32Array(n * 3);
  const books = new Int32Array(n);
  const cnt = new Int32Array(n * 10);
  for (let stop = 0; stop < n; stop++) {
    for (let y = 0; y < ROWS; y++) {
      const s = reel[(stop + y) % n];
      win[stop * 3 + y] = s;
      cnt[stop * 10 + s - 1]++;
      if (s === WILD) books[stop]++;
    }
  }
  return { n, win, books, cnt };
}

/** rows[li*5 + x] = row of line li on reel x */
const rows = new Int32Array(LINES * REELS);
for (let li = 0; li < LINES; li++) {
  for (let x = 0; x < REELS; x++) rows[li * REELS + x] = PAYLINES[li][x];
}

// integer pay table for the packed scan: payI[sym*6+count]
const payI = new Int32Array(66);
for (let i = 0; i < 66; i++) payI[i] = payN[i];

/**
 * Numeric line scan (slotopol ScanLined, base-game form: no expanding-symbol
 * rule). Returns (pay << 7) | (syml << 3) | leadingWild packed in one small
 * integer so the hot loops stay allocation-free; pay in per-line-bet units.
 */
function scan(s0: number, s1: number, s2: number, s3: number, s4: number): number {
  let syml = 0;
  let lw = 0;
  let count = 5;
  // unrolled walk of the five cells
  if (s0 === WILD) lw = 1;
  else syml = s0;
  do {
    if (s1 !== WILD) {
      if (!syml) syml = s1;
      else if (s1 !== syml) {
        count = 1;
        break;
      }
    } else if (!syml) lw = 1;
    if (s2 !== WILD) {
      if (!syml) syml = s2;
      else if (s2 !== syml) {
        count = 2;
        break;
      }
    } else if (!syml) lw = 1;
    if (s3 !== WILD) {
      if (!syml) syml = s3;
      else if (s3 !== syml) {
        count = 3;
        break;
      }
    } else if (!syml) lw = 1;
    if (s4 !== WILD) {
      if (!syml) syml = s4;
      else if (s4 !== syml) {
        count = 4;
        break;
      }
    } else if (!syml) lw = 1;
  } while (false);
  const pay = syml && count >= 2 ? payI[syml * 6 + count] : 0;
  return (pay << 7) | (syml << 3) | lw;
}

// ---------- prove the numeric evaluator equals the real evaluate() ----------
// (base rule; the bonus adjustments are exercised through the composition
// figures matching slotopol, and by tests/engine.test.ts)
{
  const rng = mulberry32(0xb00c0f2a);
  for (let i = 0; i < 2_000_000; i++) {
    const grid: Grid = spinGrid(rng, ACTIVE_REELS.reels);
    const real = evaluate(grid, null);
    const g = grid.map((col) => col.map((s) => SYMBOL_ORDER.indexOf(s) + 1));
    let lined = 0;
    for (let li = 0; li < LINES; li++) {
      lined +=
        scan(
          g[0][rows[li * 5]],
          g[1][rows[li * 5 + 1]],
          g[2][rows[li * 5 + 2]],
          g[3][rows[li * 5 + 3]],
          g[4][rows[li * 5 + 4]],
        ) >> 7;
    }
    let books = 0;
    for (let x = 0; x < 5; x++) for (let y = 0; y < 3; y++) if (g[x][y] === WILD) books++;
    const total = lined / LINES + (books >= 3 ? scatPay[books] : 0);
    if (Math.abs(total - real.totalWin) > 1e-9) {
      throw new Error(`evaluator mismatch at grid ${i}: fast ${total} real ${real.totalWin}`);
    }
  }
  console.log('numeric evaluator == engine evaluate() on 2,000,000 random grids');
}

// ---------- bonus strip: one pass, buckets for all nine expanding symbols ----------
function enumBonus(): { symPct: number[]; q: number } {
  const pre = BONUS_REELS.map((r) => precompute(toNum([r])[0]));
  const [p0, p1, p2, p3, p4] = pre;
  const total = pre.reduce((a, p) => a * p.n, 1);

  let linedCommon = 0; // per-line-bet units, all lines, before the ES rule
  const linedExcl = new Float64Array(10); // pay lost when es == syml with no leading wild
  const collect = new Float64Array(10); // expanding-symbol grid collects, total-bet units
  let scat = 0;
  let fs = 0;
  const kPart = new Int32Array(9);

  const t0 = Date.now();
  for (let a = 0; a < p0.n; a++) {
    for (let b = 0; b < p1.n; b++) {
      for (let c = 0; c < p2.n; c++) {
        for (let d = 0; d < p3.n; d++) {
          const booksABCD = p0.books[a] + p1.books[b] + p2.books[c] + p3.books[d];
          for (let es = 0; es < 9; es++) {
            kPart[es] =
              p0.cnt[a * 10 + es] + p1.cnt[b * 10 + es] + p2.cnt[c * 10 + es] + p3.cnt[d * 10 + es];
          }
          for (let e = 0; e < p4.n; e++) {
            for (let li = 0; li < LINES; li++) {
              const v = scan(
                p0.win[a * 3 + rows[li * 5]],
                p1.win[b * 3 + rows[li * 5 + 1]],
                p2.win[c * 3 + rows[li * 5 + 2]],
                p3.win[d * 3 + rows[li * 5 + 3]],
                p4.win[e * 3 + rows[li * 5 + 4]],
              );
              const pay = v >> 7;
              if (pay > 0) {
                linedCommon += pay;
                if (!(v & 1)) linedExcl[(v >> 3) & 15] += pay;
              }
            }
            const books = booksABCD + p4.books[e];
            if (books >= 3) {
              scat += scatPay[books];
              fs += 10;
            }
            for (let es = 0; es < 9; es++) {
              const k = kPart[es] + p4.cnt[e * 10 + es];
              if (k >= 2) {
                if (k > 5) throw new Error(`expanding count ${k} > 5`);
                collect[es + 1] += payI[(es + 1) * 6 + k];
              }
            }
          }
        }
      }
    }
    console.log(`  bonus reel1 stop ${a + 1}/${p0.n}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }

  const symPct: number[] = [];
  for (let es = 1; es <= 9; es++) {
    symPct.push((100 * ((linedCommon - linedExcl[es]) / LINES + scat + collect[es])) / total);
  }
  return { symPct, q: fs / total };
}

// ---------- one base set: full enumeration ----------
function enumBase(reelsSym: SymbolId[][]): { sym: number; q: number } {
  const pre = toNum(reelsSym).map(precompute);
  const [p0, p1, p2, p3, p4] = pre;
  const total = pre.reduce((a, p) => a * p.n, 1);

  let lined = 0;
  let scat = 0;
  let fs = 0;

  for (let a = 0; a < p0.n; a++) {
    for (let b = 0; b < p1.n; b++) {
      for (let c = 0; c < p2.n; c++) {
        for (let d = 0; d < p3.n; d++) {
          const booksABCD = p0.books[a] + p1.books[b] + p2.books[c] + p3.books[d];
          for (let e = 0; e < p4.n; e++) {
            for (let li = 0; li < LINES; li++) {
              lined +=
                scan(
                  p0.win[a * 3 + rows[li * 5]],
                  p1.win[b * 3 + rows[li * 5 + 1]],
                  p2.win[c * 3 + rows[li * 5 + 2]],
                  p3.win[d * 3 + rows[li * 5 + 3]],
                  p4.win[e * 3 + rows[li * 5 + 4]],
                ) >> 7;
            }
            const books = booksABCD + p4.books[e];
            if (books >= 3) {
              scat += scatPay[books];
              fs += 10;
            }
          }
        }
      }
    }
  }

  return { sym: (100 * (lined / LINES + scat)) / total, q: fs / total };
}

// ---------- run everything and compose ----------
console.log('\nBONUS strip full enumeration (67,469,796 grids x 9 expanding symbols):');
const bonus = enumBonus();
const sqBon = 1 / (1 - bonus.q);
for (let es = 1; es <= 9; es++) {
  console.log(
    `  ES ${SYMBOL_ORDER[es - 1].padEnd(8)} sym = ${bonus.symPct[es - 1].toFixed(6)}%  ` +
      `RTP[es] = ${(sqBon * bonus.symPct[es - 1]).toFixed(6)}%`,
  );
}
const rtpFs = (sqBon * bonus.symPct.reduce((a, b) => a + b, 0)) / 9;
console.log(`  q(retrigger) = ${bonus.q.toFixed(6)}, sq = ${sqBon.toFixed(6)}`);
console.log(`  RTP(fg) = ${rtpFs.toFixed(6)}%   (slotopol: 779.285363%)`);

console.log('\nBASE reel sets, full enumeration:');
for (const set of REEL_SETS) {
  const t0 = Date.now();
  const st = enumBase(set.reels);
  const rtp = st.sym + st.q * rtpFs;
  const ok = Math.abs(rtp - set.rtp) < 5e-7 ? 'MATCH' : 'MISMATCH';
  console.log(
    `  target ${String(set.rtp).padEnd(10)} -> ${rtp.toFixed(6)}%  ${ok}  ` +
      `(sym ${st.sym.toFixed(6)} + q ${st.q.toFixed(6)} x fg) in ${((Date.now() - t0) / 1000).toFixed(0)}s`,
  );
}
console.log('\nDone.');
