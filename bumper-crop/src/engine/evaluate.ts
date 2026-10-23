import type { Grid, LineWin, PaySymbol, ScatterWin, SymbolId } from './types';
import { LINES, REELS, ROWS, SCATTER, WILD } from './types';
import { PAYLINES } from './config/paylines';
import { LINE_PAY, SCAT_PAY } from './config/paytable';

export interface Scan {
  lineWins: LineWin[];
  scatterWin?: ScatterWin;
  /** true when the scatter win opens the barn ladder */
  bonusTriggered: boolean;
  /** sum of line and scatter pays, in TOTAL-bet multiples, bonus excluded */
  win: number;
}

/**
 * Score a landed grid. Port of slotopol cashfarm's ScanLined + ScanScatters.
 *
 * SCARECROW is wild: it substitutes for anything on a line, and it also scores
 * on its own as a run of leading wilds. Each line pays the better of those two
 * readings, never both, exactly as the original does it. TRACTOR is scatter:
 * 3 or more anywhere pay by count and open the bonus.
 *
 * Amounts are in TOTAL-bet multiples.
 */
export function evaluate(grid: Grid): Scan {
  const lineWins: LineWin[] = [];

  for (let li = 0; li < LINES; li++) {
    const line = PAYLINES[li];
    // wilds: length of the opening run of wilds, scored as a SCARECROW win.
    // syml/count: the first non-wild symbol and its run, wilds counting in.
    // syml can be the TRACTOR, which simply has no line pay (slotopol keeps an
    // empty row for it), so a line of tractors scores nothing here and is paid
    // by the scatter rule instead.
    let wilds = 0;
    let syml: SymbolId | null = null;
    let count = REELS;
    for (let x = 0; x < REELS; x++) {
      const s = grid[x][line[x]];
      if (s === WILD) {
        if (syml === null) wilds = x + 1;
      } else if (syml === null) {
        syml = s;
      } else if (s !== syml) {
        count = x;
        break;
      }
    }

    const payWild = wilds >= 3 ? LINE_PAY[WILD as PaySymbol][wilds - 1] : 0;
    const paySym =
      count >= 3 && syml !== null && syml !== SCATTER ? LINE_PAY[syml as PaySymbol][count - 1] : 0;

    const push = (symbol: PaySymbol, n: number, pay: number) => {
      const positions: [number, number][] = [];
      for (let x = 0; x < n; x++) positions.push([x, line[x]]);
      lineWins.push({ line: li, symbol, count: n, amount: pay / LINES, positions });
    };

    if (paySym > payWild) push(syml as PaySymbol, count, paySym);
    else if (payWild > 0) push(WILD as PaySymbol, wilds, payWild);
  }

  const scatters: [number, number][] = [];
  for (let x = 0; x < REELS; x++) {
    for (let y = 0; y < ROWS; y++) {
      if (grid[x][y] === SCATTER) scatters.push([x, y]);
    }
  }

  let scatterWin: ScatterWin | undefined;
  if (scatters.length >= 3) {
    scatterWin = {
      count: scatters.length,
      amount: SCAT_PAY[scatters.length - 1],
      positions: scatters,
    };
  }

  let win = scatterWin?.amount ?? 0;
  for (const w of lineWins) win += w.amount;

  return { lineWins, scatterWin, bonusTriggered: scatterWin !== undefined, win };
}

/** Every cell that pays on this scan, and so is cleared before the next fall. */
export function clearedCells(scan: Scan): [number, number][] {
  const seen = new Set<number>();
  const cells: [number, number][] = [];
  const add = ([x, y]: [number, number]) => {
    const key = x * ROWS + y;
    if (seen.has(key)) return;
    seen.add(key);
    cells.push([x, y]);
  };
  for (const w of scan.lineWins) w.positions.forEach(add);
  scan.scatterWin?.positions.forEach(add);
  return cells;
}
