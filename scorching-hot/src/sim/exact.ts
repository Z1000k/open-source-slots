/**
 * EXACT RTP by full enumeration: walk every combination of reel stops (25^5 =
 * 9,765,625 for the 25-strips; 39^5 = 90,224,199 for the 39-strips), score
 * each grid with the real evaluate(), and sum. No randomness involved, so the
 * result must match slotopol's published figure to the printed precision —
 * this proves the port is 1:1.
 */
import { REEL_SETS } from '../engine/config/reelSets';
import { evaluate } from '../engine/evaluate';
import { ROWS, type Grid, type SymbolId } from '../engine/types';

function windows(reel: SymbolId[]): SymbolId[][] {
  return reel.map((_, stop) =>
    Array.from({ length: ROWS }, (_, y) => reel[(stop + y) % reel.length]),
  );
}

for (const set of REEL_SETS) {
  const [w0, w1, w2, w3, w4] = set.reels.map(windows);
  const n = set.reels.map((r) => r.length);
  const total = n.reduce((a, b) => a * b, 1);

  let lined = 0;
  let scattered = 0;
  let hits = 0;
  const grid: Grid = new Array(5);

  for (let a = 0; a < n[0]; a++) {
    grid[0] = w0[a];
    for (let b = 0; b < n[1]; b++) {
      grid[1] = w1[b];
      for (let c = 0; c < n[2]; c++) {
        grid[2] = w2[c];
        for (let d = 0; d < n[3]; d++) {
          grid[3] = w3[d];
          for (let e = 0; e < n[4]; e++) {
            grid[4] = w4[e];
            const r = evaluate(grid);
            if (r.totalWin > 0) hits++;
            scattered += r.scatterWin?.amount ?? 0;
            lined += r.totalWin - (r.scatterWin?.amount ?? 0);
          }
        }
      }
    }
  }

  const linedRtp = (lined / total) * 100;
  const scatRtp = (scattered / total) * 100;
  console.log(
    `target ${set.rtp}%  ->  exact RTP = ${(linedRtp + scatRtp).toFixed(6)}%  ` +
      `(lined ${linedRtp.toFixed(4)} + scatter ${scatRtp.toFixed(4)}), ` +
      `hit rate ${((hits / total) * 100).toFixed(3)}%, reshuffles ${total}`,
  );
}
