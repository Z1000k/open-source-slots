/**
 * DISCOVERY VOYAGE — 5x3, 10-line voyage slot with a CAPTAIN wild and 10 free
 * games in which the GALLEON scatter turns wild as well.
 *
 * Math ported 1:1 from slotopol/server (MIT), game/slot/novomatic/columbus:
 * same reel strips, paytable, bet lines, wild rule, and retriggerable free
 * games on their own strips where the scatter also substitutes on the lines,
 * so the published RTP figures carry over. Art, names and presentation are
 * our own.
 */

/** Every symbol that can pay on a line. CAPTAIN is also the wild. */
export type PaySymbol =
  | 'CAPTAIN' // slotopol sym 1, wild, top pay
  | 'CROWN' // 2
  | 'CHEST' // 3
  | 'COMPASS' // 4
  | 'ACE' // 5
  | 'KING' // 6
  | 'QUEEN' // 7
  | 'JACK' // 8
  | 'TEN'; // 9

export type SymbolId = PaySymbol | 'GALLEON'; // 10, scatter

/** Index order matches the slotopol numeric symbol ids (1-based). */
export const SYMBOL_ORDER: SymbolId[] = [
  'CAPTAIN',
  'CROWN',
  'CHEST',
  'COMPASS',
  'ACE',
  'KING',
  'QUEEN',
  'JACK',
  'TEN',
  'GALLEON',
];

/** The wild. It substitutes for every symbol but the scatter and pays on its own too. */
export const WILD: SymbolId = 'CAPTAIN';
/**
 * The scatter. It never pays; 3+ anywhere start the free games, and during
 * the free games it is a wild on the lines as well (slotopol's wbon).
 */
export const SCATTER: SymbolId = 'GALLEON';

export const REELS = 5;
export const ROWS = 3;
export const LINES = 10;

/** Free games for 3+ GALLEON, and again on every retrigger. */
export const FREE_SPINS_AWARD = 10;

/**
 * Best possible SINGLE spin in total-bet multiples: 5360 line-bets on a free
 * game, five wilds (captains and galleons mixed) on line 10 for 5000 plus
 * 360 on three more lines; the best paid spin is 527x. Both measured by enumerating every stop
 * combination the shipped strips allow (src/sim/exact.ts). Informational:
 * like the original math there is no cap mechanic, and a free games session
 * stacks 10+ spins with retriggers without limit.
 */
export const MAX_WIN = 5360 / 10;

/** grid[reel][row], 5x3 */
export type Grid = SymbolId[][];

export interface LineWin {
  /** payline index (0-based) */
  line: number;
  /** the symbol the run pays as (CAPTAIN when the run is wilds only) */
  symbol: PaySymbol;
  /** leftmost run length (2-5), wilds included */
  count: number;
  /** value in TOTAL-bet multiples */
  amount: number;
  /** [reel, row] cells that form the win */
  positions: [number, number][];
}

/** 3+ GALLEON: no pay of its own, it starts (or adds to) the free games. */
export interface ScatterHit {
  /** GALLEON count anywhere on the grid (3-5) */
  count: number;
  /** [reel, row] of every GALLEON */
  positions: [number, number][];
}

export interface SpinResult {
  grid: Grid;
  lineWins: LineWin[];
  scatterHit?: ScatterHit;
  /** free games this spin awards (10 on 3+ GALLEON, else 0) */
  freeSpinsWon: number;
  /** true on a free game, where GALLEON is wild on the lines */
  freeGame: boolean;
  /** sum of all wins, in TOTAL-bet multiples */
  totalWin: number;
}

/** The free games: 10 spins on the bonus strips with GALLEON wild, retriggerable. */
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
