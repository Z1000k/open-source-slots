/**
 * EXACT RTP by full enumeration: walk every combination of reel stops (only
 * 37^3 to 45^3 = 50,653 to 91,125 for these 3-reel strips), score each grid
 * with the real evaluate(), and sum. No randomness involved, so the result
 * must match slotopol's published figure to the printed precision — this
 * proves the port is 1:1.
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
  const [w0, w1, w2] = set.reels.map(windows);
  const n = set.reels.map((r) => r.length);
  const total = n.reduce((a, b) => a * b, 1);

  let won = 0;
  let hits = 0;
  let doubled = 0;
  let best = 0;
  const grid: Grid = new Array(3);

  for (let a = 0; a < n[0]; a++) {
    grid[0] = w0[a];
    for (let b = 0; b < n[1]; b++) {
      grid[1] = w1[b];
      for (let c = 0; c < n[2]; c++) {
        grid[2] = w2[c];
        const r = evaluate(grid);
        if (r.totalWin > 0) hits++;
        if (r.fillMult === 2) doubled++;
        if (r.totalWin > best) best = r.totalWin;
        won += r.totalWin;
      }
    }
  }

  console.log(
    `target ${set.rtp}%  ->  exact RTP = ${((won / total) * 100).toFixed(6)}%  ` +
      `hit rate ${((hits / total) * 100).toFixed(3)}%, full screens ${doubled}, ` +
      `best win ${best}x, reshuffles ${total}`,
  );
}
