import type { Grid, LineWin, SpinResult } from './types';
import { LINES, REELS } from './types';
import { PAYLINES } from './config/paylines';
import { LINE_PAY } from './config/paytable';

/**
 * Score a landed grid: 3-of-a-kind on the 5 fixed lines, no wilds, no scatter
 * and no multiplier. Amounts in TOTAL-bet multiples. Port of slotopol's
 * alwayshot Scanner.
 */
export function evaluate(grid: Grid): SpinResult {
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
      amount: LINE_PAY[sym] / LINES,
      positions,
    });
  }

  let totalWin = 0;
  for (const w of lineWins) totalWin += w.amount;

  return { grid, lineWins, totalWin };
}
