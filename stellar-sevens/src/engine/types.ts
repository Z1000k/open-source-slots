/**
 * STELLAR SEVENS — classic 3x3 fruit slot.
 *
 * Math ported 1:1 from slotopol/server (MIT), game/slot/novomatic/alwayshot:
 * same reel strips, paytable and bet lines, so the published RTP figures carry
 * over. Art, name and presentation are our own.
 */

/** All 9 symbols pay on lines; there is no scatter, no wild and no feature. */
export type SymbolId =
  | 'SEVEN' // slotopol sym 1
  | 'STAR' // 2
  | 'MELON' // 3
  | 'GRAPES' // 4
  | 'BELL' // 5
  | 'ORANGE' // 6
  | 'PLUM' // 7
  | 'LEMON' // 8
  | 'CHERRY'; // 9

/** Index order matches the slotopol numeric symbol ids (1-based). */
export const SYMBOL_ORDER: SymbolId[] = [
  'SEVEN',
  'STAR',
  'MELON',
  'GRAPES',
  'BELL',
  'ORANGE',
  'PLUM',
  'LEMON',
  'CHERRY',
];

export const REELS = 3;
export const ROWS = 3;
export const LINES = 5;

/**
 * Best possible round in total-bet multiples, proven by exact enumeration of
 * the active reels (see src/sim/exact.ts). Informational; the game has no cap
 * mechanic.
 */
export const MAX_WIN = 300;

/** grid[reel][row], 3x3 */
export type Grid = SymbolId[][];

export interface LineWin {
  /** payline index (0-based) */
  line: number;
  symbol: SymbolId;
  /** always 3: only full lines pay */
  count: number;
  /** value in TOTAL-bet multiples */
  amount: number;
  /** [reel, row] cells that form the win */
  positions: [number, number][];
}

export interface SpinResult {
  grid: Grid;
  lineWins: LineWin[];
  /** sum of all wins, in TOTAL-bet multiples */
  totalWin: number;
}

/** One complete game round. Stateless: no bonus, no held wins. */
export interface RoundResult {
  baseSpin: SpinResult;
  /** total round win in TOTAL-bet multiples */
  totalWin: number;
}
