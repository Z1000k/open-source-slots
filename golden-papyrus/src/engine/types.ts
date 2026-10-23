/**
 * GOLDEN PAPYRUS — 5x3, 10-line Egyptian book slot with free games.
 *
 * Math ported 1:1 from slotopol/server (MIT), game/slot/novomatic/bookofra:
 * same reel strips, paytable, bet lines, wild/scatter book rule and expanding
 * symbol free games, so the published RTP figures carry over. Art, name and
 * presentation are our own.
 */

/** Paying symbols. PAPYRUS is wild AND scatter and never pays on a line. */
export type PaySymbol =
  | 'EXPLORER' // slotopol sym 1
  | 'MUMMY' // 2
  | 'ANUBIS' // 3 (statue)
  | 'SCARAB' // 4
  | 'ACE' // 5
  | 'KING' // 6
  | 'QUEEN' // 7
  | 'JACK' // 8
  | 'TEN'; // 9

export type SymbolId = PaySymbol | 'PAPYRUS'; // 10, wild + scatter

/** Index order matches the slotopol numeric symbol ids (1-based). */
export const SYMBOL_ORDER: SymbolId[] = [
  'EXPLORER',
  'MUMMY',
  'ANUBIS',
  'SCARAB',
  'ACE',
  'KING',
  'QUEEN',
  'JACK',
  'TEN',
  'PAPYRUS',
];

export const REELS = 5;
export const ROWS = 3;
export const LINES = 10;

/** Free spins for 3+ PAPYRUS, and again for every retrigger. */
export const FREE_SPINS_AWARD = 10;

/**
 * Best possible SINGLE spin in total-bet multiples: 10 lines of 5 EXPLORERs
 * pay 10 x 5000 per-line-bet = 5000x total bet; a free spin with EXPLORER
 * expanding can double that to 10000x. Informational; like the original math
 * there is no cap mechanic, and retriggers stack without limit.
 */
export const MAX_WIN = 10000;

/** grid[reel][row], 5x3 */
export type Grid = SymbolId[][];

export interface LineWin {
  /** payline index (0-based) */
  line: number;
  /** the paying symbol (wilds joined the run and count toward it) */
  symbol: PaySymbol;
  /** leftmost run length (2-5), wilds included */
  count: number;
  /** value in TOTAL-bet multiples */
  amount: number;
  /** [reel, row] cells that form the win */
  positions: [number, number][];
}

export interface ScatterWin {
  /** PAPYRUS count anywhere on the grid (3-5) */
  count: number;
  /** value in TOTAL-bet multiples */
  amount: number;
  /** [reel, row] of every PAPYRUS */
  positions: [number, number][];
}

/**
 * The expanding symbol payout inside free games: when the chosen symbol lands
 * on enough reels it pays like a scatter, on EVERY bet line at once.
 */
export interface ExpandingWin {
  symbol: PaySymbol;
  /** symbol count anywhere on the grid */
  count: number;
  /** value in TOTAL-bet multiples (the per-line pay collected on all 10 lines) */
  amount: number;
  /** [reel, row] of every expanding symbol */
  positions: [number, number][];
}

export interface SpinResult {
  grid: Grid;
  lineWins: LineWin[];
  scatterWin?: ScatterWin;
  /** free games only: the expanding symbol collecting across the grid */
  expandingWin?: ExpandingWin;
  /** free spins this spin awards (10 on 3+ PAPYRUS, else 0) */
  freeSpinsWon: number;
  /** sum of all wins, in TOTAL-bet multiples */
  totalWin: number;
}

/** The free games: 10 spins on the bonus reels with one expanding symbol. */
export interface BonusResult {
  /** the randomly chosen expanding symbol, fixed for the whole bonus */
  expandingSymbol: PaySymbol;
  spins: SpinResult[];
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
