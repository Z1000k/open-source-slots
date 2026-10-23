import type { Grid, LineWin, PaySymbol, ScatterHit, SpinResult, SymbolId, WayWin } from './types';
import { LINES, REELS, ROWS, SCATTER, SYMBOL_ORDER, WILD } from './types';
import { PAYLINES } from './config/paylines';
import { LINE_PAY, SCAT_FREESPIN, SCAT_PAY } from './config/paytable';

/**
 * Score a landed grid. Amounts in TOTAL-bet multiples.
 *
 * Base game: port of slotopol dynastyofra's ScanLinedReg + ScanScatters.
 * The SUN DISC is wild: it joins any run from the left and is skipped
 * wherever it sits, so a line pays as its first other symbol for as far as
 * that symbol (with sun discs between) reaches. The SUN DISC has no line pay
 * of its own, so a line of sun discs alone pays nothing.
 *
 * Free games: the best way. Every reel may use any of its 3 rows (243
 * ways), a way pays its run from reel 1 like a line, and the single best
 * paying way expands over its reels and pays on all 10 lines. The SUN DISC
 * is not wild here (slotopol's rule). Because a longer run never pays less,
 * the best way for a symbol is simply how many reels in a row, from reel 1,
 * show it anywhere; the best symbol wins, a tie going to the higher symbol
 * (same amount). slotopol's own scan (ScanWaysBon) gives up early after a
 * new best of 3 or 4 and underpays 1 free spin in 15; this pays the best.
 *
 * Both: 3+ SUN DISC anywhere pay 2x / 20x / 200x the total bet and award
 * 10 free games.
 */
export function evaluate(grid: Grid, freeGame = false): SpinResult {
  const lineWins: LineWin[] = [];
  let wayWin: WayWin | undefined;

  if (!freeGame) {
    for (let li = 0; li < LINES; li++) {
      const line = PAYLINES[li];
      // syml: the first symbol that is not a SUN DISC; numl: how far its run
      // reaches with sun discs substituting, 5 when the line never breaks.
      let syml: SymbolId | null = null;
      let numl = REELS;
      for (let x = 0; x < REELS; x++) {
        const s = grid[x][line[x]];
        if (s === WILD) continue;
        if (syml === null) syml = s;
        else if (s !== syml) {
          numl = x;
          break;
        }
      }
      if (syml === null) continue;
      const pay = LINE_PAY[syml][numl - 1];
      if (pay > 0) {
        const positions: [number, number][] = [];
        for (let x = 0; x < numl; x++) positions.push([x, line[x]]);
        lineWins.push({ line: li, symbol: syml as PaySymbol, count: numl, amount: pay / LINES, positions });
      }
    }
  } else {
    wayWin = bestWay(grid);
    if (wayWin) {
      for (let li = 0; li < LINES; li++) {
        const line = PAYLINES[li];
        const positions: [number, number][] = [];
        for (let x = 0; x < wayWin.count; x++) positions.push([x, line[x]]);
        lineWins.push({
          line: li,
          symbol: wayWin.symbol,
          count: wayWin.count,
          amount: wayWin.amount / LINES,
          positions,
        });
      }
    }
  }

  const scatters: [number, number][] = [];
  for (let x = 0; x < REELS; x++) {
    for (let y = 0; y < ROWS; y++) {
      if (grid[x][y] === SCATTER) scatters.push([x, y]);
    }
  }
  // slotopol indexes its tables by count; the strips never show more than 5.
  const k = Math.min(scatters.length, SCAT_PAY.length);
  const freeSpinsWon = k > 0 ? SCAT_FREESPIN[k - 1] : 0;
  const scatPay = k > 0 ? SCAT_PAY[k - 1] : 0;
  const scatterHit: ScatterHit | undefined =
    scatPay > 0 || freeSpinsWon > 0 ? { count: scatters.length, positions: scatters, amount: scatPay } : undefined;

  let totalWin = scatPay;
  for (const w of lineWins) totalWin += w.amount;

  return { grid, lineWins, wayWin, scatterHit, freeSpinsWon, freeGame, totalWin };
}

/** The best paying way on a free-games grid, or undefined when none pays. */
function bestWay(grid: Grid): WayWin | undefined {
  let best: WayWin | undefined;
  for (const sym of SYMBOL_ORDER) {
    if (sym === SCATTER) continue; // no line pay
    let count = 0;
    while (count < REELS && grid[count].includes(sym)) count++;
    if (count === 0) continue;
    const pay = LINE_PAY[sym][count - 1];
    if (pay > 0 && (best === undefined || pay > best.amount)) {
      const positions: [number, number][] = [];
      for (let x = 0; x < count; x++) {
        for (let y = 0; y < ROWS; y++) if (grid[x][y] === sym) positions.push([x, y]);
      }
      // line pay on each of the 10 lines = pay line-bets x 10 = pay total bets
      best = { symbol: sym as PaySymbol, count, positions, amount: pay };
    }
  }
  return best;
}
