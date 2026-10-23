/**
 * SAMURAI — 5x3, 20-line warrior slot. The SAMURAI is wild and the top
 * symbol, the GONG is the scatter; 3+ GONGs start 10 free games on their own
 * reels, in which a SAMURAI anywhere on a reel turns that whole reel wild.
 * Free games retrigger without limit.
 *
 * Ported 1:1 from slotopol/server (MIT), game/slot/novomatic/katana: same
 * reel strips, paytable, bet lines, wild, wild-reel and scatter rules, so
 * slotopol's published figures carry over exactly. Art, names and
 * presentation are our own.
 */

/** Every symbol that can pay on a line. */
export type PaySymbol =
  | 'SAMURAI' // slotopol sym 1, wild and top pay
  | 'DRAGON' // 2
  | 'TIGER' // 3
  | 'ONI' // 4
  | 'HELMET' // 5
  | 'FAN' // 6
  | 'ACE' // 7
  | 'KING' // 8
  | 'QUEEN' // 9
  | 'JACK' // 10
  | 'TEN'; // 11

/** GONG is the scatter (slotopol sym 12); it has no line pay. */
export type SymbolId = PaySymbol | 'GONG';

/** Index order matches the slotopol numeric symbol ids (1-based). */
export const SYMBOL_ORDER: SymbolId[] = [
  'SAMURAI',
  'DRAGON',
  'TIGER',
  'ONI',
  'HELMET',
  'FAN',
  'ACE',
  'KING',
  'QUEEN',
  'JACK',
  'TEN',
  'GONG',
];

/**
 * The SAMURAI: wild on the lines (he joins any run from the left), and a run
 * of his own pays as the top symbol, 100 / 500 / 1000 line bets. He never
 * doubles a win. In the free games he takes his whole reel: every cell of a
 * reel that shows him counts as wild.
 */
export const WILD: SymbolId = 'SAMURAI';
/** The GONG: 3+ anywhere pay the total bet x 2 / 20 / 200 and award 10 free games. */
export const SCATTER: SymbolId = 'GONG';

export const REELS = 5;
export const ROWS = 3;
export const LINES = 20;

/** Free games for 3+ GONG, and again on every retrigger. */
export const FREE_SPINS_AWARD = 10;

/** grid[reel][row], 5x3 */
export type Grid = SymbolId[][];

export interface LineWin {
  /** payline index (0-based) */
  line: number;
  /** the symbol the line pays as */
  symbol: PaySymbol;
  /** leftmost run length (3-5), wilds included */
  count: number;
  /** value in TOTAL-bet multiples */
  amount: number;
  /** [reel, row] cells that form the win */
  positions: [number, number][];
}

/** 3+ GONG anywhere: a scatter pay and the free games. */
export interface ScatterHit {
  /** GONG count anywhere on the grid (3-5) */
  count: number;
  /** [reel, row] of every GONG */
  positions: [number, number][];
  /** scatter pay in TOTAL-bet multiples (2, 20 or 200) */
  amount: number;
}

export interface SpinResult {
  /** the grid exactly as the reels landed (a wild reel still shows its own symbols here) */
  grid: Grid;
  lineWins: LineWin[];
  scatterHit?: ScatterHit;
  /** free games this spin awards (10 on 3+ GONG, else 0) */
  freeSpinsWon: number;
  /** true on a free game */
  freeGame: boolean;
  /** free games only: the reels (0-based, ascending) a SAMURAI turned wild; always empty in the base game */
  wildReels: number[];
  /** sum of all wins, in TOTAL-bet multiples */
  totalWin: number;
}

/** The free games: 10 spins on the free-games reels, retriggerable. */
export interface BonusResult {
  spins: SpinResult[];
  /** free games played in total, retriggers included */
  spinsPlayed: number;
  /** number of retriggers that happened (each added 10 more spins) */
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
