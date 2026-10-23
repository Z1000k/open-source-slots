import type { Expansion, Grid, LineWin, PaySymbol, ScatterHit, SpinResult, SymbolId } from './types';
import { BLANK, LINES, REELS, ROWS, SCATTER, WILD } from './types';
import { PAYLINES } from './config/paylines';
import { LINE_PAY, SCAT_FREESPIN, SCAT_PAY } from './config/paytable';

/**
 * Score a landed grid. Port of slotopol fairyqueen's ScanLined + ScanScatters;
 * the free games score exactly like the base game, the expanding symbol is
 * already on the grid (see spin.ts). Amounts in TOTAL-bet multiples.
 *
 * The ENCHANTRESS is wild: she joins any run from the left, and a run of
 * enchantresses on its own pays as the top symbol. Each line is paid
 * whichever is worth more, the substituted run or the plain enchantress run
 * (her run on a tie, as slotopol does; the amount is the same). She never
 * doubles a win.
 *
 * The BLANK is an ordinary symbol here that pays nothing, so a line starting
 * on a BLANK (or on the LANTERN) never pays. slotopol's live ScanLined reads
 * its blank (sym 0) as "no symbol yet" instead, which lets a line skip two
 * blanks and pay from reel 3; its printed par sheet has the LANTERN cover
 * paying 0 on the lines, which is this rule, and src/sim/exact.ts proves it.
 *
 * The LANTERN is the scatter: 2+ anywhere pay 2x / 5x / 75x / 750x the total
 * bet, 3+ award 10 free games.
 */
export function evaluate(grid: Grid, expand?: Expansion): SpinResult {
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
      if (s === WILD) {
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
  // slotopol indexes its tables by count; no grid can show more than 5
  // (one per reel at most, which src/sim/checkReels.ts proves).
  const k = Math.min(scatters.length, SCAT_PAY.length);
  const scatPay = k > 0 ? SCAT_PAY[k - 1] : 0;
  const freeSpinsWon = k > 0 ? SCAT_FREESPIN[k - 1] : 0;
  const scatterHit: ScatterHit | undefined =
    scatPay > 0 || freeSpinsWon > 0 ? { count: scatters.length, positions: scatters, amount: scatPay } : undefined;

  let totalWin = scatPay;
  for (const w of lineWins) totalWin += w.amount;

  return { grid, lineWins, scatterHit, freeSpinsWon, freeGame: expand !== undefined, expand, totalWin };
}

/**
 * Read a free game's expansion back off its grid: the leading reels that are
 * one symbol top to bottom, or the LANTERN between two BLANKs. Exact, because
 * no free-games strip ever shows three of one symbol in a window and no strip
 * holds a BLANK (src/sim/checkReels.ts proves both), so a spun reel can never
 * pass for a covered one. The board uses this: it is handed grids only.
 */
export function expansionOf(grid: Grid): Expansion | undefined {
  const covered = (col: SymbolId[]): SymbolId | null => {
    if (col[0] === BLANK && col[1] === SCATTER && col[2] === BLANK) return SCATTER;
    if (col[0] !== BLANK && col[0] === col[1] && col[1] === col[2]) return col[0];
    return null;
  };
  const symbol = covered(grid[0]);
  if (symbol === null) return undefined;
  let reels = 1;
  while (reels < REELS && covered(grid[reels]) === symbol) reels++;
  return reels >= 2 ? { symbol, reels } : undefined;
}
