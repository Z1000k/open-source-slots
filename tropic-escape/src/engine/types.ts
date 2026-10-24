/**
 * TROPIC ESCAPE — 5x3, 9-line beach slot with a doubling wild and 45 free games.
 *
 * Math ported 1:1 from slotopol/server (MIT), game/slot/novomatic/bananasgobahamas:
 * same reel strips, paytable, bet lines, wild-doubles rule, scatter pays and
 * free games with retriggers, so the published RTP figures carry over. Art,
 * name and presentation are our own.
 */

/** Every symbol that can pay on a line. BANANA is also the wild. */
export type PaySymbol =
  | 'BANANA' // slotopol sym 1, wild, top pay
  | 'STRAWBERRY' // 2
  | 'MELON' // 3
  | 'PINEAPPLE' // 4
  | 'MANGO' // 5
  | 'COCONUT' // 6
  | 'ACE' // 7
  | 'KING' // 8
  | 'QUEEN' // 9
  | 'JACK' // 10
  | 'TEN' // 11
  | 'NINE'; // 12

export type SymbolId = PaySymbol | 'SUITCASE'; // 13, scatter

/** Index order matches the slotopol numeric symbol ids (1-based). */
export const SYMBOL_ORDER: SymbolId[] = [
  'BANANA',
  'STRAWBERRY',
  'MELON',
  'PINEAPPLE',
  'MANGO',
  'COCONUT',
  'ACE',
  'KING',
  'QUEEN',
  'JACK',
  'TEN',
  'NINE',
  'SUITCASE',
];

/** The wild. It substitutes for every symbol and pays on its own too. */
export const WILD: SymbolId = 'BANANA';
/** The scatter. Pays anywhere from 2, and 3+ start the free games. */
export const SCATTER: SymbolId = 'SUITCASE';

export const REELS = 5;
export const ROWS = 3;
export const LINES = 9;

/** A win a wild helped complete is doubled (a run of wilds alone is not). */
export const WILD_MULT = 2;

/** Free games for 3+ SUITCASE, and again on every retrigger. */
export const FREE_SPINS_AWARD = 45;

/**
 * Best possible SINGLE spin in total-bet multiples: 9120 line-bets, measured
 * by enumerating every one of the 102,564,030 stop combinations the shipped
 * strips allow (src/sim/exact.ts). Informational: like the original math there
 * is no cap mechanic, a free games session stacks 45+ of these spins and
 * retriggers stack without limit.
 */
export const MAX_WIN = 9120 / 9;

/** grid[reel][row], 5x3 */
export type Grid = SymbolId[][];

export interface LineWin {
  /** payline index (0-based) */
  line: number;
  /** the symbol the run pays as (BANANA when the run is wilds only) */
  symbol: PaySymbol;
  /** leftmost run length (2-5), wilds included */
  count: number;
  /** 2 when a wild completed the run, else 1 */
  mult: number;
  /** value in TOTAL-bet multiples, multiplier already applied */
  amount: number;
  /** [reel, row] cells that form the win */
  positions: [number, number][];
}

export interface ScatterWin {
  /** SUITCASE count anywhere on the grid (2-5) */
  count: number;
  /** value in TOTAL-bet multiples */
  amount: number;
  /** [reel, row] of every SUITCASE */
  positions: [number, number][];
}

export interface SpinResult {
  grid: Grid;
  lineWins: LineWin[];
  scatterWin?: ScatterWin;
  /** free games this spin awards (45 on 3+ SUITCASE, else 0) */
  freeSpinsWon: number;
  /** sum of all wins, in TOTAL-bet multiples */
  totalWin: number;
}

/** The free games: 45 spins on the bonus strips, retriggerable. */
export interface BonusResult {
  spins: SpinResult[];
  /** free games played in total, retriggers included */
  spinsPlayed: number;
  /** number of retriggers that happened (each added 45 more spins) */
  retriggers: number;
  /** total free games win in TOTAL-bet multiples */
  totalWin: number;
}

/** One complete game round: a base spin, plus free games when triggered. */
export interface RoundResult {
  baseSpin: SpinResult;
  bonus?: BonusResult;
  /** total round win in TOTAL-bet multiples */
  totalWin: number;
}
