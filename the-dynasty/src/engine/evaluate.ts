import type { Grid, Heir, LineWin, PaySymbol, ScatterHit, SpinResult, SymbolId } from './types';
import { HEIRS, LINES, REELS, ROWS, WILD, otherHeir } from './types';
import { PAYLINES } from './config/paylines';
import { LINE_PAY, RUN_MIN, SCAT_MIN, SCAT_PAY, WILD_MULT, WILD_RUN_MIN } from './config/paytable';

/** [reel, row] of every cell showing `sym`. */
function cellsOf(grid: Grid, sym: SymbolId): [number, number][] {
  const out: [number, number][] = [];
  for (let x = 0; x < REELS; x++) {
    for (let y = 0; y < ROWS; y++) if (grid[x][y] === sym) out.push([x, y]);
  }
  return out;
}

/**
 * The heir a BASE grid calls the free games for: 3+ HEIRESS anywhere, else
 * 3+ HEIR, else null. The board uses this too: main.ts hands it grids only,
 * and the base grid that triggered says whose free games follow.
 */
export function callerOf(grid: Grid): Heir | null {
  for (const heir of HEIRS) if (cellsOf(grid, heir).length >= SCAT_MIN) return heir;
  return null;
}

/**
 * Score a landed grid. Port of slotopol royaldynasty's ScanLinedReg +
 * ScanScattersReg (base game, `caller` null) and ScanLinedBon +
 * ScanScattersBon (a free game called by `caller`). Amounts in TOTAL-bet
 * multiples (a line pay is in line bets, so / LINES).
 *
 * The MONARCH is wild: he joins any run from the left, and a run of his own
 * pays from 2. A run that a wild helps complete pays double. Each line is
 * paid whichever is worth more, the (doubled) substituted run or the plain
 * MONARCH run, which never doubles (his run on a tie, as slotopol does; the
 * amount is the same). Other runs pay from 3 of a kind.
 *
 * The heirs pay nothing on the lines. In the base game 3+ of either heir
 * anywhere call the free games (the HEIRESS checked first) and pay nothing
 * themselves. In a free game the calling heir is the scatter: 3+ anywhere pay
 * 5x / 25x / 500x the total bet and award more free games. The other heir is
 * crowned: on the lines it plays exactly as the MONARCH, wild, doubling, and
 * a run of crowned heirs and MONARCHs pays as the MONARCH's own run.
 *
 * freeSpinsWon is left 0: the number of free games is drawn with the RNG, in
 * playRound(). A scatterHit means free games are awarded.
 */
export function evaluate(grid: Grid, caller: Heir | null = null): SpinResult {
  const crowned: SymbolId | null = caller === null ? null : otherHeir(caller);

  const lineWins: LineWin[] = [];
  for (let li = 0; li < LINES; li++) {
    const line = PAYLINES[li];
    // syml: the first non-wild symbol, which the substituted run pays as.
    // numw: length of the leading run of wilds. numl: length of the run
    // syml makes (wilds inside it included), 5 when the line never breaks.
    // mult: 2 once a wild has been seen before the run breaks.
    let syml: SymbolId | null = null;
    let numw = 0;
    let numl = REELS;
    let mult: 1 | 2 = 1;
    for (let x = 1; x <= REELS; x++) {
      const s = grid[x - 1][line[x - 1]];
      if (s === WILD || s === crowned) {
        if (syml === null) numw = x;
        mult = WILD_MULT;
      } else if (syml === null) {
        syml = s;
      } else if (s !== syml) {
        numl = x - 1;
        break;
      }
    }

    const payw = numw >= WILD_RUN_MIN ? LINE_PAY[WILD][numw - 1] : 0;
    const payl = numl >= RUN_MIN && syml !== null ? LINE_PAY[syml][numl - 1] : 0;

    if (payl * mult > payw) {
      const positions: [number, number][] = [];
      for (let x = 0; x < numl; x++) positions.push([x, line[x]]);
      lineWins.push({
        line: li,
        symbol: syml as PaySymbol,
        count: numl,
        mult,
        amount: (payl * mult) / LINES,
        positions,
      });
    } else if (payw > 0) {
      const positions: [number, number][] = [];
      for (let x = 0; x < numw; x++) positions.push([x, line[x]]);
      lineWins.push({ line: li, symbol: WILD as PaySymbol, count: numw, mult: 1, amount: payw / LINES, positions });
    }
  }

  // slotopol indexes its tables by count; no grid can show more than 5 of
  // one heir (one per reel at most, which src/sim/checkReels.ts proves).
  let scatterHit: ScatterHit | undefined;
  if (caller === null) {
    for (const heir of HEIRS) {
      const at = cellsOf(grid, heir);
      if (at.length >= SCAT_MIN) {
        scatterHit = { symbol: heir, count: at.length, positions: at, amount: 0 };
        break;
      }
    }
  } else {
    const at = cellsOf(grid, caller);
    if (at.length >= SCAT_MIN) {
      const k = Math.min(at.length, SCAT_PAY.length);
      scatterHit = { symbol: caller, count: at.length, positions: at, amount: SCAT_PAY[k - 1] };
    }
  }

  let totalWin = scatterHit?.amount ?? 0;
  for (const w of lineWins) totalWin += w.amount;

  return { grid, lineWins, scatterHit, freeSpinsWon: 0, freeGame: caller !== null, caller, totalWin };
}
