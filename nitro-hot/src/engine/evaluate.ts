import type { Grid, LineWin, SpinResult } from './types';
import { DOUBLING_FRUITS, LINES, REELS, ROWS } from './types';
import { PAYLINES } from './config/paylines';
import { LINE_PAY } from './config/paytable';

/**
 * Score a landed grid: 3-of-a-kind on the 5 fixed lines (no wilds, no
 * scatter), all line wins doubled when the whole screen is one doubling
 * fruit. Amounts in TOTAL-bet multiples. Port of slotopol's Scanner +
 * FillMult.
 */
export function evaluate(grid: Grid): SpinResult {
  // slotopol FillMult: 2 when all 9 cells show the same PLUM/ORANGE/LEMON/CHERRY
  const first = grid[0][0];
  let fillMult: 1 | 2 = 1;
  if (DOUBLING_FRUITS.includes(first)) {
    let filled = true;
    for (let x = 0; x < REELS && filled; x++) {
      for (let y = 0; y < ROWS && filled; y++) {
        if (grid[x][y] !== first) filled = false;
      }
    }
    if (filled) fillMult = 2;
  }

  const lineWins: LineWin[] = [];
  for (let li = 0; li < LINES; li++) {
    const line = PAYLINES[li];
    const sym = grid[0][line[0]];
    if (grid[1][line[1]] !== sym || grid[2][line[2]] !== sym) continue;
    const positions: [number, number][] = line.map((row, x) => [x, row]);
    lineWins.push({
      line: li,
      symbol: sym,
      count: REELS,
      amount: (LINE_PAY[sym] * fillMult) / LINES,
      positions,
    });
  }

  let totalWin = 0;
  for (const w of lineWins) totalWin += w.amount;

  return { grid, lineWins, fillMult, totalWin };
}
