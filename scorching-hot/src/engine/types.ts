/**
 * SCORCHING HOT — classic 5x3 fruit slot.
 *
 * Math ported 1:1 from slotopol/server (MIT), game/slot/novomatic/sizzlinghot:
 * same reel strips, paytable, bet lines and scatter rule, so the published
 * RTP figures carry over. Art, name and presentation are our own.
 */

/** Paying symbols. STAR is the scatter and never pays on a line. */
export type PaySymbol =
  | 'SEVEN' // slotopol sym 1
  | 'MELON' // 2
  | 'GRAPES' // 3
  | 'PLUM' // 4
  | 'ORANGE' // 5
  | 'LEMON' // 6
  | 'CHERRY'; // 7

export type SymbolId = PaySymbol | 'STAR'; // 8, scatter

/** Index order matches the slotopol numeric symbol ids (1-based). */
export const SYMBOL_ORDER: SymbolId[] = [
  'SEVEN',
  'MELON',
  'GRAPES',
  'PLUM',
  'ORANGE',
  'LEMON',
  'CHERRY',
  'STAR',
];

export const REELS = 5;
export const ROWS = 3;
export const LINES = 5;

/**
 * Best possible round in total-bet multiples: a full screen of SEVENs pays
 * all 5 lines at 5000 per-line-bet = 25000 / 5 lines. Informational; the
 * game has no cap mechanic.
 */
export const MAX_WIN = 5000;

/** grid[reel][row], 5x3 */
export type Grid = SymbolId[][];

export interface LineWin {
  /** payline index (0-based) */
  line: number;
  symbol: PaySymbol;
  /** leftmost run length (2-5) */
  count: number;
  /** value in TOTAL-bet multiples */
  amount: number;
  /** [reel, row] cells that form the win */
  positions: [number, number][];
}

export interface ScatterWin {
  /** STAR count anywhere on the grid (3-5) */
  count: number;
  /** value in TOTAL-bet multiples */
  amount: number;
  /** [reel, row] of every STAR */
  positions: [number, number][];
}

export interface SpinResult {
  grid: Grid;
  lineWins: LineWin[];
  scatterWin?: ScatterWin;
  /** sum of all wins, in TOTAL-bet multiples */
  totalWin: number;
}

/** One complete game round. Stateless: no bonus, no held wins. */
export interface RoundResult {
  baseSpin: SpinResult;
  /** total round win in TOTAL-bet multiples */
  totalWin: number;
}
