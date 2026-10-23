import type { ExpandingWin, Grid, LineWin, PaySymbol, ScatterWin, SpinResult } from './types';
import { FREE_SPINS_AWARD, LINES, REELS, ROWS } from './types';
import { PAYLINES } from './config/paylines';
import { LINE_PAY, SCAT_PAY } from './config/paytable';

/**
 * Score a landed grid. Port of slotopol bookofra's ScanLined + ScanScatters.
 *
 * PAPYRUS is wild on the lines (it joins and extends any run) and scatter
 * anywhere (3+ pay and award free spins). In free games `es` is the expanding
 * symbol: it is excluded from ordinary line runs unless wilds lead the line,
 * and instead collects anywhere on the grid, paying its line pay on all 10
 * lines at once. Amounts in TOTAL-bet multiples.
 */
export function evaluate(grid: Grid, es: PaySymbol | null = null): SpinResult {
  const lineWins: LineWin[] = [];

  for (let li = 0; li < LINES; li++) {
    const line = PAYLINES[li];
    // syml: the first non-wild symbol, which the run pays as.
    // leadingWilds: whether any PAPYRUS came before syml was found.
    let syml: PaySymbol | null = null;
    let leadingWilds = false;
    let count = REELS;
    for (let x = 0; x < REELS; x++) {
      const s = grid[x][line[x]];
      if (s === 'PAPYRUS') {
        if (syml === null) leadingWilds = true;
        // otherwise the wild simply continues the run
      } else if (syml === null) {
        if (s === es && !leadingWilds) {
          // The expanding symbol only pays through its own grid-wide collect
          // when it starts a line by itself (slotopol's ES break rule).
          syml = null;
          count = 0;
          break;
        }
        syml = s;
      } else if (s !== syml) {
        count = x;
        break;
      }
    }

    if (syml !== null && count >= 2) {
      const payl = LINE_PAY[syml][count - 1];
      if (payl > 0) {
        const positions: [number, number][] = [];
        for (let x = 0; x < count; x++) positions.push([x, line[x]]);
        lineWins.push({ line: li, symbol: syml, count, amount: payl / LINES, positions });
      }
    }
  }

  // The expanding symbol collects anywhere on the grid, on every line at once.
  let expandingWin: ExpandingWin | undefined;
  if (es !== null) {
    const cells: [number, number][] = [];
    for (let x = 0; x < REELS; x++) {
      for (let y = 0; y < ROWS; y++) {
        if (grid[x][y] === es) cells.push([x, y]);
      }
    }
    if (cells.length >= 2) {
      const paye = LINE_PAY[es][cells.length - 1];
      if (paye > 0) {
        // paye per line-bet on all LINES lines = paye in total-bet multiples.
        expandingWin = { symbol: es, count: cells.length, amount: paye, positions: cells };
      }
    }
  }

  const scatters: [number, number][] = [];
  for (let x = 0; x < REELS; x++) {
    for (let y = 0; y < ROWS; y++) {
      if (grid[x][y] === 'PAPYRUS') scatters.push([x, y]);
    }
  }
  let scatterWin: ScatterWin | undefined;
  let freeSpinsWon = 0;
  if (scatters.length >= 3) {
    scatterWin = { count: scatters.length, amount: SCAT_PAY[scatters.length - 1], positions: scatters };
    freeSpinsWon = FREE_SPINS_AWARD;
  }

  let totalWin = (scatterWin?.amount ?? 0) + (expandingWin?.amount ?? 0);
  for (const w of lineWins) totalWin += w.amount;

  return { grid, lineWins, scatterWin, expandingWin, freeSpinsWon, totalWin };
}
