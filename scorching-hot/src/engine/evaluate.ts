import type { Grid, LineWin, PaySymbol, ScatterWin, SpinResult } from './types';
import { LINES, REELS, ROWS } from './types';
import { PAYLINES } from './config/paylines';
import { LINE_PAY, SCAT_PAY } from './config/paytable';

/**
 * Score a landed grid: leftmost runs on the 5 fixed lines (no wilds), plus
 * the STAR scatter counted anywhere. Amounts in TOTAL-bet multiples.
 * Port of slotopol's ScanLined + ScanScatters.
 */
export function evaluate(grid: Grid): SpinResult {
  const lineWins: LineWin[] = [];

  for (let li = 0; li < LINES; li++) {
    const line = PAYLINES[li];
    const first = grid[0][line[0]];
    let count = REELS;
    for (let x = 1; x < REELS; x++) {
      if (grid[x][line[x]] !== first) {
        count = x;
        break;
      }
    }
    if (first === 'STAR') continue; // scatter never pays on a line
    const pay = LINE_PAY[first as PaySymbol][count - 1];
    if (pay > 0) {
      const positions: [number, number][] = [];
      for (let x = 0; x < count; x++) positions.push([x, line[x]]);
      lineWins.push({ line: li, symbol: first as PaySymbol, count, amount: pay / LINES, positions });
    }
  }

  const stars: [number, number][] = [];
  for (let x = 0; x < REELS; x++) {
    for (let y = 0; y < ROWS; y++) {
      if (grid[x][y] === 'STAR') stars.push([x, y]);
    }
  }
  let scatterWin: ScatterWin | undefined;
  if (stars.length >= 3) {
    scatterWin = { count: stars.length, amount: SCAT_PAY[stars.length - 1], positions: stars };
  }

  let totalWin = scatterWin?.amount ?? 0;
  for (const w of lineWins) totalWin += w.amount;

  return { grid, lineWins, scatterWin, totalWin };
}
