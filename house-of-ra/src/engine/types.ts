/**
 * HOUSE OF RA — 5x3, 10-line Egyptian slot. The SUN DISC is wild on the
 * lines and pays as a scatter; 3+ start 10 free games in which the best way
 * on the screen expands over its reels and pays on all 10 lines.
 *
 * Base game ported 1:1 from slotopol/server (MIT), game/slot/novomatic/
 * dynastyofra: same reel strips, paytable, bet lines, wild and scatter
 * rules, so slotopol's published base figures carry over exactly.
 *
 * The free games are NOT slotopol's. Its free-games scan (ScanWaysBon) stops
 * searching too early after a new best win of 3 or 4 and so often pays a
 * smaller way than the best one on the screen, and every RTP slotopol
 * publishes for this game was computed through that defect. Here the best
 * way always pays, and the free-games strips are rebuilt (see
 * config/reelSets.ts) so the whole game lands back on the original set's
 * figure. Art, names and presentation are our own.
 */

/** Every symbol that can pay on a line. */
export type PaySymbol =
  | 'PHARAOH' // slotopol sym 1, top pay
  | 'FALCON' // 2
  | 'ANKH' // 3
  | 'LOTUS' // 4
  | 'COBRA' // 5
  | 'ACE' // 6
  | 'KING' // 7
  | 'QUEEN' // 8
  | 'JACK' // 9
  | 'TEN'; // 10

export type SymbolId = PaySymbol | 'SUNDISC'; // 11, wild and scatter

/** Index order matches the slotopol numeric symbol ids (1-based). */
export const SYMBOL_ORDER: SymbolId[] = [
  'PHARAOH',
  'FALCON',
  'ANKH',
  'LOTUS',
  'COBRA',
  'ACE',
  'KING',
  'QUEEN',
  'JACK',
  'TEN',
  'SUNDISC',
];

/**
 * The SUN DISC: wild on the lines in the base game (it has no line pay of
 * its own, so a line of sun discs alone pays nothing there), and the scatter
 * everywhere: 3, 4 or 5 anywhere pay 2x, 20x or 200x the total bet and award
 * 10 free games. In the free games it is not wild (slotopol's rule).
 */
export const WILD: SymbolId = 'SUNDISC';
export const SCATTER: SymbolId = 'SUNDISC';

export const REELS = 5;
export const ROWS = 3;
export const LINES = 10;

/** Free games for 3+ SUN DISC, and again on every retrigger. */
export const FREE_SPINS_AWARD = 10;

/** grid[reel][row], 5x3 */
export type Grid = SymbolId[][];

export interface LineWin {
  /** payline index (0-based) */
  line: number;
  /** the symbol the line pays as */
  symbol: PaySymbol;
  /** leftmost run length (2-5), wilds included */
  count: number;
  /** value in TOTAL-bet multiples */
  amount: number;
  /** [reel, row] cells that form the win */
  positions: [number, number][];
}

/** 3+ SUN DISC anywhere: a scatter pay, and free games. */
export interface ScatterHit {
  /** SUN DISC count anywhere on the grid (3-5) */
  count: number;
  /** [reel, row] of every SUN DISC */
  positions: [number, number][];
  /** scatter pay in TOTAL-bet multiples (2, 20 or 200) */
  amount: number;
}

/**
 * Free games only: the best way on the screen. Its symbol expands over
 * reels 1..count and the win pays on all 10 lines.
 */
export interface WayWin {
  symbol: PaySymbol;
  /** reels 1..count carry the symbol (3-5, or 2 for the five picture symbols) */
  count: number;
  /** every cell showing the symbol on reels 1..count, before the expansion */
  positions: [number, number][];
  /** value in TOTAL-bet multiples: the line pay times 10 lines */
  amount: number;
}

export interface SpinResult {
  grid: Grid;
  /**
   * Base game: the paying lines. Free games: the way win as it pays, once
   * on each of the 10 lines over the expanded reels.
   */
  lineWins: LineWin[];
  /** free games only, when a way pays */
  wayWin?: WayWin;
  scatterHit?: ScatterHit;
  /** free games this spin awards (10 on 3+ SUN DISC, else 0) */
  freeSpinsWon: number;
  /** true on a free game */
  freeGame: boolean;
  /** sum of all wins, in TOTAL-bet multiples */
  totalWin: number;
}

/** The free games: 10 spins on the free-games strips, retriggerable. */
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
