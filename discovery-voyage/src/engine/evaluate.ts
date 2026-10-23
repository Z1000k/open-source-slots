import type { Grid, LineWin, PaySymbol, ScatterHit, SpinResult, SymbolId } from './types';
import { LINES, REELS, ROWS, SCATTER, WILD } from './types';
import { PAYLINES } from './config/paylines';
import { LINE_PAY, SCAT_FREESPIN } from './config/paytable';

/**
 * Score a landed grid. Port of slotopol columbus's ScanLined + ScanScatters.
 *
 * CAPTAIN is wild: it joins any run from the left, and a run of captains on
 * its own pays as the top symbol. Each line is paid whichever is worth more,
 * the substituted run or the plain captain run (the captains on a tie, as
 * slotopol does; the amount is the same). GALLEON is the scatter: it never
 * pays, 3+ anywhere award the free games. On a free game (slotopol's
 * FSR > 0) GALLEON is ALSO wild on the lines, joining runs and counting
 * towards a wild run exactly like CAPTAIN. Amounts in TOTAL-bet multiples.
 */
export function evaluate(grid: Grid, freeGame = false): SpinResult {
  const lineWins: LineWin[] = [];

  for (let li = 0; li < LINES; li++) {
    const line = PAYLINES[li];
    // syml: the first non-wild symbol, which the substituted run pays as.
    // numw: length of the leading run of wilds. numl: length of the run
    // syml makes (wilds inside it included), 5 when the line never breaks.
    let syml: SymbolId | null = null;
    let numw = 0;
    let numl = REELS;
    for (let x = 1; x <= REELS; x++) {
      const s = grid[x - 1][line[x - 1]];
      if (s === WILD || (freeGame && s === SCATTER)) {
        if (syml === null) numw = x;
      } else if (syml === null) {
        syml = s;
      } else if (s !== syml) {
        numl = x - 1;
        break;
      }
    }

    const payw = numw >= 2 ? LINE_PAY[WILD][numw - 1] : 0;
    const payl = numl >= 2 && syml !== null ? LINE_PAY[syml][numl - 1] : 0;

    if (payl > payw) {
      const positions: [number, number][] = [];
      for (let x = 0; x < numl; x++) positions.push([x, line[x]]);
      lineWins.push({ line: li, symbol: syml as PaySymbol, count: numl, amount: payl / LINES, positions });
    } else if (payw > 0) {
      const positions: [number, number][] = [];
      for (let x = 0; x < numw; x++) positions.push([x, line[x]]);
      lineWins.push({ line: li, symbol: WILD as PaySymbol, count: numw, amount: payw / LINES, positions });
    }
  }

  const scatters: [number, number][] = [];
  for (let x = 0; x < REELS; x++) {
    for (let y = 0; y < ROWS; y++) {
      if (grid[x][y] === SCATTER) scatters.push([x, y]);
    }
  }
  // slotopol: count >= 3 awards 10, however many there are (the table stops at 5).
  const freeSpinsWon =
    scatters.length > 0 ? SCAT_FREESPIN[Math.min(scatters.length, SCAT_FREESPIN.length) - 1] : 0;
  const scatterHit: ScatterHit | undefined =
    freeSpinsWon > 0 ? { count: scatters.length, positions: scatters } : undefined;

  let totalWin = 0;
  for (const w of lineWins) totalWin += w.amount;

  return { grid, lineWins, scatterHit, freeSpinsWon, freeGame, totalWin };
}
