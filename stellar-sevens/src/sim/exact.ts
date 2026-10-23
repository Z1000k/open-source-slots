/**
 * EXACT RTP by full enumeration: walk every combination of reel stops (41^3 to
 * 51^3 = 68,921 to 132,651 for these 3-reel strips), score each grid with the
 * real evaluate(), and sum. No randomness involved, so the result must match
 * slotopol's published figure to the printed precision - that proves the port
 * is 1:1.
 */
import { REEL_SETS, ACTIVE_REELS } from '../engine/config/reelSets';
import { evaluate } from '../engine/evaluate';
import { ROWS, type Grid, type SymbolId } from '../engine/types';

function windows(reel: SymbolId[]): SymbolId[][] {
  return reel.map((_, stop) =>
    Array.from({ length: ROWS }, (_, y) => reel[(stop + y) % reel.length]),
  );
}

let mismatches = 0;

for (const set of REEL_SETS) {
  const [w0, w1, w2] = set.reels.map(windows);
  const n = set.reels.map((r) => r.length);
  const total = n.reduce((a, b) => a * b, 1);

  let won = 0;
  let hits = 0;
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
        if (r.totalWin > best) best = r.totalWin;
        won += r.totalWin;
      }
    }
  }

  const exact = (won / total) * 100;
  const ok = exact.toFixed(6) === set.rtp.toFixed(6);
  if (!ok) mismatches++;
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} target ${set.rtp.toFixed(6)}%  ->  exact ${exact.toFixed(6)}%  ` +
      `hit rate ${((hits / total) * 100).toFixed(3)}%, best win ${best}x, reshuffles ${total}` +
      (set === ACTIVE_REELS ? '   <- ACTIVE' : ''),
  );
}

console.log(
  mismatches === 0
    ? `\nAll ${REEL_SETS.length} reel sets match slotopol to 6 decimals.`
    : `\n${mismatches} of ${REEL_SETS.length} reel sets DO NOT match.`,
);
process.exit(mismatches === 0 ? 0 : 1);
