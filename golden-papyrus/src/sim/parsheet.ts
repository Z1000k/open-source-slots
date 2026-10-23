/**
 * EXACT RTP the analytic way (instant): because every line cell comes from a
 * different reel and each reel stop is uniform, the expected line pay is a sum
 * over all 10^5 per-reel symbol choices weighted by strip counts — exact, not
 * sampled. Scatter, free-spin and expanding-symbol counts convolve per-reel
 * window counts the same way. Must agree with src/sim/exact.ts and slotopol's
 * published figures to 6 decimals.
 */
import { REEL_SETS, BONUS_REELS } from '../engine/config/reelSets';
import { SYMBOL_ORDER, ROWS, type SymbolId } from '../engine/types';
import { LINE_PAY, SCAT_PAY } from '../engine/config/paytable';

const WILD = 10;
// payN[sym 1..9][count 1..5] in per-line-bet units
const payN: number[][] = [[]];
for (let s = 1; s <= 9; s++) payN.push([0, ...LINE_PAY[SYMBOL_ORDER[s - 1] as never]] as number[]);

const toNum = (reels: SymbolId[][]) => reels.map((r) => r.map((s) => SYMBOL_ORDER.indexOf(s) + 1));

/** counts[sym 1..10] of a strip */
function stripCounts(reel: number[]): number[] {
  const c = new Array(11).fill(0);
  for (const s of reel) c[s]++;
  return c;
}

/** distribution over stops of how many cells of `sym` the 3-row window shows */
function windowCountDist(reel: number[], sym: number): number[] {
  const d = new Array(ROWS + 1).fill(0);
  for (let stop = 0; stop < reel.length; stop++) {
    let k = 0;
    for (let y = 0; y < ROWS; y++) if (reel[(stop + y) % reel.length] === sym) k++;
    d[k]++;
  }
  return d;
}

/** convolve per-reel window-count distributions into a grid-count distribution */
function gridCountDist(reels: number[][], sym: number): number[] {
  let acc = [1];
  for (const reel of reels) {
    const d = windowCountDist(reel, sym);
    const next = new Array(acc.length + d.length - 1).fill(0);
    for (let i = 0; i < acc.length; i++) {
      for (let j = 0; j < d.length; j++) next[i + j] += acc[i] * d[j];
    }
    acc = next;
  }
  return acc; // acc[k] = number of stop combinations showing k cells of sym
}

/**
 * Expected per-line pay (per-line-bet units) by enumerating the 10^5 symbol
 * assignments of one line, weighted by strip counts. Implements slotopol's
 * ScanLined exactly; es > 0 applies the free-games expanding-symbol rule.
 */
function expectedLinePay(counts: number[][], es: number): number {
  let sum = 0;
  for (let s0 = 1; s0 <= 10; s0++) {
    const w0 = counts[0][s0];
    if (!w0) continue;
    for (let s1 = 1; s1 <= 10; s1++) {
      const w1 = w0 * counts[1][s1];
      if (!w1) continue;
      for (let s2 = 1; s2 <= 10; s2++) {
        const w2 = w1 * counts[2][s2];
        if (!w2) continue;
        for (let s3 = 1; s3 <= 10; s3++) {
          const w3 = w2 * counts[3][s3];
          if (!w3) continue;
          for (let s4 = 1; s4 <= 10; s4++) {
            const w = w3 * counts[4][s4];
            if (!w) continue;
            const line = [s0, s1, s2, s3, s4];
            let syml = 0;
            let lw = false;
            let count = 5;
            let dead = false;
            for (let x = 0; x < 5; x++) {
              const s = line[x];
              if (s === WILD) {
                if (!syml) lw = true;
              } else if (!syml) {
                if (s === es && !lw) {
                  dead = true;
                  break;
                }
                syml = s;
              } else if (s !== syml) {
                count = x;
                break;
              }
            }
            if (!dead && syml && count >= 2) sum += payN[syml][count] * w;
          }
        }
      }
    }
  }
  return sum;
}

interface SymStat {
  lined: number; // % of total bet
  scat: number; // % of total bet
  esc: number; // % of total bet (expanding collect)
  sym: number; // lined + scat + esc
  q: number; // expected free spins per spin
}

function analyze(reelsSym: SymbolId[][], es: number): SymStat {
  const reels = toNum(reelsSym);
  const total = reels.reduce((a, r) => a * r.length, 1);
  const counts = reels.map(stripCounts);

  const linePay = expectedLinePay(counts, es); // sum of pay*weight over one line
  // 10 identical-marginal lines, each paying payl/LINES of the total bet.
  const lined = (100 * linePay) / total;

  const bookDist = gridCountDist(reels, WILD);
  let scat = 0;
  let fs = 0;
  for (let k = 3; k < bookDist.length; k++) {
    scat += bookDist[k] * SCAT_PAY[Math.min(k, 5) - 1];
    fs += bookDist[k] * 10;
  }
  scat = (100 * scat) / total;

  let esc = 0;
  if (es > 0) {
    const dist = gridCountDist(reels, es);
    for (let k = 2; k < dist.length; k++) {
      if (dist[k] === 0) continue;
      // The bonus strip never shows more than 5 of one symbol at once (the pay
      // table has no higher tier, and slotopol would crash if it happened).
      if (k > 5) throw new Error(`expanding symbol count ${k} > 5 on the bonus strip`);
      esc += dist[k] * payN[es][k];
    }
    esc = (100 * esc) / total;
  }

  return { lined, scat, esc, sym: lined + scat + esc, q: fs / total };
}

// ---- free games: per-expanding-symbol stats on the bonus strip ----
console.log('BONUS strip (free games), per expanding symbol:');
let sumSym = 0;
let qBon = 0;
for (let es = 1; es <= 9; es++) {
  const st = analyze(BONUS_REELS, es);
  qBon = st.q;
  sumSym += st.sym;
  const sq = 1 / (1 - st.q);
  console.log(
    `  ES ${SYMBOL_ORDER[es - 1].padEnd(8)} sym = ${st.sym.toFixed(6)}%  ` +
      `(lined ${st.lined.toFixed(4)} + scat ${st.scat.toFixed(4)} + collect ${st.esc.toFixed(4)}), ` +
      `RTP[es] = ${(sq * st.sym).toFixed(6)}%`,
  );
}
const sqBon = 1 / (1 - qBon);
const rtpFs = (sqBon * sumSym) / 9;
console.log(`  q(retrigger) = ${qBon.toFixed(6)}, sq = ${sqBon.toFixed(6)}`);
console.log(`  RTP(fg) = ${rtpFs.toFixed(6)}%   (slotopol: 779.285363%)`);

// ---- base sets ----
console.log('\nBASE reel sets:');
for (const set of REEL_SETS) {
  const st = analyze(set.reels, 0);
  const rtp = st.sym + st.q * rtpFs;
  const ok = Math.abs(rtp - set.rtp) < 5e-7 ? 'MATCH' : 'MISMATCH';
  console.log(
    `  target ${String(set.rtp).padEnd(10)} -> ${rtp.toFixed(6)}%  ${ok}  ` +
      `(sym ${st.sym.toFixed(6)} + q ${st.q.toFixed(6)} x fg ${rtpFs.toFixed(4)})`,
  );
}
