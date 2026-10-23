import type { Grid, LineWin, PaySymbol, ScatterHit, SpinResult, SymbolId } from './types';
import { LINES, REELS, ROWS, SCATTER, WILD } from './types';
import { PAYLINES } from './config/paylines';
import { LINE_PAY, SCAT_FREESPIN, SCAT_MIN, SCAT_PAY } from './config/paytable';

/**
 * The reels a SAMURAI turns wild in a free game: every reel that shows him
 * anywhere (slotopol katana's reelwild). 0-based, ascending. The board uses
 * this too, since it is handed grids only.
 */
export function wildReelsOf(grid: Grid): number[] {
  const out: number[] = [];
  for (let x = 0; x < REELS; x++) if (grid[x].includes(WILD)) out.push(x);
  return out;
}

/**
 * Score a landed grid. Port of slotopol katana's ScanLined + ScanScatters.
 * Amounts in TOTAL-bet multiples (a line pay is in line bets, so / LINES).
 *
 * The SAMURAI is wild: he joins any run from the left, and a run of samurai
 * on its own pays as the top symbol. Each line is paid whichever is worth
 * more, the substituted run or the plain samurai run (his run on a tie, as
 * slotopol does; the amount is the same). Runs pay from 3 of a kind. He never
 * doubles a win.
 *
 * In a free game a reel that shows a SAMURAI anywhere is wild top to bottom:
 * every line crossing it reads a wild there. The grid itself is left as it
 * landed; the scatter count reads the landed grid, as slotopol's SymNum does
 * (no free-games window shows a SAMURAI and a GONG together, which
 * src/sim/checkReels.ts proves, so a wild reel never hides a GONG).
 *
 * The GONG is the scatter: 3+ anywhere pay 2x / 20x / 200x the total bet and
 * award 10 free games, in the base game and in the free games alike.
 */
export function evaluate(grid: Grid, freeGame = false): SpinResult {
  const wildReels = freeGame ? wildReelsOf(grid) : [];
  const reelWild: boolean[] = new Array(REELS).fill(false);
  for (const x of wildReels) reelWild[x] = true;

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
      if (s === WILD || reelWild[x - 1]) {
        if (syml === null) numw = x;
      } else if (syml === null) {
        syml = s;
      } else if (s !== syml) {
        numl = x - 1;
        break;
      }
    }

    const payw = numw >= 3 ? LINE_PAY[WILD][numw - 1] : 0;
    const payl = numl >= 3 && syml !== null ? LINE_PAY[syml][numl - 1] : 0;

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
  // slotopol indexes its tables by count; no grid can show more than 5
  // (one per reel at most, which src/sim/checkReels.ts proves).
  let scatterHit: ScatterHit | undefined;
  let freeSpinsWon = 0;
  if (scatters.length >= SCAT_MIN) {
    const k = Math.min(scatters.length, SCAT_PAY.length);
    scatterHit = { count: scatters.length, positions: scatters, amount: SCAT_PAY[k - 1] };
    freeSpinsWon = SCAT_FREESPIN[k - 1];
  }

  let totalWin = scatterHit?.amount ?? 0;
  for (const w of lineWins) totalWin += w.amount;

  return { grid, lineWins, scatterHit, freeSpinsWon, freeGame, wildReels, totalWin };
}
