import type { Grid, LineWin, PaySymbol, ScatterWin, SpinResult, SymbolId } from './types';
import { LINES, REELS, ROWS, SCATTER, WILD, WILD_MULT } from './types';
import { PAYLINES } from './config/paylines';
import { LINE_PAY, SCAT_FREESPIN, SCAT_PAY } from './config/paytable';

/**
 * Score a landed grid. Port of slotopol bananasgobahamas' ScanLined +
 * ScanScatters.
 *
 * BANANA is wild: it joins any run from the left and doubles what that run
 * pays, and a run of bananas on its own pays as the top symbol. Each line is
 * paid whichever is worth more, the doubled substituted run or the plain
 * banana run. SUITCASE is the scatter: 2+ anywhere pay, 3+ also start the free
 * games. Amounts in TOTAL-bet multiples.
 */
export function evaluate(grid: Grid): SpinResult {
  const lineWins: LineWin[] = [];

  for (let li = 0; li < LINES; li++) {
    const line = PAYLINES[li];
    // syml: the first non-wild symbol, which the substituted run pays as.
    // numw: length of the leading run of wilds. numl: length of the run
    // syml makes (wilds inside it included), 5 when the line never breaks.
    let syml: SymbolId | null = null;
    let numw = 0;
    let numl = REELS;
    let mw = 1;
    for (let x = 1; x <= REELS; x++) {
      const s = grid[x - 1][line[x - 1]];
      if (s === WILD) {
        if (syml === null) numw = x;
        mw = WILD_MULT;
      } else if (syml === null) {
        syml = s;
      } else if (s !== syml) {
        numl = x - 1;
        break;
      }
    }

    const payw = numw >= 2 ? LINE_PAY[WILD][numw - 1] : 0;
    const payl = numl >= 2 && syml !== null ? LINE_PAY[syml][numl - 1] : 0;

    if (payl * mw > payw) {
      const positions: [number, number][] = [];
      for (let x = 0; x < numl; x++) positions.push([x, line[x]]);
      lineWins.push({
        line: li,
        symbol: syml as PaySymbol,
        count: numl,
        mult: mw,
        amount: (payl * mw) / LINES,
        positions,
      });
    } else if (payw > 0) {
      const positions: [number, number][] = [];
      for (let x = 0; x < numw; x++) positions.push([x, line[x]]);
      lineWins.push({
        line: li,
        symbol: WILD as PaySymbol,
        count: numw,
        mult: 1,
        amount: payw / LINES,
        positions,
      });
    }
  }

  const scatters: [number, number][] = [];
  for (let x = 0; x < REELS; x++) {
    for (let y = 0; y < ROWS; y++) {
      if (grid[x][y] === SCATTER) scatters.push([x, y]);
    }
  }
  let scatterWin: ScatterWin | undefined;
  let freeSpinsWon = 0;
  if (scatters.length >= 2) {
    scatterWin = {
      count: scatters.length,
      amount: SCAT_PAY[scatters.length - 1],
      positions: scatters,
    };
    freeSpinsWon = SCAT_FREESPIN[scatters.length - 1];
  }

  let totalWin = scatterWin?.amount ?? 0;
  for (const w of lineWins) totalWin += w.amount;

  return { grid, lineWins, scatterWin, freeSpinsWon, totalWin };
}
