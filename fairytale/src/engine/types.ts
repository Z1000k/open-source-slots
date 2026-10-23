/**
 * FAIRYTALE — 5x3, 10-line storybook slot. The ENCHANTRESS is wild and the
 * top symbol, the LANTERN is the scatter; 3+ LANTERNs start 10 free games in
 * which, before every free spin, one symbol is drawn and covers the first
 * two or three reels whole, so every free game pays.
 *
 * Ported 1:1 from slotopol/server (MIT), game/slot/novomatic/fairyqueen:
 * same reel strips, paytable, bet lines, wild and scatter rules, expanding
 * symbol draw and reel cover counts, so slotopol's published figures carry
 * over exactly. Where slotopol's live server code differs from the par sheet
 * it printed (see evaluate.ts and spin.ts), the par sheet is followed: that
 * is the game every published figure describes. Art, names and presentation
 * are our own.
 */

/** Every symbol that can pay on a line. */
export type PaySymbol =
  | 'ENCHANTRESS' // slotopol sym 1, wild and top pay
  | 'UNICORN' // 2
  | 'GRIFFIN' // 3
  | 'CASTLE' // 4
  | 'SLIPPER' // 5
  | 'MIRROR' // 6
  | 'ACE' // 7
  | 'KING' // 8
  | 'QUEEN' // 9
  | 'JACK' // 10
  | 'TEN' // 11
  | 'NINE'; // 12

/**
 * LANTERN is the scatter (slotopol sym 13). BLANK is slotopol's empty cell
 * (sym 0): it never lands from a strip, it only fills the cells above and
 * below the lantern on a reel the LANTERN covers in the free games. It pays
 * nothing and is not wild, so no line can run through it.
 */
export type SymbolId = PaySymbol | 'LANTERN' | 'BLANK';

/** Index order matches the slotopol numeric symbol ids (1-based); BLANK is 0. */
export const SYMBOL_ORDER: SymbolId[] = [
  'ENCHANTRESS',
  'UNICORN',
  'GRIFFIN',
  'CASTLE',
  'SLIPPER',
  'MIRROR',
  'ACE',
  'KING',
  'QUEEN',
  'JACK',
  'TEN',
  'NINE',
  'LANTERN',
];

/**
 * The ENCHANTRESS: wild on the lines (she joins any run from the left), and a
 * run of her own pays as the top symbol, 10 / 250 / 2500 / 9000 line bets.
 * She never doubles a win.
 */
export const WILD: SymbolId = 'ENCHANTRESS';
/** The LANTERN: 2+ anywhere pay the total bet x 2 / 5 / 75 / 750, 3+ award 10 free games. */
export const SCATTER: SymbolId = 'LANTERN';
export const BLANK: SymbolId = 'BLANK';

export const REELS = 5;
export const ROWS = 3;
export const LINES = 10;

/** Free games for 3+ LANTERN, and again on every retrigger. */
export const FREE_SPINS_AWARD = 10;

/** grid[reel][row], 5x3 */
export type Grid = SymbolId[][];

/**
 * The free games' expanding symbol: drawn before every free spin, it covers
 * reels 1..reels completely. A covering LANTERN shows one lantern in the
 * middle of each of its reels (BLANK above and below), which counts as one
 * scatter per reel; any other symbol fills all three rows.
 */
export interface Expansion {
  symbol: SymbolId;
  /** how many reels from the left it covers: 3, or 2 for the symbols that pay from two */
  reels: number;
}

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

/** 2+ LANTERN anywhere: a scatter pay, and from 3 the free games. */
export interface ScatterHit {
  /** LANTERN count anywhere on the grid (2-5) */
  count: number;
  /** [reel, row] of every LANTERN */
  positions: [number, number][];
  /** scatter pay in TOTAL-bet multiples (2, 5, 75 or 750) */
  amount: number;
}

export interface SpinResult {
  grid: Grid;
  lineWins: LineWin[];
  scatterHit?: ScatterHit;
  /** free games this spin awards (10 on 3+ LANTERN, else 0) */
  freeSpinsWon: number;
  /** true on a free game */
  freeGame: boolean;
  /** free games only: the symbol drawn for this spin and the reels it covers */
  expand?: Expansion;
  /** sum of all wins, in TOTAL-bet multiples */
  totalWin: number;
}

/** The free games: 10 spins with an expanding symbol each, retriggerable. */
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
