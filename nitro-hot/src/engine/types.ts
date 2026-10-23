/**
 * NITRO HOT — classic 3x3 fruit slot.
 *
 * Math ported 1:1 from slotopol/server (MIT), game/slot/novomatic/ultrahot:
 * same reel strips, paytable, bet lines and full-screen doubler, so the
 * published RTP figures carry over. Art, name and presentation are our own.
 */

/** All 8 symbols pay on lines; there is no scatter and no wild. */
export type SymbolId =
  | 'SEVEN' // slotopol sym 1
  | 'STAR' // 2
  | 'BAR' // 3
  | 'PLUM' // 4
  | 'ORANGE' // 5
  | 'LEMON' // 6
  | 'CHERRY' // 7
  | 'X'; // 8

/** Index order matches the slotopol numeric symbol ids (1-based). */
export const SYMBOL_ORDER: SymbolId[] = [
  'SEVEN',
  'STAR',
  'BAR',
  'PLUM',
  'ORANGE',
  'LEMON',
  'CHERRY',
  'X',
];

/** The four fruits whose full screen doubles every line win (slotopol FillMult). */
export const DOUBLING_FRUITS: readonly SymbolId[] = ['PLUM', 'ORANGE', 'LEMON', 'CHERRY'];

export const REELS = 3;
export const ROWS = 3;
export const LINES = 5;

/**
 * Best possible round in total-bet multiples, proven by exact enumeration of
 * the active reels (see src/sim/exact.ts): the strips land a SEVEN line, a
 * BAR line and a STAR line together, (750 + 60 + 200) / 5 lines = 202.
 * Informational; the game has no cap mechanic.
 */
export const MAX_WIN = 202;

/** grid[reel][row], 3x3 */
export type Grid = SymbolId[][];

export interface LineWin {
  /** payline index (0-based) */
  line: number;
  symbol: SymbolId;
  /** always 3: only full lines pay */
  count: number;
  /** value in TOTAL-bet multiples, full-screen doubler already applied */
  amount: number;
  /** [reel, row] cells that form the win */
  positions: [number, number][];
}

export interface SpinResult {
  grid: Grid;
  lineWins: LineWin[];
  /** 2 when the whole screen is one doubling fruit, otherwise 1 */
  fillMult: 1 | 2;
  /** sum of all wins, in TOTAL-bet multiples */
  totalWin: number;
}

/** One complete game round. Stateless: no bonus, no held wins. */
export interface RoundResult {
  baseSpin: SpinResult;
  /** total round win in TOTAL-bet multiples */
  totalWin: number;
}
